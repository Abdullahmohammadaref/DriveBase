"""
Security & RBAC tests verifying the Phase 1 fixes.

Tests:
- IDOR prevention: Users cannot access other businesses' data
- RBAC enforcement: Employees cannot perform manager-only actions
- Authentication: Unauthenticated requests are rejected
- Cross-tenant isolation: No data leaks between businesses
"""

import json
from decimal import Decimal
from datetime import date

from django.test import TestCase, Client
from django.contrib.auth import get_user_model

from manager.models import (
    Vehicle, Transaction, Make, VehicleModel, LegalEntity,
    PaymentMethod, VehicleType, BodyType, Color, FuelType,
    DamageType, DoorsChoice, TaxPercentage, Category, Subcategory,
    ActivityLog,
)
from .test_setup import BaseTestCase

User = get_user_model()


# =============================================================================
# IDOR Prevention Tests
# =============================================================================

class VehicleIdorTests(BaseTestCase):
    """
    Test that users cannot access vehicles from another business
    by manipulating IDs in URLs.
    """

    def test_cannot_get_other_business_vehicle_by_db_id(self):
        """Manager A cannot access Business B's vehicle."""
        self.login_manager_a()
        # vehicle_b has internal_id=1 in business B.
        # Since we also have internal_id=1 in business A, the API would return
        # our own vehicle. To properly test IDOR, create a vehicle with unique ID.
        v = Vehicle.objects.create(
            business=self.business_b,
            branch=self.branch_b,
            status="purchased",
            make=self.make_b,
            power_kw=100,
        )
        # v gets internal_id=2 in business B
        response = self.client.get(f"/api/vehicles/{v.internal_id}")
        # Should return 404 because business_a has no vehicle with internal_id=2
        self.assertEqual(response.status_code, 404)

    def test_cannot_update_other_business_vehicle(self):
        """Manager A cannot PATCH Business B's vehicle."""
        self.login_manager_a()
        v = Vehicle.objects.create(
            business=self.business_b,
            branch=self.branch_b,
            status="purchased",
            make=self.make_b,
            power_kw=100,
        )
        response = self.client.patch(
            f"/api/vehicles/{v.internal_id}",
            data=json.dumps({"kilometer": 99999}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)
        v.refresh_from_db()
        self.assertIsNone(v.kilometer)

    def test_cannot_delete_other_business_vehicle(self):
        """Manager A cannot DELETE Business B's vehicle."""
        self.login_manager_a()
        v = Vehicle.objects.create(
            business=self.business_b,
            branch=self.branch_b,
            status="purchased",
            make=self.make_b,
            power_kw=100,
        )
        response = self.client.delete(f"/api/vehicles/{v.internal_id}")
        self.assertEqual(response.status_code, 404)
        v.refresh_from_db()
        self.assertEqual(v.status, "purchased")  # Still unchanged

    def test_cannot_get_other_business_models_for_make(self):
        """
        VULN-1 FIX VERIFICATION:
        Manager A cannot get models for Business B's make
        via the vehicle_router endpoint.
        """
        self.login_manager_a()
        # The VULN-1 fix was on /api/makes/{make_id}/models (vehicle_api.py)
        response = self.client.get(f"/api/makes/{self.make_b.id}/models")
        self.assertEqual(response.status_code, 404)


class TransactionIdorTests(BaseTestCase):
    """Test that users cannot access transactions from another business."""

    def test_cannot_get_other_business_transaction(self):
        self.login_manager_a()
        # Create multiple transactions in business B to get a unique internal_id
        # that doesn't exist in business A
        t = Transaction.objects.create(
            business=self.business_b,
            amount=Decimal("1000.00"),
            date=date(2024, 5, 1),
        )
        t2 = Transaction.objects.create(
            business=self.business_b,
            amount=Decimal("2000.00"),
            date=date(2024, 5, 2),
        )
        # t2 should have internal_id=2, which doesn't exist in business A
        response = self.client.get(f"/api/transactions/{t2.internal_id}")
        self.assertEqual(response.status_code, 404)

    def test_cannot_update_other_business_transaction(self):
        self.login_manager_a()
        t = Transaction.objects.create(
            business=self.business_b,
            amount=Decimal("1000.00"),
            date=date(2024, 5, 1),
        )
        t2 = Transaction.objects.create(
            business=self.business_b,
            amount=Decimal("2000.00"),
            date=date(2024, 5, 2),
        )
        response = self.client.put(
            f"/api/transactions/{t2.internal_id}",
            data=json.dumps({"description": "hacked"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

    def test_cannot_delete_other_business_transaction(self):
        self.login_manager_a()
        t = Transaction.objects.create(
            business=self.business_b,
            amount=Decimal("1000.00"),
            date=date(2024, 5, 1),
        )
        t2 = Transaction.objects.create(
            business=self.business_b,
            amount=Decimal("2000.00"),
            date=date(2024, 5, 2),
        )
        response = self.client.delete(f"/api/transactions/{t2.internal_id}")
        self.assertEqual(response.status_code, 404)


class LegalEntityIdorTests(BaseTestCase):
    """Test that users cannot access legal entities from another business."""

    def test_cannot_get_other_business_legal_entity(self):
        self.login_manager_a()
        e = LegalEntity.objects.create(
            business=self.business_b,
            name="Secret Entity",
            address_street="Secret St",
            address_street_number=1,
            address_postal_code="11111",
            address_city=self.city_berlin,
            address_country=self.country_de_b,
        )
        response = self.client.get(f"/api/legal-entities/{e.internal_id}")
        self.assertEqual(response.status_code, 404)


class ChoiceIdorTests(BaseTestCase):
    """Test that choice operations cannot affect other businesses."""

    def test_cannot_deactivate_other_business_choice(self):
        """Manager A cannot deactivate Business B's make."""
        self.login_manager_a()
        response = self.client.post(
            f"/api/choices/make/{self.make_b.id}/deactivate"
        )
        self.assertIn(response.status_code, [404, 403])
        self.make_b.refresh_from_db()
        self.assertTrue(self.make_b.is_active)  # Still active

    def test_cannot_reactivate_other_business_choice(self):
        """Manager A cannot reactivate Business B's choice."""
        self.make_b.is_active = False
        self.make_b.save()
        self.login_manager_a()
        response = self.client.post(
            f"/api/choices/make/{self.make_b.id}/reactivate"
        )
        self.assertIn(response.status_code, [404, 403])
        self.make_b.refresh_from_db()
        self.assertFalse(self.make_b.is_active)  # Still inactive


# =============================================================================
# RBAC Tests — Manager-Only Endpoints
# =============================================================================

class ChoiceRbacTests(BaseTestCase):
    """
    VULN-3 FIX VERIFICATION:
    Test that employees cannot create/deactivate/reactivate choices.
    """

    def test_employee_cannot_create_choice(self):
        self.login_employee_a()
        response = self.client.post(
            "/api/choices/make",
            data={"name": "Toyota"},
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(Make.objects.filter(name="Toyota").exists())

    def test_manager_can_create_choice(self):
        self.login_manager_a()
        response = self.client.post(
            "/api/choices/make",
            data={"name": "Toyota"},
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(
            Make.objects.filter(name="Toyota", business=self.business_a).exists()
        )

    def test_employee_cannot_deactivate_choice(self):
        self.login_employee_a()
        response = self.client.post(
            f"/api/choices/make/{self.make_a.id}/deactivate"
        )
        self.assertEqual(response.status_code, 403)
        self.make_a.refresh_from_db()
        self.assertTrue(self.make_a.is_active)

    def test_manager_can_deactivate_choice(self):
        self.login_manager_a()
        response = self.client.post(
            f"/api/choices/make/{self.make_a.id}/deactivate"
        )
        self.assertEqual(response.status_code, 200)
        self.make_a.refresh_from_db()
        self.assertFalse(self.make_a.is_active)

    def test_employee_cannot_reactivate_choice(self):
        self.make_a.is_active = False
        self.make_a.save()
        self.login_employee_a()
        response = self.client.post(
            f"/api/choices/make/{self.make_a.id}/reactivate"
        )
        self.assertEqual(response.status_code, 403)
        self.make_a.refresh_from_db()
        self.assertFalse(self.make_a.is_active)

    def test_manager_can_reactivate_choice(self):
        self.make_a.is_active = False
        self.make_a.save()
        self.login_manager_a()
        response = self.client.post(
            f"/api/choices/make/{self.make_a.id}/reactivate"
        )
        self.assertEqual(response.status_code, 200)
        self.make_a.refresh_from_db()
        self.assertTrue(self.make_a.is_active)


class SettingsRbacTests(BaseTestCase):
    """Test that settings endpoints enforce manager-only access."""

    def test_employee_cannot_get_business_settings(self):
        self.login_employee_a()
        response = self.client.get("/api/settings/business")
        self.assertEqual(response.status_code, 403)

    def test_employee_cannot_update_business_settings(self):
        self.login_employee_a()
        response = self.client.put(
            "/api/settings/business",
            data=json.dumps({"name": "Hacked Business"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)
        self.business_a.refresh_from_db()
        self.assertEqual(self.business_a.name, "Test Business A")

    def test_employee_cannot_create_employee(self):
        self.login_employee_a()
        response = self.client.post(
            "/api/settings/users",
            data=json.dumps({
                "username": "rogue_user",
                "password": "password123",
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(User.objects.filter(username="rogue_user").exists())

    def test_employee_cannot_create_branch(self):
        self.login_employee_a()
        response = self.client.post(
            "/api/settings/branches",
            data=json.dumps({
                "name": "Rogue Branch",
                "address": "123 Evil St",
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)


# =============================================================================
# Authentication Tests
# =============================================================================

class AuthenticationTests(BaseTestCase):
    """Test that unauthenticated requests are properly rejected."""

    def test_vehicles_requires_auth(self):
        response = self.client.get("/api/vehicles?page=1&per_page=20")
        self.assertIn(response.status_code, [401, 403])

    def test_choices_requires_auth(self):
        response = self.client.get("/api/choices")
        self.assertIn(response.status_code, [401, 403])

    def test_transactions_requires_auth(self):
        response = self.client.get("/api/transactions/?page=1&per_page=20")
        self.assertIn(response.status_code, [401, 403])

    def test_legal_entities_requires_auth(self):
        response = self.client.get("/api/legal-entities?page=1&per_page=20")
        self.assertIn(response.status_code, [401, 403])

    def test_settings_requires_auth(self):
        response = self.client.get("/api/settings/business")
        self.assertIn(response.status_code, [401, 403])

    def test_activity_logs_requires_auth(self):
        response = self.client.get("/api/activity-logs/")
        self.assertIn(response.status_code, [401, 403])

    def test_vehicle_router_requires_auth(self):
        """VULN-2 FIX VERIFICATION: vehicle_router now requires auth."""
        response = self.client.get("/api/vehicles?page=1&page_size=20")
        self.assertIn(response.status_code, [401, 403])

    def test_vehicle_router_filters_requires_auth(self):
        response = self.client.get("/api/vehicles/filters")
        self.assertIn(response.status_code, [401, 403])

    def test_makes_models_requires_auth(self):
        """VULN-1 & VULN-2 FIX VERIFICATION."""
        response = self.client.get(f"/api/makes/{self.make_a.id}/models")
        self.assertIn(response.status_code, [401, 403])


# =============================================================================
# Cross-Tenant Data Isolation Tests
# =============================================================================

class CrossTenantIsolationTests(BaseTestCase):
    """
    Comprehensive test that Business A and B cannot see each other's data
    across all list endpoints.
    """

    def test_vehicle_list_isolation(self):
        """Business A sees only its own vehicles."""
        self.login_manager_a()
        response = self.client.get("/api/vehicles?page=1&per_page=100")
        data = response.json()
        for v in data["vehicles"]["items"]:
            # All returned vehicles should belong to business A
            db_vehicle = Vehicle.objects.get(
                business=self.business_a,
                internal_id=v["internal_id"],
            )
            self.assertEqual(db_vehicle.business_id, self.business_a.id)

    def test_transaction_list_isolation(self):
        """Business A sees only its own transactions."""
        # Create a transaction in business B
        Transaction.objects.create(
            business=self.business_b,
            amount=Decimal("9999.00"),
            date=date(2024, 1, 1),
            from_or_to="Secret B Transaction",
        )
        self.login_manager_a()
        response = self.client.get("/api/transactions/?page=1&per_page=100")
        data = response.json()
        for tx in data["transactions"]["items"]:
            self.assertNotEqual(tx.get("from_or_to"), "Secret B Transaction")

    def test_legal_entity_list_isolation(self):
        """Business A sees only its own legal entities."""
        self.login_manager_a()
        response = self.client.get("/api/legal-entities?page=1&per_page=100")
        data = response.json()
        names = [e["name"] for e in data["items"]]
        self.assertNotIn("Munich Motors", names)

    def test_choices_isolation(self):
        """Business A sees only its own dynamic choices."""
        self.login_manager_a()
        response = self.client.get("/api/choices")
        data = response.json()
        # Check makes
        make_names = [m["name"] for m in data["makes"]]
        self.assertNotIn("Mercedes", make_names)
        # Check colors
        color_names = [c["name"] for c in data["colors"]]
        self.assertNotIn("Silver", color_names)

    def test_activity_logs_isolation(self):
        """Business A sees only its own activity logs."""
        ActivityLog.objects.create(
            business=self.business_a, user=self.manager_a,
            action="create", entity_type="vehicle", entity_name="A's Log",
        )
        ActivityLog.objects.create(
            business=self.business_b, user=self.manager_b,
            action="create", entity_type="vehicle", entity_name="B's Log",
        )
        self.login_manager_a()
        response = self.client.get("/api/activity-logs/")
        data = response.json()
        log_names = [log["entity_name"] for log in data["items"]]
        self.assertIn("A's Log", log_names)
        self.assertNotIn("B's Log", log_names)
