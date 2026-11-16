"""
Sync API for DriveBase Dealership Management.

Provides endpoints for local data sovereignty, offline caching, and disaster recovery:
- GET /api/sync/business-sqlite: Generates a complete, single-tenant, standalone SQLite database
  strictly scoped to request.user.business.
- GET /api/sync/media-manifest: Returns a manifest of all media files belonging to the business.
- GET /api/sync/status: Lightweight status check for sync freshness.
"""

import os
import sqlite3
import tempfile
import logging
from datetime import datetime, date
from decimal import Decimal

from ninja import Router
from ninja.security import django_auth
from django.http import HttpResponse, JsonResponse
from django.conf import settings as django_settings
from django.utils import timezone

from .models import (
    Business, Branch, Vehicle, LegalEntity,
    Transaction as DealershipTransaction, VehicleExpenseEarning,
    VehicleListingImage, Make, VehicleModel, VehicleType,
    BodyType, Color, FuelType, DamageType, DoorsChoice,
    TaxPercentage, PaymentMethod, Currency, Category,
    Subcategory, KeyNumber
)

logger = logging.getLogger(__name__)

sync_router = Router(auth=django_auth, tags=["Sync"])


def get_user_business(request):
    """Retrieve the business associated with the authenticated user."""
    return getattr(request.user, "business", None)


def _safe_str(val):
    if val is None:
        return None
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    if isinstance(val, Decimal):
        return str(val)
    if hasattr(val, "name"):
        return val.name
    return str(val)


@sync_router.get("/status")
def get_sync_status(request):
    """Return lightweight metadata about the business's records for sync freshness check."""
    business = get_user_business(request)
    if not business:
        return JsonResponse({"detail": "No business associated with user."}, status=400)

    user = request.user
    can_access_transactions = bool(user.is_manager or user.transactions_access or user.is_superuser)
    can_access_legal_entities = bool(user.is_manager or user.legal_entities_access or user.is_superuser)

    vehicles_count = Vehicle.objects.filter(business=business).count()
    entities_count = LegalEntity.objects.filter(business=business).count() if can_access_legal_entities else 0
    transactions_count = DealershipTransaction.objects.filter(business=business).count() if can_access_transactions else 0
    images_count = Vehicle.objects.filter(business=business).exclude(image="").exclude(image__isnull=True).count()
    gallery_count = VehicleListingImage.objects.filter(vehicle__business=business).count()

    return {
        "business_id": business.id,
        "business_name": business.name,
        "server_time": timezone.now().isoformat(),
        "vehicles_count": vehicles_count,
        "entities_count": entities_count,
        "transactions_count": transactions_count,
        "total_images_count": images_count + gallery_count,
        "can_access_transactions": can_access_transactions,
        "can_access_legal_entities": can_access_legal_entities,
    }


@sync_router.get("/media-manifest")
def get_media_manifest(request):
    """
    Return list of all media file paths belonging strictly to this business.
    Used by desktop client to synchronize photos locally.
    """
    business = get_user_business(request)
    if not business:
        return JsonResponse({"detail": "No business associated with user."}, status=400)

    media_files = []

    # 1. Vehicle main images
    vehicles = Vehicle.objects.filter(business=business).exclude(image="").exclude(image__isnull=True)
    for v in vehicles:
        if v.image and hasattr(v.image, "name") and v.image.name:
            media_files.append({
                "entity_type": "vehicle_main",
                "entity_id": v.internal_id,
                "relative_path": v.image.name,
                "url": v.image.url if hasattr(v.image, "url") else f"/media/{v.image.name}",
            })

    # 2. Vehicle listing gallery images
    gallery_images = VehicleListingImage.objects.filter(vehicle__business=business).exclude(image="").exclude(image__isnull=True)
    for g in gallery_images:
        if g.image and hasattr(g.image, "name") and g.image.name:
            media_files.append({
                "entity_type": "vehicle_gallery",
                "entity_id": g.vehicle.internal_id,
                "relative_path": g.image.name,
                "url": g.image.url if hasattr(g.image, "url") else f"/media/{g.image.name}",
            })

    # 3. Business logo
    if business.logo and hasattr(business.logo, "name") and business.logo.name:
        media_files.append({
            "entity_type": "business_logo",
            "entity_id": business.id,
            "relative_path": business.logo.name,
            "url": business.logo.url if hasattr(business.logo, "url") else f"/media/{business.logo.name}",
        })

    return {
        "business_id": business.id,
        "total_files": len(media_files),
        "files": media_files,
    }


