"""
Helpers for Conditional Safe-Delete and Deactivation Architecture.
Calculates entity dependencies and performs conditional hard/soft deletion.
"""
from typing import Optional, Dict, Any, List
from django.db.models import Q
from django.shortcuts import get_object_or_404

from .models import (
    Vehicle, Transaction, LegalEntity, Make, VehicleModel,
    VehicleType, BodyType, Color, FuelType, DamageType,
    DoorsChoice, PaymentMethod, TaxPercentage, Category,
    Subcategory, Currency, KeyNumber, VehicleExpenseEarning,
    Country, City
)


CHOICE_MODEL_MAP = {
    'payment_method': PaymentMethod,
    'vehicle_type': VehicleType,
    'body_type': BodyType,
    'make': Make,
    'vehicle_model': VehicleModel,
    'color': Color,
    'fuel_type': FuelType,
    'damage_type': DamageType,
    'doors': DoorsChoice,
    'tax_percentage': TaxPercentage,
    'category': Category,
    'subcategory': Subcategory,
    'currency': Currency,
    'key_number': KeyNumber,
    'country': Country,
    'city': City,
}


def check_entity_dependencies(business, entity_type: str, entity_id: int, choice_type: Optional[str] = None) -> Dict[str, Any]:
    """
    Inspects relations to determine if an entity can be permanently deleted
    or must be safely deactivated to preserve accounting/audit integrity.
    """
    entity_name = ""
    can_hard_delete = True
    action = "delete"
    dependency_details: List[str] = []
    recent_items: List[str] = []
    linked_items: List[Dict[str, Any]] = []
    message = ""

    if entity_type == "vehicle":
        vehicle = get_object_or_404(Vehicle, business=business, internal_id=entity_id)
        entity_name = str(vehicle)
        
        txs = vehicle.vehicle_transactions.all()
        tx_count = txs.count()
        
        ees = vehicle.expenses_earnings.filter(is_active=True)
        ee_count = ees.count()
        
        total_deps = tx_count + ee_count
        if total_deps == 0:
            can_hard_delete = True
            action = "delete"
            message = "This vehicle has no linked transactions or expenses. It will be permanently removed."
        else:
            can_hard_delete = False
            action = "deactivate"
            message = "This vehicle is connected to business records. It will be safely deactivated and hidden from active views."
            if tx_count > 0:
                dependency_details.append(f"{tx_count} Transaction{'s' if tx_count != 1 else ''}")
            if ee_count > 0:
                dependency_details.append(f"{ee_count} Expense/Earning{'s' if ee_count != 1 else ''}")
            
            for tx in txs[:100]:
                recent_items.append(f"TX #{tx.internal_id}: €{tx.amount}")
                linked_items.append({
                    "type": "transaction",
                    "id": tx.internal_id,
                    "title": f"Transaction #{tx.internal_id}",
                    "subtitle": f"{tx.category or 'Transaction'} • €{tx.amount:,.2f}",
                    "url_path": f"transactions/{tx.internal_id}/edit",
                })
            for ee in ees[:100]:
                cat_name = ee.category.name if ee.category else ee.type.title()
                sub_name = f" ({ee.subcategory.name})" if ee.subcategory else ""
                date_str = ee.created_at.strftime('%d.%m.%Y') if hasattr(ee, 'created_at') and ee.created_at else ''
                recent_items.append(f"{cat_name}{sub_name}: €{ee.amount:,.2f}")
                linked_items.append({
                    "type": "expense",
                    "id": ee.id,
                    "title": f"{ee.type.title()}: {cat_name}{sub_name}",
                    "subtitle": f"€{ee.amount:,.2f}" + (f" • {date_str}" if date_str else ""),
                    "url_path": f"vehicles/{vehicle.internal_id}/edit",
                })

    elif entity_type == "transaction":
        tx = get_object_or_404(Transaction, business=business, internal_id=entity_id)
        entity_name = f"Transaction #{tx.internal_id}"
        
        if tx.vehicle is not None:
            total_deps = 1
            can_hard_delete = False
            action = "deactivate"
            v = tx.vehicle
            v_name = f"{v.make.name if v.make else ''} {v.model.name if v.model else ''}".strip() or str(v)
            dependency_details.append("1 Vehicle")
            recent_items.append(f"Vehicle #{v.internal_id}: {v_name}")
            linked_items.append({
                "type": "vehicle",
                "id": v.internal_id,
                "title": f"Vehicle #{v.internal_id}: {v_name}",
                "subtitle": f"VIN: {v.chassis_number or 'N/A'}",
                "url_path": f"vehicles/{v.internal_id}/edit",
            })
            message = "This transaction is connected to a vehicle record. It will be safely deactivated and hidden from active views."
        else:
            total_deps = 0
            can_hard_delete = True
            action = "delete"
            message = "This standalone transaction has no linked vehicle. It will be permanently removed."

    elif entity_type == "legal_entity":
        entity = get_object_or_404(LegalEntity, business=business, internal_id=entity_id)
        entity_name = entity.name
        
        v_qs = Vehicle.objects.filter(business=business).filter(Q(seller=entity) | Q(buyer=entity)).distinct()
        total_v = v_qs.count()
        tx_qs = Transaction.objects.filter(business=business, from_or_to__iexact=entity.name).distinct()
        total_tx = tx_qs.count()
        total_deps = total_v + total_tx
        
        if total_deps == 0:
            can_hard_delete = True
            action = "delete"
            message = "This legal entity has no associated vehicles or transactions. It will be permanently removed."
        else:
            can_hard_delete = False
            action = "deactivate"
            message = "This legal entity is connected to business records. It will be safely deactivated and hidden from active views."
            if total_v > 0:
                dependency_details.append(f"{total_v} Vehicle{'s' if total_v != 1 else ''}")
            if total_tx > 0:
                dependency_details.append(f"{total_tx} Transaction{'s' if total_tx != 1 else ''}")

            for v in v_qs[:100]:
                role = "Seller" if v.seller_id == entity.id else "Buyer"
                v_name = f"{v.make.name if v.make else ''} {v.model.name if v.model else ''}".strip() or str(v)
                linked_items.append({
                    "type": "vehicle",
                    "id": v.internal_id,
                    "title": f"Vehicle #{v.internal_id}: {v_name}",
                    "subtitle": f"Role: {role}",
                    "url_path": f"vehicles/{v.internal_id}/edit",
                })
            for tx in tx_qs[:100]:
                linked_items.append({
                    "type": "transaction",
                    "id": tx.internal_id,
                    "title": f"Transaction #{tx.internal_id}",
                    "subtitle": f"{tx.category or 'Transaction'} • €{tx.amount:,.2f}" if tx.amount else f"{tx.category or 'Transaction'}",
                    "url_path": f"transactions/{tx.internal_id}/edit",
                })

    elif entity_type == "choice":
        if not choice_type or choice_type not in CHOICE_MODEL_MAP:
            return {
                "can_hard_delete": False,
                "action": "deactivate",
                "entity_name": "Choice",
                "dependencies_count": 0,
                "dependency_details": [],
                "recent_items": [],
                "linked_items": [],
                "message": "Invalid choice type."
            }
        
        model_class = CHOICE_MODEL_MAP[choice_type]
        choice = get_object_or_404(model_class, business=business, id=entity_id)
        entity_name = getattr(choice, 'name', str(getattr(choice, 'number', 'Choice')))
        
        total_deps = 0
        if choice_type == 'make':
            v_qs = Vehicle.objects.filter(business=business, make_id=entity_id)
            v_count = v_qs.count()
            m_count = VehicleModel.objects.filter(business=business, make_id=entity_id).count()
            total_deps = v_count + m_count
            if v_count > 0:
                dependency_details.append(f"{v_count} Vehicle{'s' if v_count != 1 else ''}")
                for v in v_qs[:100]:
                    v_name = f"{v.make.name if v.make else ''} {v.model.name if v.model else ''}".strip() or str(v)
                    linked_items.append({
                        "type": "vehicle",
                        "id": v.internal_id,
                        "title": f"Vehicle #{v.internal_id}: {v_name}",
                        "subtitle": f"Status: {v.get_status_display()}",
                        "url_path": f"vehicles/{v.internal_id}/edit",
                    })
            if m_count > 0:
                dependency_details.append(f"{m_count} Model{'s' if m_count != 1 else ''}")
        elif choice_type == 'vehicle_model':
            v_qs = Vehicle.objects.filter(business=business, model_id=entity_id)
            total_deps = v_qs.count()
            if total_deps > 0:
                dependency_details.append(f"{total_deps} Vehicle{'s' if total_deps != 1 else ''}")
                for v in v_qs[:100]:
                    v_name = f"{v.make.name if v.make else ''} {v.model.name if v.model else ''}".strip() or str(v)
                    linked_items.append({
                        "type": "vehicle",
                        "id": v.internal_id,
                        "title": f"Vehicle #{v.internal_id}: {v_name}",
                        "subtitle": f"Status: {v.get_status_display()}",
                        "url_path": f"vehicles/{v.internal_id}/edit",
                    })
        elif choice_type in ['color', 'fuel_type', 'vehicle_type', 'body_type', 'damage_type', 'doors']:
            fk_field = f"{choice_type}_id" if choice_type != 'doors' else "doors_id"
            v_qs = Vehicle.objects.filter(business=business, **{fk_field: entity_id})
            total_deps = v_qs.count()
            if total_deps > 0:
                dependency_details.append(f"{total_deps} Vehicle{'s' if total_deps != 1 else ''}")
                for v in v_qs[:100]:
                    v_name = f"{v.make.name if v.make else ''} {v.model.name if v.model else ''}".strip() or str(v)
                    linked_items.append({
                        "type": "vehicle",
                        "id": v.internal_id,
                        "title": f"Vehicle #{v.internal_id}: {v_name}",
                        "subtitle": f"Status: {v.get_status_display()}",
                        "url_path": f"vehicles/{v.internal_id}/edit",
                    })
        elif choice_type == 'payment_method':
            v_qs = Vehicle.objects.filter(business=business).filter(
                Q(buy_payment_method_id=entity_id) | Q(sale_payment_method_id=entity_id)
            )
            v_count = v_qs.count()
            tx_qs = Transaction.objects.filter(business=business, payment_method_id=entity_id)
            tx_count = tx_qs.count()
            total_deps = v_count + tx_count
            if v_count > 0:
                dependency_details.append(f"{v_count} Vehicle{'s' if v_count != 1 else ''}")
                for v in v_qs[:100]:
                    v_name = f"{v.make.name if v.make else ''} {v.model.name if v.model else ''}".strip() or str(v)
                    linked_items.append({
                        "type": "vehicle",
                        "id": v.internal_id,
                        "title": f"Vehicle #{v.internal_id}: {v_name}",
                        "subtitle": "Payment Method",
                        "url_path": f"vehicles/{v.internal_id}/edit",
                    })
            if tx_count > 0:
                dependency_details.append(f"{tx_count} Transaction{'s' if tx_count != 1 else ''}")
                for tx in tx_qs[:100]:
                    linked_items.append({
                        "type": "transaction",
                        "id": tx.internal_id,
                        "title": f"Transaction #{tx.internal_id}",
                        "subtitle": f"€{tx.amount:,.2f} • {tx.date}",
                        "url_path": f"transactions/{tx.internal_id}/edit",
                    })
        elif choice_type == 'tax_percentage':
            v_qs = Vehicle.objects.filter(business=business).filter(
                Q(buy_tax_id=entity_id) | Q(sale_tax_id=entity_id)
            )
            total_deps = v_qs.count()
            if total_deps > 0:
                dependency_details.append(f"{total_deps} Vehicle{'s' if total_deps != 1 else ''}")
                for v in v_qs[:100]:
                    v_name = f"{v.make.name if v.make else ''} {v.model.name if v.model else ''}".strip() or str(v)
                    linked_items.append({
                        "type": "vehicle",
                        "id": v.internal_id,
                        "title": f"Vehicle #{v.internal_id}: {v_name}",
                        "subtitle": "Tax Percentage",
                        "url_path": f"vehicles/{v.internal_id}/edit",
                    })
        elif choice_type == 'category':
            tx_qs = Transaction.objects.filter(business=business, category=choice.name)
            tx_count = tx_qs.count()
            ee_count = VehicleExpenseEarning.objects.filter(business=business, category_id=entity_id).count()
            sub_count = Subcategory.objects.filter(business=business, category_id=entity_id).count()
            total_deps = tx_count + ee_count + sub_count
            if tx_count + ee_count > 0:
                dependency_details.append(f"{tx_count + ee_count} Transaction/Expense record(s)")
                for tx in tx_qs[:100]:
                    linked_items.append({
                        "type": "transaction",
                        "id": tx.internal_id,
                        "title": f"Transaction #{tx.internal_id}",
                        "subtitle": f"Category: {choice.name}",
                        "url_path": f"transactions/{tx.internal_id}/edit",
                    })
            if sub_count > 0:
                dependency_details.append(f"{sub_count} Subcategory(ies)")
        elif choice_type == 'subcategory':
            tx_qs = Transaction.objects.filter(business=business, subcategory=choice.name)
            tx_count = tx_qs.count()
            ee_count = VehicleExpenseEarning.objects.filter(business=business, subcategory_id=entity_id).count()
            total_deps = tx_count + ee_count
            if total_deps > 0:
                dependency_details.append(f"{total_deps} Record{'s' if total_deps != 1 else ''}")
                for tx in tx_qs[:100]:
                    linked_items.append({
                        "type": "transaction",
                        "id": tx.internal_id,
                        "title": f"Transaction #{tx.internal_id}",
                        "subtitle": f"Subcategory: {choice.name}",
                        "url_path": f"transactions/{tx.internal_id}/edit",
                    })
        elif choice_type == 'key_number':
            if hasattr(choice, 'vehicle') and choice.vehicle:
                total_deps = 1
                v = choice.vehicle
                v_name = f"{v.make.name if v.make else ''} {v.model.name if v.model else ''}".strip() or str(v)
                dependency_details.append("1 Assigned Vehicle")
                linked_items.append({
                    "type": "vehicle",
                    "id": v.internal_id,
                    "title": f"Vehicle #{v.internal_id}: {v_name}",
                    "subtitle": "Assigned Key Number",
                    "url_path": f"vehicles/{v.internal_id}/edit",
                })
        elif choice_type == 'country':
            city_count = City.objects.filter(business=business, country_id=entity_id).count()
            le_count = LegalEntity.objects.filter(business=business, address_country_id=entity_id).count()
            total_deps = city_count + le_count
            if city_count > 0:
                dependency_details.append(f"{city_count} Cit{'ies' if city_count != 1 else 'y'}")
            if le_count > 0:
                dependency_details.append(f"{le_count} Legal Entit{'ies' if le_count != 1 else 'y'}")
                for le in LegalEntity.objects.filter(business=business, address_country_id=entity_id)[:100]:
                    linked_items.append({
                        "type": "choice",
                        "id": le.internal_id,
                        "title": f"Legal Entity: {le.name}",
                        "subtitle": "Address Country",
                        "url_path": "legal-entities",
                    })
        elif choice_type == 'city':
            le_count = LegalEntity.objects.filter(business=business, address_city_id=entity_id).count()
            total_deps = le_count
            if le_count > 0:
                dependency_details.append(f"{le_count} Legal Entit{'ies' if le_count != 1 else 'y'}")
                for le in LegalEntity.objects.filter(business=business, address_city_id=entity_id)[:100]:
                    linked_items.append({
                        "type": "choice",
                        "id": le.internal_id,
                        "title": f"Legal Entity: {le.name}",
                        "subtitle": "Address City",
                        "url_path": "legal-entities",
                    })

        if total_deps == 0:
            can_hard_delete = True
            action = "delete"
            message = "This option is not used by any records. It will be permanently removed."
        else:
            can_hard_delete = False
            action = "deactivate"
            message = "This choice option is referenced by existing records. It will be safely deactivated and hidden from active views."

    return {
        "can_hard_delete": can_hard_delete,
        "action": action,
        "entity_name": entity_name,
        "dependencies_count": total_deps,
        "dependency_details": dependency_details,
        "recent_items": recent_items,
        "linked_items": linked_items,
        "message": message,
    }


