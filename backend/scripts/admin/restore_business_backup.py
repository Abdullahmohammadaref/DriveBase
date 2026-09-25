"""
Disaster Recovery Script: Restore Business Data from Backup ZIP
Usage:
    python scripts/admin/restore_business_backup.py <path_to_zip> [--business-id <id>] [--dry-run]
"""

import os
import sys
import json
import zipfile
import shutil
import argparse
from datetime import datetime
from decimal import Decimal

# Ensure backend directory is in sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "acar.settings")
import django
django.setup()

from django.db import transaction
from django.conf import settings
from manager.models import (
    Business, Branch, Country, City, LegalEntity, Make, VehicleModel, VehicleType,
    BodyType, Color, FuelType, DamageType, DoorsChoice, TaxPercentage,
    PaymentMethod, Currency, Category, Subcategory, KeyNumber,
    Vehicle, Transaction as DealershipTransaction, VehicleExpenseEarning
)

def create_db_snapshot():
    db_path = settings.DATABASES['default']['NAME']
    if os.path.exists(db_path):
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = f"{db_path}.pre_restore_{timestamp}.bak"
        shutil.copy2(db_path, backup_path)
        print(f"[BACKUP] Safety snapshot created at: {backup_path}")
        return backup_path
    return None

def restore_backup(zip_path: str, target_business_id: int = 1, dry_run: bool = False):
    if not os.path.isfile(zip_path):
        raise FileNotFoundError(f"Backup ZIP file not found at: {zip_path}")

    print(f"\n========================================================")
    print(f"  ACAR DEALERSHIP DISASTER RECOVERY RESTORE")
    print(f"  Target Business ID: {target_business_id}")
    print(f"  Archive: {zip_path}")
    print(f"  Dry Run: {dry_run}")
    print(f"========================================================\n")

    if not dry_run:
        create_db_snapshot()

    with zipfile.ZipFile(zip_path, 'r') as zf:
        archive_files = zf.namelist()
        required_files = [
            "data/business.json",
            "data/choices.json",
            "data/legal_entities.json",
            "data/vehicles.json",
            "data/transactions.json",
        ]
        for req in required_files:
            if req not in archive_files:
                raise ValueError(f"Corrupt or invalid backup ZIP: missing '{req}'")

        # Read JSON payloads
        business_data = json.loads(zf.read("data/business.json").decode('utf-8'))
        choices_data = json.loads(zf.read("data/choices.json").decode('utf-8'))
        entities_data = json.loads(zf.read("data/legal_entities.json").decode('utf-8'))
        vehicles_data = json.loads(zf.read("data/vehicles.json").decode('utf-8'))
        transactions_data = json.loads(zf.read("data/transactions.json").decode('utf-8'))
        
        expenses_data = []
        if "data/vehicle_expenses_earnings.json" in archive_files:
            expenses_data = json.loads(zf.read("data/vehicle_expenses_earnings.json").decode('utf-8'))

        with transaction.atomic():
            # 1. Target Business
            business = Business.objects.filter(id=target_business_id).first()
            if not business:
                business = Business.objects.create(
                    id=target_business_id,
                    name=business_data.get("name", "Restored Dealership")
                )
                print(f"[RESTORE] Created new Business #{target_business_id}")
            else:
                print(f"[RESTORE] Found existing Business #{target_business_id} ({business.name})")

            # Update Business profile fields
            for field in [
                "address_country", "address_city", "address_street", "address_street_number",
                "address_postal_code", "telephone_number", "fax_number", "email",
                "bank_name", "bank_bic_swift", "bank_iban", "managing_director",
                "tax_id", "eori_number", "ust_id_nr", "headquarters_city",
                "court_district", "court_registration_number"
            ]:
                if field in business_data and business_data[field] is not None:
                    setattr(business, field, business_data[field])

            if business_data.get("target_annual_return"):
                business.target_annual_return = Decimal(str(business_data["target_annual_return"]))
            if business_data.get("target_days_on_stock"):
                business.target_days_on_stock = int(business_data["target_days_on_stock"])
            business.save()

            # 2. Branches
            branch_map = {}
            for br in business_data.get("branches", []):
                branch_id = br.get("id")
                branch_obj = None
                if branch_id:
                    branch_obj = Branch.objects.filter(id=branch_id, business=business).first()
                if not branch_obj:
                    branch_obj = Branch.objects.filter(business=business, name=br["name"]).first()

                if branch_obj:
                    branch_obj.name = br["name"]
                    branch_obj.address = br.get("address", "")
                    branch_obj.is_active = br.get("is_active", True)
                    branch_obj.save()
                else:
                    branch_obj = Branch.objects.create(
                        business=business,
                        name=br["name"],
                        address=br.get("address", ""),
                        is_active=br.get("is_active", True)
                    )
                branch_map[branch_obj.name] = branch_obj

            # 3. Choices
            # Makes
            make_map = {}
            for m in choices_data.get("makes", []):
                obj, _ = Make.objects.update_or_create(
                    business=business, name=m["name"],
                    defaults={"is_active": m.get("is_active", True)}
                )
                make_map[obj.name] = obj

            # Vehicle Models
            model_map = {}
            for vm in choices_data.get("vehicle_models", []):
                make_obj = make_map.get(vm.get("make")) or Make.objects.filter(business=business, name=vm.get("make")).first()
                if make_obj:
                    obj, _ = VehicleModel.objects.update_or_create(
                        business=business, make=make_obj, name=vm["name"],
                        defaults={"is_active": vm.get("is_active", True)}
                    )
                    model_map[(make_obj.name, obj.name)] = obj

            # Vehicle Types
            vtype_map = {}
            for vt in choices_data.get("vehicle_types", []):
                obj, _ = VehicleType.objects.update_or_create(
                    business=business, name=vt["name"],
                    defaults={"is_active": vt.get("is_active", True)}
                )
                vtype_map[obj.name] = obj

            # Body Types
            body_map = {}
            for bt in choices_data.get("body_types", []):
                obj, _ = BodyType.objects.update_or_create(
                    business=business, name=bt["name"],
                    defaults={"is_active": bt.get("is_active", True)}
                )
                body_map[obj.name] = obj

            # Colors
            color_map = {}
            for col in choices_data.get("colors", []):
                obj, _ = Color.objects.update_or_create(
                    business=business, name=col["name"],
                    defaults={"is_active": col.get("is_active", True)}
                )
                color_map[obj.name] = obj

            # Fuel Types
            fuel_map = {}
            for ft in choices_data.get("fuel_types", []):
                obj, _ = FuelType.objects.update_or_create(
                    business=business, name=ft["name"],
                    defaults={"is_active": ft.get("is_active", True)}
                )
                fuel_map[obj.name] = obj

            # Damage Types
            damage_map = {}
            for dt in choices_data.get("damage_types", []):
                obj, _ = DamageType.objects.update_or_create(
                    business=business, name=dt["name"],
                    defaults={"is_active": dt.get("is_active", True)}
                )
                damage_map[obj.name] = obj

            # Doors
            doors_map = {}
            for dr in choices_data.get("doors", []):
                obj, _ = DoorsChoice.objects.update_or_create(
                    business=business, name=dr["name"],
                    defaults={"is_active": dr.get("is_active", True)}
                )
                doors_map[obj.name] = obj

            # Tax Percentages
            tax_map = {}
            for tp in choices_data.get("tax_percentages", []):
                obj, _ = TaxPercentage.objects.update_or_create(
                    business=business, name=tp["name"],
                    defaults={
                        "percentage": Decimal(str(tp.get("percentage", 0))),
                        "is_active": tp.get("is_active", True)
                    }
                )
                tax_map[str(tp.get("percentage"))] = obj
                tax_map[obj.name] = obj

            # Payment Methods
            payment_map = {}
            for pm in choices_data.get("payment_methods", []):
                obj, _ = PaymentMethod.objects.update_or_create(
                    business=business, name=pm["name"],
                    defaults={
                        "is_active": pm.get("is_active", True),
                        "applies_to_buy": pm.get("applies_to_buy", True),
                        "applies_to_sale": pm.get("applies_to_sale", True),
                        "applies_to_transactions": pm.get("applies_to_transactions", True),
                    }
                )
                payment_map[obj.name] = obj

            # Currencies
            currency_map = {}
            for cur in choices_data.get("currencies", []):
                obj, _ = Currency.objects.update_or_create(
                    business=business, code=cur.get("code", "EUR"),
                    defaults={
                        "name": cur.get("name", "Euro"),
                        "is_active": cur.get("is_active", True)
                    }
                )
                currency_map[obj.name] = obj
                currency_map[obj.code] = obj

            # Categories & Subcategories
            cat_map = {}
            for c in choices_data.get("categories", []):
                obj, _ = Category.objects.update_or_create(
                    business=business, name=c["name"],
                    defaults={"is_active": c.get("is_active", True)}
                )
                cat_map[obj.name] = obj

            subcat_map = {}
            for sc in choices_data.get("subcategories", []):
                cat_obj = cat_map.get(sc.get("category")) or Category.objects.filter(business=business, name=sc.get("category")).first()
                if cat_obj:
                    obj, _ = Subcategory.objects.update_or_create(
                        business=business, category=cat_obj, name=sc["name"],
                        defaults={"is_active": sc.get("is_active", True)}
                    )
                    subcat_map[(cat_obj.name, obj.name)] = obj

            # Key Numbers
            key_map = {}
            for kn in choices_data.get("key_numbers", []):
                obj, _ = KeyNumber.objects.update_or_create(
                    business=business, number=kn["number"],
                    defaults={"is_active": kn.get("is_active", True)}
                )
                key_map[obj.number] = obj

            # 4. Legal Entities
            entity_map = {}
            for ent in entities_data:
                city_id = ent.get("address_city")
                country_id = ent.get("address_country")
                obj, _ = LegalEntity.objects.update_or_create(
                    business=business, internal_id=ent["internal_id"],
                    defaults={
                        "name": ent.get("name", ""),
                        "address_street": ent.get("address_street", ""),
                        "address_street_number": ent.get("address_street_number", 0) or 0,
                        "address_postal_code": ent.get("address_postal_code", ""),
                        "address_city_id": city_id if city_id and City.objects.filter(id=city_id).exists() else None,
                        "address_country_id": country_id if country_id and Country.objects.filter(id=country_id).exists() else None,
                        "status": ent.get("status", "active"),
                        "email": ent.get("email"),
                        "phone_number": ent.get("phone_number"),
                        "type": ent.get("type", "company"),
                        "tax_identification_number": ent.get("tax_identification_number"),
                    }
                )
                entity_map[obj.internal_id] = obj

            # 5. Vehicles
            vehicle_map = {}
            for v in vehicles_data:
                v_make = make_map.get(v.get("make"))
                v_model = model_map.get((v.get("make"), v.get("model")))
                v_type = vtype_map.get(v.get("vehicle_type"))
                v_body = body_map.get(v.get("body_type"))
                v_color = color_map.get(v.get("color"))
                v_fuel = fuel_map.get(v.get("fuel_type"))
                v_damage = damage_map.get(v.get("damage_type"))
                v_doors = doors_map.get(v.get("doors"))
                v_branch = branch_map.get(v.get("branch"))
                
                v_buy_tax = tax_map.get(str(v.get("buy_tax_percentage")))
                v_sale_tax = tax_map.get(str(v.get("sale_tax_percentage")))
                v_buy_pm = payment_map.get(v.get("buy_payment_method"))
                v_sale_pm = payment_map.get(v.get("sale_payment_method"))
                v_seller = entity_map.get(v.get("seller_internal_id"))
                v_buyer = entity_map.get(v.get("buyer_internal_id"))

                obj, _ = Vehicle.objects.update_or_create(
                    business=business, internal_id=v["internal_id"],
                    defaults={
                        "status": v.get("status", "purchased"),
                        "description": v.get("description", ""),
                        "internal_comments": v.get("internal_comments", ""),
                        "chassis_number": v.get("chassis_number"),
                        "motor_vehicle_registration_number": v.get("motor_vehicle_registration_number"),
                        "official_license_plate": v.get("official_license_plate"),
                        "make": v_make,
                        "model": v_model,
                        "vehicle_type": v_type,
                        "body_type": v_body,
                        "color": v_color,
                        "fuel_type": v_fuel,
                        "damage_type": v_damage,
                        "doors": v_doors,
                        "year_of_construction": v.get("year_of_construction"),
                        "kilometer": v.get("kilometer"),
                        "power_kw": v.get("power_kw"),
                        "branch": v_branch,
                        "first_registration_date": v.get("first_registration_date"),
                        "buy_date": v.get("buy_date"),
                        "buy_price": Decimal(str(v["buy_price"])) if v.get("buy_price") else None,
                        "buy_tax": v_buy_tax,
                        "buy_payment_method": v_buy_pm,
                        "buy_delivery_collection_date": v.get("buy_delivery_collection_date"),
                        "seller": v_seller,
                        "buyer": v_buyer,
                        "sale_date": v.get("sale_date"),
                        "sale_price": Decimal(str(v["sale_price"])) if v.get("sale_price") else None,
                        "sale_tax": v_sale_tax,
                        "sale_payment_method": v_sale_pm,
                        "sale_delivery_collection_date": v.get("sale_delivery_collection_date"),
                        "sale_invoice_number": v.get("sale_invoice_number"),
                    }
                )
                vehicle_map[obj.internal_id] = obj

            # 6. Expenses / Earnings
            for ee in expenses_data:
                v_obj = vehicle_map.get(ee.get("vehicle_internal_id"))
                c_obj = cat_map.get(ee.get("category"))
                sc_obj = subcat_map.get((ee.get("category"), ee.get("subcategory"))) if c_obj else None
                amt = Decimal(str(ee["amount"])) if ee.get("amount") else Decimal('0.00')
                if v_obj:
                    existing = VehicleExpenseEarning.objects.filter(
                        business=business, vehicle=v_obj,
                        type=ee.get("type", "expense"),
                        category=c_obj, subcategory=sc_obj, amount=amt
                    ).first()
                    if existing:
                        existing.is_active = ee.get("is_active", True)
                        existing.save()
                    else:
                        VehicleExpenseEarning.objects.create(
                            business=business, vehicle=v_obj,
                            type=ee.get("type", "expense"),
                            amount=amt,
                            category=c_obj,
                            subcategory=sc_obj,
                            is_active=ee.get("is_active", True)
                        )

            # 7. Transactions
            for t in transactions_data:
                v_obj = vehicle_map.get(t.get("vehicle_internal_id"))
                c_obj = cat_map.get(t.get("category"))
                sc_obj = subcat_map.get((t.get("category"), t.get("subcategory"))) if c_obj else None
                cur_obj = currency_map.get(t.get("currency")) or Currency.objects.filter(business=business, code="EUR").first()
                pm_obj = payment_map.get(t.get("payment_method"))
                tax_val = Decimal(str(t["tax_percentage"])) if t.get("tax_percentage") is not None else None

                DealershipTransaction.objects.update_or_create(
                    business=business, internal_id=t["internal_id"],
                    defaults={
                        "date": t.get("date"),
                        "datetime": t.get("datetime"),
                        "status": t.get("status", "completed"),
                        "description": t.get("description", ""),
                        "amount": Decimal(str(t["amount"])) if t.get("amount") else Decimal('0.00'),
                        "currency_fk": cur_obj,
                        "payment_method": pm_obj,
                        "tax": tax_val,
                        "category_fk": c_obj,
                        "subcategory_fk": sc_obj,
                        "vehicle": v_obj,
                        "from_or_to": t.get("from_or_to", ""),
                        "internal_comments": t.get("internal_comments", ""),
                    }
                )

            # 8. Unpack Media Files
            media_root = settings.MEDIA_ROOT
            for member in archive_files:
                if member.startswith("media/") and not member.endswith("/"):
                    rel_path = member[len("media/"):]
                    target_file = os.path.join(media_root, rel_path)
                    os.makedirs(os.path.dirname(target_file), exist_ok=True)
                    with zf.open(member) as src, open(target_file, "wb") as dst:
                        shutil.copyfileobj(src, dst)

            if dry_run:
                print("\n[DRY RUN] Rolling back atomic transaction (no database changes committed).")
                transaction.set_rollback(True)

    print("\n========================================================")
    print("  RESTORE COMPLETED SUCCESSFULLY")
    print(f"  - Vehicles Restored: {len(vehicles_data)}")
    print(f"  - Transactions Restored: {len(transactions_data)}")
    print(f"  - Legal Entities Restored: {len(entities_data)}")
    print(f"  - Choice Categories Restored: {len(choices_data)}")
    print("========================================================\n")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Restore ACAR Dealership Business Data from ZIP Archive")
    parser.add_argument("zip_path", help="Path to acar_export_*.zip file")
    parser.add_argument("--business-id", type=int, default=1, help="Target business ID (default: 1)")
    parser.add_argument("--dry-run", action="store_true", help="Simulate restore and rollback transaction")

    args = parser.parse_args()
    try:
        restore_backup(args.zip_path, args.business_id, args.dry_run)
    except Exception as e:
        print(f"\n[ERROR] Restore failed: {str(e)}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
