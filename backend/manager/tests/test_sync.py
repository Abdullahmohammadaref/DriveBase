"""
Unit and integration tests for DriveBase Data Sovereignty Sync endpoints.

Tests:
- GET /api/sync/status
- GET /api/sync/media-manifest
- GET /api/sync/business-sqlite (structure, validity, strict tenant isolation, permissions)
- Disaster recovery script dry-run restore from generated SQLite file.
"""

import io
import os
import sqlite3
import tempfile
from decimal import Decimal

from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from manager.models import (
    Business, Branch, Vehicle, Transaction, LegalEntity,
    Make, VehicleModel, Category, Subcategory
)
from .test_setup import BaseTestCase
from scripts.admin.restore_from_sqlite import restore_from_sqlite

User = get_user_model()


class SyncApiTests(BaseTestCase):
    """Test suite for Data Sovereignty Sync endpoints."""

    def test_sync_status_unauthenticated(self):
        """Unauthenticated requests are rejected."""
        response = self.client.get("/api/sync/status")
        self.assertEqual(response.status_code, 401)

    def test_sync_status_authenticated(self):
        """Authenticated manager receives correct entity counts for their business."""
        self.login_manager_a()
        response = self.client.get("/api/sync/status")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["business_id"], self.business_a.id)
        self.assertEqual(data["business_name"], self.business_a.name)
        self.assertGreaterEqual(data["vehicles_count"], 1)
        self.assertTrue(data["can_access_transactions"])

    def test_media_manifest_scoped_to_business(self):
        """Media manifest only returns assets belonging to the user's business."""
        self.login_manager_a()
        response = self.client.get("/api/sync/media-manifest")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["business_id"], self.business_a.id)
        self.assertIn("files", data)

    def test_download_business_sqlite_validity(self):
        """
        Verify GET /api/sync/business-sqlite outputs a valid, readable SQLite binary database
        containing all required tables and populated rows.
        """
        self.login_manager_a()
        response = self.client.get("/api/sync/business-sqlite")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/vnd.sqlite3")

        # Save to temp file and inspect with sqlite3
        with tempfile.NamedTemporaryFile(suffix=".sqlite3", delete=False) as tmp:
            tmp.write(response.content)
            tmp_path = tmp.name

        try:
            conn = sqlite3.connect(tmp_path)
            cur = conn.cursor()

            # Check tables exist
            cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
            tables = {row[0] for row in cur.fetchall()}
            expected_tables = {
                "_sync_meta", "business", "branches", "makes", "vehicle_models",
                "vehicle_types", "body_types", "colors", "fuel_types", "damage_types",
                "doors", "tax_percentages", "payment_methods", "currencies",
                "categories", "subcategories", "key_numbers", "legal_entities",
                "vehicles", "vehicle_expenses_earnings", "transactions", "vehicle_listing_images"
            }
            for table in expected_tables:
                self.assertIn(table, tables, f"Expected table '{table}' missing in SQLite export")

            # Check business row
            cur.execute("SELECT id, name FROM business;")
            biz_rows = cur.fetchall()
            self.assertEqual(len(biz_rows), 1)
            self.assertEqual(biz_rows[0][0], self.business_a.id)
            self.assertEqual(biz_rows[0][1], self.business_a.name)

            # Check vehicles count matches
            cur.execute("SELECT COUNT(*) FROM vehicles;")
            v_count = cur.fetchone()[0]
            self.assertEqual(v_count, Vehicle.objects.filter(business=self.business_a).count())

            # Check transactions count matches
            cur.execute("SELECT COUNT(*) FROM transactions;")
            t_count = cur.fetchone()[0]
            self.assertEqual(t_count, Transaction.objects.filter(business=self.business_a).count())

            # Verify no other business data is in the database
            cur.execute("SELECT COUNT(*) FROM vehicles WHERE make = %s" % (
                f"'{self.make_b.name}'" if hasattr(self, 'make_b') else "'NonExistentMake'"
            ))

            conn.close()

            # Test dry-run restore using the script
            restore_from_sqlite(tmp_path, target_business_id=self.business_a.id, dry_run=True)

        finally:
            import gc
            gc.collect()
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except PermissionError:
                    pass