def execute_unlink_and_delete(business, entity_type: str, entity_id: int) -> Dict[str, Any]:
    """
    Safely unlinks related operational records (preserving standalone ledger integrity)
    and permanently deletes the specified entity.
    """
    from django.db import transaction as db_transaction
    purged_counts: Dict[str, int] = {}
    
    with db_transaction.atomic():
        if entity_type == "vehicle":
            vehicle = get_object_or_404(Vehicle, business=business, internal_id=entity_id)
            entity_name = str(vehicle)
            
            # 1. Unlink key numbers
            KeyNumber.objects.filter(vehicle=vehicle).update(vehicle=None)
            
            # 2. Safely unlink vehicle transactions (preserve as standalone general ledger records)
            tx_count = vehicle.vehicle_transactions.all().update(vehicle=None)
            if tx_count > 0:
                purged_counts["unlinked_transactions"] = tx_count
                
            # 3. Delete vehicle expenses and earnings
            ee_count, _ = vehicle.expenses_earnings.all().delete()
            if ee_count > 0:
                purged_counts["expenses"] = ee_count
                
            # 4. Delete vehicle
            vehicle.delete()
            return {
                "success": True,
                "action": "deleted",
                "entity_name": entity_name,
                "purged_counts": purged_counts,
                "message": f"Vehicle #{entity_id} permanently deleted. {tx_count} linked transactions were preserved as standalone records."
            }
            
        elif entity_type == "transaction":
            tx = get_object_or_404(Transaction, business=business, internal_id=entity_id)
            entity_name = f"Transaction #{tx.internal_id}"
            
            # Unlink from vehicle before deletion
            if tx.vehicle:
                tx.vehicle = None
                tx.save(update_fields=["vehicle"])
                
            tx.delete()
            return {
                "success": True,
                "action": "deleted",
                "entity_name": entity_name,
                "purged_counts": {},
                "message": f"Transaction #{entity_id} permanently deleted. Vehicle remained intact."
            }
        else:
            raise ValueError(f"Unlink and delete is only supported for operational peers (vehicle, transaction). Received: {entity_type}")


