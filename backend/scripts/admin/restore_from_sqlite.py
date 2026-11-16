"""
Disaster Recovery Script: Restore Business Data from Standalone SQLite File
Usage:
    python scripts/admin/restore_from_sqlite.py <path_to_sqlite> [--business-id <id>] [--dry-run]
"""

import os
import sys
import sqlite3
import shutil
import argparse
from datetime import datetime
from decimal import Decimal

# Ensure backend directory is in sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "drivebase.settings")
import django
django.setup()

from django.db import transaction
from django.conf import settings
from manager.models import (
    Business, Branch, LegalEntity, Country, City, Make, VehicleModel, VehicleType,
    BodyType, Color, FuelType, DamageType, DoorsChoice, TaxPercentage,
    PaymentMethod, Currency, Category, Subcategory, KeyNumber,
    Vehicle, Transaction as DealershipTransaction, VehicleExpenseEarning,
    VehicleListingImage
)


def create_db_snapshot():
    db_path = settings.DATABASES['default']['NAME']
    if os.path.exists(db_path):
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = f"{db_path}.pre_restore_sqlite_{timestamp}.bak"
        shutil.copy2(db_path, backup_path)
        print(f"[BACKUP] Safety snapshot created at: {backup_path}")
        return backup_path
    return None


def restore_from_sqlite(sqlite_path: str, target_business_id: int = None, dry_run: bool = False):
    if not os.path.isfile(sqlite_path):
        raise FileNotFoundError(f"SQLite file not found at: {sqlite_path}")

    print(f"\n========================================================")
    print(f"  DriveBase DEALERSHIP DISASTER RECOVERY RESTORE (SQLite)")
    print(f"  Source File: {sqlite_path}")
    print(f"  Target Business ID: {target_business_id or 'From File Metadata'}")
    print(f"  Dry Run: {dry_run}")
    print(f"========================================================\n")

    if not dry_run:
        create_db_snapshot()

    src_conn = sqlite3.connect(sqlite_path)
    src_conn.row_factory = sqlite3.Row
    cur = src_conn.cursor()

    try:
        # Read _sync_meta
        meta = {}
        try:
            cur.execute("SELECT key, value FROM _sync_meta;")
            for row in cur.fetchall():
                meta[row["key"]] = row["value"]
        except sqlite3.OperationalError:
            print("[WARNING] No _sync_meta table found in SQLite source.")

        source_biz_id = int(meta.get("business_id", 1))
        biz_id = target_business_id if target_business_id is not None else source_biz_id
        biz_name = meta.get("business_name", "Restored Dealership")

        with transaction.atomic():
            # 1. Target Business
            business = Business.objects.filter(id=biz_id).first()
            if not business:
                business = Business.objects.create(id=biz_id, name=biz_name)
                print(f"[RESTORE] Created new Business #{biz_id} ({biz_name})")
            else:
                print(f"[RESTORE] Found existing Business #{biz_id} ({business.name})")

            # Update Business fields from SQLite
            cur.execute("SELECT * FROM business LIMIT 1;")
            biz_row = cur.fetchone()
            if biz_row:
                field_keys = biz_row.keys()
                for f in [
                    "address_country", "address_city", "address_street", "address_street_number",
                    "address_postal_code", "telephone_number", "fax_number", "email",
                    "bank_name", "bank_bic_swift", "bank_iban", "managing_director",
                    "tax_id", "eori_number", "ust_id_nr", "headquarters_city",
                    "court_district", "court_registration_number"
                ]:
                    if f in field_keys and biz_row[f] is not None:
                        setattr(business, f, biz_row[f])

                if "target_annual_return" in field_keys and biz_row["target_annual_return"]:
                    business.target_annual_return = Decimal(str(biz_row["target_annual_return"]))
                if "target_days_on_stock" in field_keys and biz_row["target_days_on_stock"] is not None:
                    business.target_days_on_stock = int(biz_row["target_days_on_stock"])
                business.save()

            # 2. Branches
            branch_map = {}
            cur.execute("SELECT * FROM branches;")
            for br in cur.fetchall():
                b_obj, _ = Branch.objects.update_or_create(
                    business=business, name=br["name"],
                    defaults={"address": br["address"] or "", "is_active": bool(br["is_active"])}
                )
                branch_map[b_obj.name] = b_obj

            # 3. Choices
            make_map = {}
            cur.execute("SELECT * FROM makes;")
            for m in cur.fetchall():
                m_obj, _ = Make.objects.update_or_create(
                    business=business, name=m["name"],
                    defaults={"is_active": bool(m["is_active"])}
                )
                make_map[m_obj.name] = m_obj

            model_map = {}
            cur.execute("SELECT * FROM vehicle_models;")
            for vm in cur.fetchall():
                make_obj = make_map.get(vm["make_name"]) or Make.objects.filter(business=business, name=vm["make_name"]).first()
                if make_obj:
                    vm_obj, _ = VehicleModel.objects.update_or_create(
                        business=business, make=make_obj, name=vm["name"],
                        defaults={"is_active": bool(vm["is_active"])}
                    )
                    model_map[(make_obj.name, vm_obj.name)] = vm_obj

            cur.execute("SELECT * FROM vehicle_types;")
            for vt in cur.fetchall():
                VehicleType.objects.update_or_create(business=business, name=vt["name"], defaults={"is_active": bool(vt["is_active"])})

            cur.execute("SELECT * FROM body_types;")
            for bt in cur.fetchall():
                BodyType.objects.update_or_create(
                    business=business, name=bt["name"],
                    defaults={"is_active": bool(bt["is_active"]), "mobile_de_mapping": bt["mobile_de_mapping"], "is_protected": bool(bt["is_protected"])}
                )

            cur.execute("SELECT * FROM colors;")
            for c in cur.fetchall():
                Color.objects.update_or_create(
                    business=business, name=c["name"],
                    defaults={"is_active": bool(c["is_active"]), "mobile_de_mapping": c["mobile_de_mapping"], "is_protected": bool(c["is_protected"])}
                )

            cur.execute("SELECT * FROM fuel_types;")
            for ft in cur.fetchall():
                FuelType.objects.update_or_create(
                    business=business, name=ft["name"],
                    defaults={"is_active": bool(ft["is_active"]), "mobile_de_mapping": ft["mobile_de_mapping"], "is_protected": bool(ft["is_protected"])}
                )

            cur.execute("SELECT * FROM damage_types;")
            for dt in cur.fetchall():
                DamageType.objects.update_or_create(business=business, name=dt["name"], defaults={"is_active": bool(dt["is_active"])})

            cur.execute("SELECT * FROM doors;")
            for d in cur.fetchall():
                DoorsChoice.objects.update_or_create(
                    business=business, name=d["name"],
                    defaults={"is_active": bool(d["is_active"]), "mobile_de_mapping": d["mobile_de_mapping"], "is_protected": bool(d["is_protected"])}
                )

            cur.execute("SELECT * FROM tax_percentages;")
            for tp in cur.fetchall():
                TaxPercentage.objects.update_or_create(
                    business=business, name=tp["name"],
                    defaults={"percentage": Decimal(str(tp["percentage"])), "is_active": bool(tp["is_active"])}
                )

            cur.execute("SELECT * FROM payment_methods;")
            for pm in cur.fetchall():
                PaymentMethod.objects.update_or_create(
                    business=business, name=pm["name"],
                    defaults={
                        "is_active": bool(pm["is_active"]),
                        "applies_to_buy": bool(pm["applies_to_buy"]),
                        "applies_to_sale": bool(pm["applies_to_sale"]),
                        "applies_to_transactions": bool(pm["applies_to_transactions"]),
                    }
                )

            cur.execute("SELECT * FROM currencies;")
            for c in cur.fetchall():
                Currency.objects.update_or_create(
                    business=business, code=c["code"],
                    defaults={"name": c["name"], "is_active": bool(c["is_active"])}
                )

            cur.execute("SELECT * FROM categories;")
            for cat in cur.fetchall():
                Category.objects.update_or_create(business=business, name=cat["name"], defaults={"is_active": bool(cat["is_active"])})

            cur.execute("SELECT * FROM subcategories;")
            for sc in cur.fetchall():
                parent_cat = Category.objects.filter(business=business, name=sc["category_name"]).first()
                if parent_cat:
                    Subcategory.objects.update_or_create(
                        business=business, category=parent_cat, name=sc["name"],
                        defaults={"is_active": bool(sc["is_active"])}
                    )

            # 4. Legal Entities
            entity_map = {}
            cur.execute("SELECT * FROM legal_entities;")
            entities = cur.fetchall()
            for le in entities:
                country_obj = Country.objects.filter(business=business, name=le["address_country"]).first() if le["address_country"] else None
                city_obj = City.objects.filter(business=business, name=le["address_city"]).first() if le["address_city"] else None

                obj, _ = LegalEntity.objects.update_or_create(
                    business=business, internal_id=le["internal_id"],
                    defaults={
                        "name": le["name"],
                        "address_street": le["address_street"] or "",
                        "address_street_number": le["address_street_number"] or "",
                        "address_postal_code": le["address_postal_code"] or "",
                        "address_city": city_obj,
                        "address_country": country_obj,
                        "status": le["status"] or "active",
                        "email": le["email"] or "",
                        "phone_number": le["phone_number"] or "",
                        "type": le["type"] or "customer",
                        "tax_identification_number": le["tax_identification_number"] or "",
                    }
                )
                entity_map[obj.internal_id] = obj

            # 5. Vehicles
            vehicle_map = {}
            cur.execute("SELECT * FROM vehicles;")
            vehicles = cur.fetchall()
            for v in vehicles:
                make_obj = Make.objects.filter(business=business, name=v["make"]).first() if v["make"] else None
                model_obj = VehicleModel.objects.filter(business=business, make=make_obj, name=v["model"]).first() if (make_obj and v["model"]) else None
                vtype_obj = VehicleType.objects.filter(business=business, name=v["vehicle_type"]).first() if v["vehicle_type"] else None
                body_obj = BodyType.objects.filter(business=business, name=v["body_type"]).first() if v["body_type"] else None
                color_obj = Color.objects.filter(business=business, name=v["color"]).first() if v["color"] else None
                fuel_obj = FuelType.objects.filter(business=business, name=v["fuel_type"]).first() if v["fuel_type"] else None
                damage_obj = DamageType.objects.filter(business=business, name=v["damage_type"]).first() if v["damage_type"] else None
                doors_obj = DoorsChoice.objects.filter(business=business, name=v["doors"]).first() if v["doors"] else None
                branch_obj = branch_map.get(v["branch"]) or Branch.objects.filter(business=business, name=v["branch"]).first() if v["branch"] else None

                buy_tax_obj = TaxPercentage.objects.filter(business=business, percentage=v["buy_tax_percentage"]).first() if v["buy_tax_percentage"] else None
                sale_tax_obj = TaxPercentage.objects.filter(business=business, percentage=v["sale_tax_percentage"]).first() if v["sale_tax_percentage"] else None

                buy_pm = PaymentMethod.objects.filter(business=business, name=v["buy_payment_method"]).first() if v["buy_payment_method"] else None
                sale_pm = PaymentMethod.objects.filter(business=business, name=v["sale_payment_method"]).first() if v["sale_payment_method"] else None

                seller_obj = entity_map.get(v["seller_internal_id"])
                buyer_obj = entity_map.get(v["buyer_internal_id"])

                v_obj, _ = Vehicle.objects.update_or_create(
                    business=business, internal_id=v["internal_id"],
                    defaults={
                        "status": v["status"] or "purchased",
                        "description": v["description"] or "",
                        "internal_comments": v["internal_comments"] or "",
                        "chassis_number": v["chassis_number"] or "",
                        "motor_vehicle_registration_number": v["motor_vehicle_registration_number"] or "",
                        "official_license_plate": v["official_license_plate"] or "",
                        "make": make_obj,
                        "model": model_obj,
                        "vehicle_type": vtype_obj,
                        "body_type": body_obj,
                        "color": color_obj,
                        "fuel_type": fuel_obj,
                        "damage_type": damage_obj,
                        "doors": doors_obj,
                        "year_of_construction": v["year_of_construction"],
                        "kilometer": v["kilometer"] or 0,
                        "power_kw": v["power_kw"],
                        "branch": branch_obj,
                        "first_registration_date": v["first_registration_date"],
                        "buy_date": v["buy_date"],
                        "buy_price": Decimal(str(v["buy_price"])) if v["buy_price"] else None,
                        "buy_tax": buy_tax_obj,
                        "buy_payment_method": buy_pm,
                        "buy_delivery_collection_date": v["buy_delivery_collection_date"],
                        "seller": seller_obj,
                        "buyer": buyer_obj,
                        "sale_date": v["sale_date"],
                        "sale_price": Decimal(str(v["sale_price"])) if v["sale_price"] else None,
                        "sale_tax": sale_tax_obj,
                        "sale_payment_method": sale_pm,
                        "sale_delivery_collection_date": v["sale_delivery_collection_date"],
                        "sale_invoice_number": v["sale_invoice_number"] or "",
                        "image": v["image"] or "",
                    }
                )
                vehicle_map[v_obj.internal_id] = v_obj

            # 6. Expenses & Earnings
            cur.execute("SELECT * FROM vehicle_expenses_earnings;")
            for ee in cur.fetchall():
                veh = vehicle_map.get(ee["vehicle_internal_id"])
                cat = Category.objects.filter(business=business, name=ee["category"]).first() if ee["category"] else None
                subcat = Subcategory.objects.filter(business=business, category=cat, name=ee["subcategory"]).first() if (cat and ee["subcategory"]) else None

                if veh and cat and subcat:
                    VehicleExpenseEarning.objects.create(
                        business=business,
                        vehicle=veh,
                        type=ee["type"] or "expense",
                        amount=Decimal(str(ee["amount"])) if ee["amount"] else Decimal("0.00"),
                        category=cat,
                        subcategory=subcat,
                        is_active=bool(ee["is_active"])
                    )

            # 7. Transactions
            cur.execute("SELECT * FROM transactions;")
            transactions = cur.fetchall()
            for t in transactions:
                veh = vehicle_map.get(t["vehicle_internal_id"])
                cat = Category.objects.filter(business=business, name=t["category"]).first() if t["category"] else None
                subcat = Subcategory.objects.filter(business=business, category=cat, name=t["subcategory"]).first() if (cat and t["subcategory"]) else None
                cur_obj = Currency.objects.filter(business=business, name=t["currency"]).first() or Currency.objects.filter(business=business, code="EUR").first()
                pm_obj = PaymentMethod.objects.filter(business=business, name=t["payment_method"]).first() if t["payment_method"] else None
                tax_val = Decimal(str(t["tax_percentage"])) if t["tax_percentage"] is not None else None

                DealershipTransaction.objects.update_or_create(
                    business=business, internal_id=t["internal_id"],
                    defaults={
                        "date": t["date"],
                        "datetime": t["datetime"] or "",
                        "status": t["status"] or "completed",
                        "description": t["description"] or "",
                        "amount": Decimal(str(t["amount"])) if t["amount"] else Decimal("0.00"),
                        "currency_fk": cur_obj,
                        "payment_method": pm_obj,
                        "tax": tax_val,
                        "category_fk": cat,
                        "subcategory_fk": subcat,
                        "vehicle": veh,
                        "from_or_to": t["from_or_to"] or "",
                        "internal_comments": t["internal_comments"] or "",
                    }
                )

            if dry_run:
                print("\n[DRY RUN] Rolling back atomic transaction (no database changes committed).")
                transaction.set_rollback(True)

    finally:
        src_conn.close()

    print("\n========================================================")
    print("  RESTORE FROM SQLITE COMPLETED SUCCESSFULLY")
    print(f"  - Vehicles Restored: {len(vehicles)}")
    print(f"  - Transactions Restored: {len(transactions)}")
    print(f"  - Legal Entities Restored: {len(entities)}")
    print("========================================================\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Restore DriveBase Dealership Business Data from Standalone SQLite File")
    parser.add_argument("sqlite_path", help="Path to drivebase_*.sqlite3 file")
    parser.add_argument("--business-id", type=int, default=None, help="Target business ID (default: read from metadata)")
    parser.add_argument("--dry-run", action="store_true", help="Simulate restore and rollback transaction")

    args = parser.parse_args()
    try:
        restore_from_sqlite(args.sqlite_path, args.business_id, args.dry_run)
    except Exception as e:
        print(f"\n[ERROR] Restore failed: {str(e)}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