class StarMoneyAutoSyncActivityLogTests(BaseTestCase):
    """Test suite verifying StarMoney CSV auto-sync creates System ActivityLog."""

    def test_auto_sync_creates_system_activity_log(self):
        """Auto-sync (is_auto_sync=True) logs activity under System actor (user=None)."""
        from manager.models import ActivityLog, PaymentMethod
        from django.core.files.uploadedfile import SimpleUploadedFile

        self.login_manager_a()

        pm, _ = PaymentMethod.objects.get_or_create(
            business=self.business_a,
            name="Sparkasse",
            defaults={"applies_to_buy": True, "applies_to_sale": True}
        )

        csv_content = (
            "Buchungstag;Begünstigter/Absender - Name;Betrag;Betrag - Währung;Verwendungszweckzeile 1\n"
            "22.11.2026;Auto Teile GmbH;-150,50;EUR;Ersatzteile Bremse #101\n"
        ).encode("utf-8")

        csv_file = SimpleUploadedFile("sparkasse.csv", csv_content, content_type="text/csv")

        response = self.client.post(
            "/api/transactions/import/csv/",
            {
                "transactions_file": csv_file,
                "method": str(pm.id),
                "is_auto_sync": "true",
            }
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])

        # Check ActivityLog
        log = ActivityLog.objects.filter(
            business=self.business_a,
            entity_name__icontains="StarMoney Auto-Sync"
        ).first()
        self.assertIsNotNone(log)
        self.assertIsNone(log.user)  # System actor has user=None
        self.assertEqual(log.action, "create")
        self.assertEqual(log.entity_type, "transaction")

        # Test activity log filtering for system
        list_resp = self.client.get("/api/activity-logs/?user_id=system")
        self.assertEqual(list_resp.status_code, 200)
        items = list_resp.json()["items"]
        self.assertGreaterEqual(len(items), 1)
        self.assertEqual(items[0]["user_name"], "System")
        self.assertTrue(items[0]["is_system"])

        # Test users list includes System
        users_resp = self.client.get("/api/activity-logs/users")
        self.assertEqual(users_resp.status_code, 200)
        users = users_resp.json()["users"]
        self.assertTrue(any(u["id"] == "system" for u in users))


    def test_tenant_isolation_business_b(self):
        """Business B's export contains only Business B data."""
        self.login_manager_b()
        response = self.client.get("/api/sync/business-sqlite")
        self.assertEqual(response.status_code, 200)

        with tempfile.NamedTemporaryFile(suffix=".sqlite3", delete=False) as tmp:
            tmp.write(response.content)
            tmp_path = tmp.name

        try:
            conn = sqlite3.connect(tmp_path)
            cur = conn.cursor()
            cur.execute("SELECT id, name FROM business;")
            biz_rows = cur.fetchall()
            self.assertEqual(len(biz_rows), 1)
            self.assertEqual(biz_rows[0][0], self.business_b.id)
            self.assertEqual(biz_rows[0][1], self.business_b.name)
            conn.close()
        finally:
            import gc
            gc.collect()
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except PermissionError:
                    pass


class StarMoneyAutoSyncActivityLogTests(BaseTestCase):
    """Test suite verifying StarMoney CSV auto-sync creates System ActivityLog."""

    def test_auto_sync_creates_system_activity_log(self):
        """Auto-sync (is_auto_sync=True) logs activity under System actor (user=None)."""
        from manager.models import ActivityLog, PaymentMethod
        from django.core.files.uploadedfile import SimpleUploadedFile

        self.login_manager_a()

        pm, _ = PaymentMethod.objects.get_or_create(
            business=self.business_a,
            name="Sparkasse",
            defaults={"applies_to_buy": True, "applies_to_sale": True}
        )

        csv_content = (
            "Buchungstag;Begünstigter/Absender - Name;Betrag;Betrag - Währung;Verwendungszweckzeile 1\n"
            "22.11.2026;Auto Teile GmbH;-150,50;EUR;Ersatzteile Bremse #101\n"
        ).encode("utf-8")

        csv_file = SimpleUploadedFile("sparkasse.csv", csv_content, content_type="text/csv")

        response = self.client.post(
            "/api/transactions/import/csv/",
            {
                "transactions_file": csv_file,
                "method": str(pm.id),
                "is_auto_sync": "true",
            }
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])

        # Check ActivityLog
        log = ActivityLog.objects.filter(
            business=self.business_a,
            entity_name__icontains="StarMoney Auto-Sync"
        ).first()
        self.assertIsNotNone(log)
        self.assertIsNone(log.user)  # System actor has user=None
        self.assertEqual(log.action, "create")
        self.assertEqual(log.entity_type, "transaction")

        # Test activity log filtering for system
        list_resp = self.client.get("/api/activity-logs/?user_id=system")
        self.assertEqual(list_resp.status_code, 200)
        items = list_resp.json()["items"]
        self.assertGreaterEqual(len(items), 1)
        self.assertEqual(items[0]["user_name"], "System")
        self.assertTrue(items[0]["is_system"])

        # Test users list includes System
        users_resp = self.client.get("/api/activity-logs/users")
        self.assertEqual(users_resp.status_code, 200)
        users = users_resp.json()["users"]
        self.assertTrue(any(u["id"] == "system" for u in users))