def execute_cascade_delete(business, entity_type: str, entity_id: int, choice_type: Optional[str] = None) -> Dict[str, Any]:
    """
    Administratively force-deletes an entity and its dependent child records
    inside an atomic database transaction.
    """
    from django.db import transaction as db_transaction
    purged_counts: Dict[str, int] = {}
    
    with db_transaction.atomic():
        if entity_type == "vehicle":
            vehicle = get_object_or_404(Vehicle, business=business, internal_id=entity_id)
            entity_name = str(vehicle)
            
            # 1. Unlink key numbers
            KeyNumber.objects.filter(vehicle=vehicle).update(vehicle=None)
            
            # 2. Cascade delete vehicle transactions (PERMANENT PURGE of all connected transactions)
            tx_count, _ = vehicle.vehicle_transactions.all().delete()
            if tx_count > 0:
                purged_counts["transactions"] = tx_count
                
            # 3. Delete vehicle expenses and earnings
            ee_count, _ = vehicle.expenses_earnings.all().delete()
            if ee_count > 0:
                purged_counts["expenses"] = ee_count
                
            # 4. Delete vehicle
            vehicle.delete()
            return {
                "success": True,
                "action": "deleted",
                "entity_name": entity_name,
                "purged_counts": purged_counts,
                "message": f"Vehicle #{entity_id} and {tx_count} connected transactions permanently deleted."
            }
            
        elif entity_type == "transaction":
            tx = get_object_or_404(Transaction, business=business, internal_id=entity_id)
            entity_name = f"Transaction #{tx.internal_id}"
            tx.delete()
            return {
                "success": True,
                "action": "deleted",
                "entity_name": entity_name,
                "purged_counts": {},
                "message": f"Transaction #{entity_id} permanently deleted."
            }
            
        elif entity_type == "legal_entity":
            entity = get_object_or_404(LegalEntity, business=business, internal_id=entity_id)
            entity_name = entity.name
            
            # 1. Nullify references on vehicles
            v_seller = Vehicle.objects.filter(business=business, seller=entity).update(seller=None)
            v_buyer = Vehicle.objects.filter(business=business, buyer=entity).update(buyer=None)
            if v_seller + v_buyer > 0:
                purged_counts["unlinked_vehicles"] = v_seller + v_buyer
                
            # 2. Delete linked transactions
            tx_count, _ = Transaction.objects.filter(business=business, from_or_to__iexact=entity.name).delete()
            if tx_count > 0:
                purged_counts["transactions"] = tx_count
                
            # 3. Delete entity
            entity.delete()
            return {
                "success": True,
                "action": "deleted",
                "entity_name": entity_name,
                "purged_counts": purged_counts,
                "message": f"Legal Entity '{entity_name}' permanently deleted."
            }
            
        elif entity_type == "choice":
            if not choice_type or choice_type not in CHOICE_MODEL_MAP:
                raise ValueError(f"Invalid choice type: {choice_type}")
                
            model_class = CHOICE_MODEL_MAP[choice_type]
            choice = get_object_or_404(model_class, business=business, id=entity_id)
            entity_name = getattr(choice, 'name', str(getattr(choice, 'number', 'Choice')))
            
            # Nullify references in Vehicle or related models
            if choice_type == 'make':
                Vehicle.objects.filter(business=business, make=choice).update(make=None)
                VehicleModel.objects.filter(business=business, make=choice).delete()
            elif choice_type == 'vehicle_model':
                Vehicle.objects.filter(business=business, model=choice).update(model=None)
            elif choice_type == 'color':
                Vehicle.objects.filter(business=business, color=choice).update(color=None)
            elif choice_type == 'fuel_type':
                Vehicle.objects.filter(business=business, fuel_type=choice).update(fuel_type=None)
            elif choice_type == 'vehicle_type':
                Vehicle.objects.filter(business=business, vehicle_type=choice).update(vehicle_type=None)
            elif choice_type == 'body_type':
                Vehicle.objects.filter(business=business, body_type=choice).update(body_type=None)
            elif choice_type == 'damage_type':
                Vehicle.objects.filter(business=business, damage_type=choice).update(damage_type=None)
            elif choice_type == 'doors':
                Vehicle.objects.filter(business=business, doors=choice).update(doors=None)
            elif choice_type == 'payment_method':
                Vehicle.objects.filter(business=business, buy_payment_method=choice).update(buy_payment_method=None)
                Vehicle.objects.filter(business=business, sale_payment_method=choice).update(sale_payment_method=None)
                Transaction.objects.filter(business=business, payment_method=choice).update(payment_method=None)
            elif choice_type == 'tax_percentage':
                Vehicle.objects.filter(business=business, buy_tax=choice).update(buy_tax=None)
                Vehicle.objects.filter(business=business, sale_tax=choice).update(sale_tax=None)
            elif choice_type == 'category':
                Subcategory.objects.filter(business=business, category=choice).delete()
                VehicleExpenseEarning.objects.filter(business=business, category=choice).update(category=None)
            elif choice_type == 'subcategory':
                VehicleExpenseEarning.objects.filter(business=business, subcategory=choice).update(subcategory=None)
            elif choice_type == 'key_number':
                if hasattr(choice, 'vehicle') and choice.vehicle:
                    choice.vehicle = None
                    choice.save()
            elif choice_type == 'country':
                City.objects.filter(business=business, country=choice).delete()
                LegalEntity.objects.filter(business=business, address_country=choice).update(address_country=None, address_city=None)
            elif choice_type == 'city':
                LegalEntity.objects.filter(business=business, address_city=choice).update(address_city=None)
                    
            choice.delete()
            return {
                "success": True,
                "action": "deleted",
                "entity_name": entity_name,
                "purged_counts": purged_counts,
                "message": f"Choice '{entity_name}' permanently deleted."
            }
        else:
            raise ValueError(f"Unknown entity type: {entity_type}")