@sync_router.get("/business-sqlite")
def download_business_sqlite(request):
    """
    Generates a standalone, fully-populated SQLite database for request.user.business.
    Strict tenant isolation: only this business's data is exported.
    User permissions are respected (transactions/entities omitted if unauthorized).
    Zero user credentials, sessions, or admin logs are exported.
    """
    business = get_user_business(request)
    if not business:
        return HttpResponse("No business associated with user.", status=400)

    user = request.user
    can_access_transactions = bool(user.is_manager or user.transactions_access or user.is_superuser)
    can_access_legal_entities = bool(user.is_manager or user.legal_entities_access or user.is_superuser)

    # Create temporary SQLite database
    with tempfile.NamedTemporaryFile(suffix=".sqlite3", delete=False) as tmp_file:
        tmp_db_path = tmp_file.name

    try:
        conn = sqlite3.connect(tmp_db_path)
        cur = conn.cursor()

        # Enable WAL mode and foreign keys
        cur.execute("PRAGMA journal_mode=WAL;")
        cur.execute("PRAGMA foreign_keys=ON;")

        # --- Table DDL ---
        cur.execute("""
            CREATE TABLE _sync_meta (
                key TEXT PRIMARY KEY,
                value TEXT
            );
        """)

        cur.execute("""
            CREATE TABLE business (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                address_country TEXT,
                address_city TEXT,
                address_street TEXT,
                address_street_number TEXT,
                address_postal_code TEXT,
                telephone_number TEXT,
                fax_number TEXT,
                email TEXT,
                bank_name TEXT,
                bank_bic_swift TEXT,
                bank_iban TEXT,
                managing_director TEXT,
                tax_id TEXT,
                eori_number TEXT,
                ust_id_nr TEXT,
                headquarters_city TEXT,
                court_district TEXT,
                court_registration_number TEXT,
                target_annual_return TEXT,
                target_days_on_stock INTEGER,
                logo_path TEXT
            );
        """)

        cur.execute("""
            CREATE TABLE branches (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                address TEXT,
                is_active INTEGER DEFAULT 1
            );
        """)

        # Choices tables
        cur.execute("CREATE TABLE makes (id INTEGER PRIMARY KEY, name TEXT NOT NULL, is_active INTEGER DEFAULT 1);")
        cur.execute("CREATE TABLE vehicle_models (id INTEGER PRIMARY KEY, make_name TEXT NOT NULL, name TEXT NOT NULL, is_active INTEGER DEFAULT 1);")
        cur.execute("CREATE TABLE vehicle_types (id INTEGER PRIMARY KEY, name TEXT NOT NULL, is_active INTEGER DEFAULT 1);")
        cur.execute("CREATE TABLE body_types (id INTEGER PRIMARY KEY, name TEXT NOT NULL, is_active INTEGER DEFAULT 1, mobile_de_mapping TEXT, is_protected INTEGER DEFAULT 0);")
        cur.execute("CREATE TABLE colors (id INTEGER PRIMARY KEY, name TEXT NOT NULL, is_active INTEGER DEFAULT 1, mobile_de_mapping TEXT, is_protected INTEGER DEFAULT 0);")
        cur.execute("CREATE TABLE fuel_types (id INTEGER PRIMARY KEY, name TEXT NOT NULL, is_active INTEGER DEFAULT 1, mobile_de_mapping TEXT, is_protected INTEGER DEFAULT 0);")
        cur.execute("CREATE TABLE damage_types (id INTEGER PRIMARY KEY, name TEXT NOT NULL, is_active INTEGER DEFAULT 1);")
        cur.execute("CREATE TABLE doors (id INTEGER PRIMARY KEY, name TEXT NOT NULL, is_active INTEGER DEFAULT 1, mobile_de_mapping TEXT, is_protected INTEGER DEFAULT 0);")
        cur.execute("CREATE TABLE tax_percentages (id INTEGER PRIMARY KEY, name TEXT NOT NULL, percentage TEXT NOT NULL, is_active INTEGER DEFAULT 1);")
        cur.execute("CREATE TABLE payment_methods (id INTEGER PRIMARY KEY, name TEXT NOT NULL, is_active INTEGER DEFAULT 1, applies_to_buy INTEGER, applies_to_sale INTEGER, applies_to_transactions INTEGER);")
        cur.execute("CREATE TABLE currencies (id INTEGER PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL, is_active INTEGER DEFAULT 1);")
        cur.execute("CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL, is_active INTEGER DEFAULT 1);")
        cur.execute("CREATE TABLE subcategories (id INTEGER PRIMARY KEY, category_name TEXT NOT NULL, name TEXT NOT NULL, is_active INTEGER DEFAULT 1);")
        cur.execute("CREATE TABLE key_numbers (id INTEGER PRIMARY KEY, number INTEGER NOT NULL, is_active INTEGER DEFAULT 1, assigned_to_vehicle_internal_id INTEGER);")

        cur.execute("""
            CREATE TABLE legal_entities (
                internal_id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                address_street TEXT,
                address_street_number TEXT,
                address_postal_code TEXT,
                address_city TEXT,
                address_country TEXT,
                status TEXT,
                email TEXT,
                phone_number TEXT,
                type TEXT,
                tax_identification_number TEXT,
                date_created TEXT
            );
        """)

        cur.execute("""
            CREATE TABLE vehicles (
                internal_id INTEGER PRIMARY KEY,
                status TEXT,
                description TEXT,
                internal_comments TEXT,
                chassis_number TEXT,
                motor_vehicle_registration_number TEXT,
                official_license_plate TEXT,
                make TEXT,
                model TEXT,
                vehicle_type TEXT,
                body_type TEXT,
                color TEXT,
                fuel_type TEXT,
                damage_type TEXT,
                doors TEXT,
                year_of_construction INTEGER,
                kilometer INTEGER,
                power_kw INTEGER,
                branch TEXT,
                first_registration_date TEXT,
                buy_date TEXT,
                buy_price TEXT,
                buy_tax_percentage TEXT,
                buy_payment_method TEXT,
                buy_delivery_collection_date TEXT,
                seller_internal_id INTEGER,
                buyer_internal_id INTEGER,
                sale_date TEXT,
                sale_price TEXT,
                sale_tax_percentage TEXT,
                sale_payment_method TEXT,
                sale_delivery_collection_date TEXT,
                sale_invoice_number TEXT,
                image TEXT,
                date_created TEXT
            );
        """)

        cur.execute("""
            CREATE TABLE vehicle_expenses_earnings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                vehicle_internal_id INTEGER,
                type TEXT,
                amount TEXT,
                category TEXT,
                subcategory TEXT,
                is_active INTEGER DEFAULT 1,
                created_at TEXT
            );
        """)

        cur.execute("""
            CREATE TABLE transactions (
                internal_id INTEGER PRIMARY KEY,
                date TEXT,
                datetime TEXT,
                status TEXT,
                description TEXT,
                amount TEXT,
                currency TEXT,
                payment_method TEXT,
                tax_percentage TEXT,
                category TEXT,
                subcategory TEXT,
                vehicle_internal_id INTEGER,
                from_or_to TEXT,
                internal_comments TEXT
            );
        """)

        cur.execute("""
            CREATE TABLE vehicle_listing_images (
                id INTEGER PRIMARY KEY,
                vehicle_internal_id INTEGER,
                image TEXT,
                order_idx INTEGER,
                uploaded_at TEXT
            );
        """)

        # --- Data Population ---

        # 1. Business
        logo_path = business.logo.name if business.logo else None
        cur.execute("""
            INSERT INTO business (
                id, name, address_country, address_city, address_street, address_street_number,
                address_postal_code, telephone_number, fax_number, email, bank_name,
                bank_bic_swift, bank_iban, managing_director, tax_id, eori_number,
                ust_id_nr, headquarters_city, court_district, court_registration_number,
                target_annual_return, target_days_on_stock, logo_path
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (
            business.id, business.name, business.address_country, business.address_city,
            business.address_street, business.address_street_number, business.address_postal_code,
            business.telephone_number, business.fax_number, business.email, business.bank_name,
            business.bank_bic_swift, business.bank_iban, business.managing_director,
            business.tax_id, business.eori_number, business.ust_id_nr, business.headquarters_city,
            business.court_district, business.court_registration_number,
            _safe_str(business.target_annual_return), business.target_days_on_stock, logo_path
        ))

        # 2. Branches
        for b in Branch.objects.filter(business=business):
            cur.execute("INSERT INTO branches (id, name, address, is_active) VALUES (?, ?, ?, ?);",
                        (b.id, b.name, b.address, 1 if b.is_active else 0))

        # 3. Choices
        for m in Make.objects.filter(business=business):
            cur.execute("INSERT INTO makes (id, name, is_active) VALUES (?, ?, ?);", (m.id, m.name, 1 if m.is_active else 0))

        for vm in VehicleModel.objects.filter(business=business).select_related("make"):
            cur.execute("INSERT INTO vehicle_models (id, make_name, name, is_active) VALUES (?, ?, ?, ?);",
                        (vm.id, vm.make.name if vm.make else "", vm.name, 1 if vm.is_active else 0))

        for vt in VehicleType.objects.filter(business=business):
            cur.execute("INSERT INTO vehicle_types (id, name, is_active) VALUES (?, ?, ?);", (vt.id, vt.name, 1 if vt.is_active else 0))

        for bt in BodyType.objects.filter(business=business):
            cur.execute("INSERT INTO body_types (id, name, is_active, mobile_de_mapping, is_protected) VALUES (?, ?, ?, ?, ?);",
                        (bt.id, bt.name, 1 if bt.is_active else 0, bt.mobile_de_mapping, 1 if bt.is_protected else 0))

        for c in Color.objects.filter(business=business):
            cur.execute("INSERT INTO colors (id, name, is_active, mobile_de_mapping, is_protected) VALUES (?, ?, ?, ?, ?);",
                        (c.id, c.name, 1 if c.is_active else 0, c.mobile_de_mapping, 1 if c.is_protected else 0))

        for ft in FuelType.objects.filter(business=business):
            cur.execute("INSERT INTO fuel_types (id, name, is_active, mobile_de_mapping, is_protected) VALUES (?, ?, ?, ?, ?);",
                        (ft.id, ft.name, 1 if ft.is_active else 0, ft.mobile_de_mapping, 1 if ft.is_protected else 0))

        for dt in DamageType.objects.filter(business=business):
            cur.execute("INSERT INTO damage_types (id, name, is_active) VALUES (?, ?, ?);", (dt.id, dt.name, 1 if dt.is_active else 0))

        for d in DoorsChoice.objects.filter(business=business):
            cur.execute("INSERT INTO doors (id, name, is_active, mobile_de_mapping, is_protected) VALUES (?, ?, ?, ?, ?);",
                        (d.id, d.name, 1 if d.is_active else 0, d.mobile_de_mapping, 1 if d.is_protected else 0))

        for tp in TaxPercentage.objects.filter(business=business):
            cur.execute("INSERT INTO tax_percentages (id, name, percentage, is_active) VALUES (?, ?, ?, ?);",
                        (tp.id, tp.name, str(tp.percentage), 1 if tp.is_active else 0))

        for pm in PaymentMethod.objects.filter(business=business):
            cur.execute("INSERT INTO payment_methods (id, name, is_active, applies_to_buy, applies_to_sale, applies_to_transactions) VALUES (?, ?, ?, ?, ?, ?);",
                        (pm.id, pm.name, 1 if pm.is_active else 0, 1 if pm.applies_to_buy else 0, 1 if pm.applies_to_sale else 0, 1 if pm.applies_to_transactions else 0))

        for cur_obj in Currency.objects.filter(business=business):
            cur.execute("INSERT INTO currencies (id, name, code, is_active) VALUES (?, ?, ?, ?);", (cur_obj.id, cur_obj.name, cur_obj.code, 1 if cur_obj.is_active else 0))

        for cat in Category.objects.filter(business=business):
            cur.execute("INSERT INTO categories (id, name, is_active) VALUES (?, ?, ?);", (cat.id, cat.name, 1 if cat.is_active else 0))

        for sc in Subcategory.objects.filter(business=business).select_related("category"):
            cur.execute("INSERT INTO subcategories (id, category_name, name, is_active) VALUES (?, ?, ?, ?);",
                        (sc.id, sc.category.name if sc.category else "", sc.name, 1 if sc.is_active else 0))

        for kn in KeyNumber.objects.filter(business=business).select_related("vehicle"):
            cur.execute("INSERT INTO key_numbers (id, number, is_active, assigned_to_vehicle_internal_id) VALUES (?, ?, ?, ?);",
                        (kn.id, kn.number, 1 if kn.is_active else 0, kn.vehicle.internal_id if kn.vehicle else None))

        # 4. Legal Entities (if authorized)
        entities_count = 0
        if can_access_legal_entities:
            for le in LegalEntity.objects.filter(business=business).select_related("address_city", "address_country"):
                cur.execute("""
                    INSERT INTO legal_entities (
                        internal_id, name, address_street, address_street_number,
                        address_postal_code, address_city, address_country, status,
                        email, phone_number, type, tax_identification_number, date_created
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """, (
                    le.internal_id, le.name, le.address_street, le.address_street_number,
                    le.address_postal_code,
                    le.address_city.name if le.address_city else None,
                    le.address_country.name if le.address_country else None,
                    le.status,
                    le.email, le.phone_number, le.type, le.tax_identification_number,
                    _safe_str(le.date_created)
                ))
                entities_count += 1

        # 5. Vehicles
        vehicles_qs = Vehicle.objects.filter(business=business).select_related(
            "make", "model", "vehicle_type", "body_type", "color",
            "fuel_type", "damage_type", "doors", "buy_tax", "sale_tax",
            "buy_payment_method", "sale_payment_method", "seller", "buyer",
            "branch"
        )
        vehicles_count = 0
        for v in vehicles_qs:
            cur.execute("""
                INSERT INTO vehicles (
                    internal_id, status, description, internal_comments, chassis_number,
                    motor_vehicle_registration_number, official_license_plate, make, model,
                    vehicle_type, body_type, color, fuel_type, damage_type, doors,
                    year_of_construction, kilometer, power_kw, branch,
                    first_registration_date, buy_date, buy_price, buy_tax_percentage,
                    buy_payment_method, buy_delivery_collection_date, seller_internal_id,
                    buyer_internal_id, sale_date, sale_price, sale_tax_percentage,
                    sale_payment_method, sale_delivery_collection_date, sale_invoice_number,
                    image, date_created
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                v.internal_id, v.status, v.description, v.internal_comments, v.chassis_number,
                v.motor_vehicle_registration_number, v.official_license_plate,
                v.make.name if v.make else None,
                v.model.name if v.model else None,
                v.vehicle_type.name if v.vehicle_type else None,
                v.body_type.name if v.body_type else None,
                v.color.name if v.color else None,
                v.fuel_type.name if v.fuel_type else None,
                v.damage_type.name if v.damage_type else None,
                v.doors.name if v.doors else None,
                v.year_of_construction, v.kilometer, v.power_kw,
                v.branch.name if v.branch else None,
                _safe_str(v.first_registration_date),
                _safe_str(v.buy_date), _safe_str(v.buy_price),
                _safe_str(v.buy_tax.percentage) if v.buy_tax else None,
                v.buy_payment_method.name if v.buy_payment_method else None,
                _safe_str(v.buy_delivery_collection_date),
                v.seller.internal_id if v.seller else None,
                v.buyer.internal_id if v.buyer else None,
                _safe_str(v.sale_date), _safe_str(v.sale_price),
                _safe_str(v.sale_tax.percentage) if v.sale_tax else None,
                v.sale_payment_method.name if v.sale_payment_method else None,
                _safe_str(v.sale_delivery_collection_date),
                v.sale_invoice_number,
                v.image.name if v.image else None,
                _safe_str(v.date_created)
            ))
            vehicles_count += 1

        # 6. Expenses & Earnings
        for ee in VehicleExpenseEarning.objects.filter(business=business).select_related("vehicle", "category", "subcategory"):
            cur.execute("""
                INSERT INTO vehicle_expenses_earnings (
                    vehicle_internal_id, type, amount, category, subcategory, is_active, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?);
            """, (
                ee.vehicle.internal_id if ee.vehicle else None,
                ee.type, _safe_str(ee.amount),
                ee.category.name if ee.category else None,
                ee.subcategory.name if ee.subcategory else None,
                1 if ee.is_active else 0,
                _safe_str(ee.created_at)
            ))

        # 7. Transactions (if authorized)
        transactions_count = 0
        if can_access_transactions:
            trans_qs = DealershipTransaction.objects.filter(business=business).select_related(
                "vehicle", "category_fk", "subcategory_fk", "currency_fk", "payment_method"
            )
            for t in trans_qs:
                cur.execute("""
                    INSERT INTO transactions (
                        internal_id, date, datetime, status, description, amount,
                        currency, payment_method, tax_percentage, category,
                        subcategory, vehicle_internal_id, from_or_to, internal_comments
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """, (
                    t.internal_id, _safe_str(t.date), t.datetime, t.status, t.description,
                    _safe_str(t.amount),
                    t.currency_fk.name if t.currency_fk else None,
                    t.payment_method.name if t.payment_method else None,
                    _safe_str(t.tax),
                    t.category_fk.name if t.category_fk else None,
                    t.subcategory_fk.name if t.subcategory_fk else None,
                    t.vehicle.internal_id if t.vehicle else None,
                    t.from_or_to, t.internal_comments
                ))
                transactions_count += 1

        # 8. Listing Gallery Images
        for g in VehicleListingImage.objects.filter(vehicle__business=business).select_related("vehicle"):
            cur.execute("""
                INSERT INTO vehicle_listing_images (id, vehicle_internal_id, image, order_idx, uploaded_at)
                VALUES (?, ?, ?, ?, ?);
            """, (
                g.id, g.vehicle.internal_id if g.vehicle else None,
                g.image.name if g.image else None,
                g.order, _safe_str(g.uploaded_at)
            ))

        # 9. Sync Metadata
        now_iso = timezone.now().isoformat()
        metadata_pairs = [
            ("schema_version", "1"),
            ("exported_at", now_iso),
            ("business_id", str(business.id)),
            ("business_name", business.name),
            ("vehicles_count", str(vehicles_count)),
            ("entities_count", str(entities_count)),
            ("transactions_count", str(transactions_count)),
        ]
        cur.executemany("INSERT INTO _sync_meta (key, value) VALUES (?, ?);", metadata_pairs)

        # Commit and close
        conn.commit()
        conn.close()

        # Read binary SQLite bytes
        with open(tmp_db_path, "rb") as f:
            sqlite_bytes = f.read()

    finally:
        # Clean up temporary file
        try:
            if os.path.exists(tmp_db_path):
                os.remove(tmp_db_path)
        except OSError:
            pass

    date_str = date.today().isoformat()
    clean_biz_name = business.name.lower().replace(" ", "_")
    filename = f"drivebase_{clean_biz_name}_{date_str}.sqlite3"

    response = HttpResponse(sqlite_bytes, content_type="application/vnd.sqlite3")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    response["X-DriveBase-Exported-At"] = now_iso
    response["X-DriveBase-Vehicles-Count"] = str(vehicles_count)
    return response
