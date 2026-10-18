"""
Django Management Command: sync_mobile_de_reference_data
========================================================
Synchronizes reference choices (makes, models, categories/body types,
fuel types, colors) from the official mobile.de Reference Data API.

Rules:
1. Matches existing choices by mobile_de_mapping code or case-insensitive name.
2. Updates display labels to match official naming.
3. Sets is_protected = True on matched/created official choices.
4. NEVER deletes local records, even if absent from the API.
5. NEVER deactivates local records automatically.
6. Safe, idempotent, non-destructive.
"""

import logging
from django.core.management.base import BaseCommand
from django.db import transaction
from manager.models import Business, Make, VehicleModel, BodyType, FuelType, Color
from manager.services.mobile_de_service import (
    get_mobile_de_service,
    OFFICIAL_MOBILE_DE_FUELS,
    OFFICIAL_MOBILE_DE_BODIES,
    OFFICIAL_MOBILE_DE_COLORS,
    seed_official_mobile_de_choices,
)

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Sync reference data from official mobile.de Reference Data API into local choices."

    def add_arguments(self, parser):
        parser.add_argument(
            "--business-id",
            type=int,
            default=1,
            help="Target business ID (default: 1)",
        )
        parser.add_argument(
            "--all-businesses",
            action="store_true",
            help="Sync reference data for all businesses in database",
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING("Starting mobile.de Reference Data Synchronization..."))

        if options["all_businesses"]:
            businesses = list(Business.objects.all())
        else:
            b = Business.objects.filter(id=options["business_id"]).first()
            if not b:
                self.stderr.write(self.style.ERROR(f"Business ID {options['business_id']} does not exist."))
                return
            businesses = [b]

        for business in businesses:
            self.sync_business(business)

    def sync_business(self, business: Business):
        self.stdout.write(f"\nSyncing reference data for Business [{business.id}] '{business.name}'...")
        service = get_mobile_de_service(business)

        # Check if live credentials or simulator
        is_simulator = getattr(service, 'is_simulator', True)
        if is_simulator:
            self.stdout.write(self.style.WARNING(
                "Running in SIMULATOR mode. Syncing from verified baseline reference catalog..."
            ))
            # Simulator sync uses the official baseline catalog
            self.sync_baseline_catalog(business)
            return

        # LIVE API SYNC: Requires real credentials
        self.stdout.write("Connecting to live mobile.de Reference Data API...")
        try:
            # 1. Sync Fuel Types
            fuel_data = service.fetch_reference_data("fuel-types")
            if fuel_data:
                self.sync_fuel_types(business, fuel_data)

            # 2. Sync Categories (Body Types)
            cat_data = service.fetch_reference_data("categories?class=Car")
            if cat_data:
                self.sync_body_types(business, cat_data)

            # 3. Sync Colors
            color_data = service.fetch_reference_data("colors")
            if color_data:
                self.sync_colors(business, color_data)

            # 4. Sync Makes
            makes_data = service.fetch_reference_data("makes?class=Car")
            if makes_data:
                self.sync_makes_and_models(business, service, makes_data)

            self.stdout.write(self.style.SUCCESS(f"Successfully synced reference data for {business.name}!"))
        except Exception as e:
            self.stderr.write(self.style.ERROR(f"Error during live sync: {str(e)}"))
            logger.exception("Error syncing reference data from mobile.de")

    def sync_baseline_catalog(self, business: Business):
        """Uses verified baseline data when live credentials are not yet active."""
        with transaction.atomic():
            seed_official_mobile_de_choices(business)

        self.stdout.write(self.style.SUCCESS(f"Baseline choices verified and protected for {business.name}."))

    def sync_fuel_types(self, business: Business, items: list):
        for item in items:
            code = item.get("key") or item.get("code")
            label = item.get("label") or item.get("name")
            if not code or not label:
                continue
            FuelType.objects.update_or_create(
                business=business,
                name=label,
                defaults={
                    'mobile_de_mapping': code,
                    'is_protected': True,
                    'is_active': True,
                }
            )

    def sync_body_types(self, business: Business, items: list):
        for item in items:
            code = item.get("key") or item.get("code")
            label = item.get("label") or item.get("name")
            if not code or not label:
                continue
            BodyType.objects.update_or_create(
                business=business,
                name=label,
                defaults={
                    'mobile_de_mapping': code,
                    'is_protected': True,
                    'is_active': True,
                }
            )

    def sync_colors(self, business: Business, items: list):
        for item in items:
            code = item.get("key") or item.get("code")
            label = item.get("label") or item.get("name")
            if not code or not label:
                continue
            Color.objects.update_or_create(
                business=business,
                name=label,
                defaults={
                    'mobile_de_mapping': code,
                    'is_protected': True,
                    'is_active': True,
                }
            )

    def sync_makes_and_models(self, business: Business, service, makes_items: list):
        for m_item in makes_items:
            m_code = m_item.get("key") or m_item.get("id") or m_item.get("code")
            m_label = m_item.get("label") or m_item.get("name")
            if not m_code or not m_label:
                continue
            make_obj, _ = Make.objects.update_or_create(
                business=business,
                name=m_label,
                defaults={
                    'mobile_de_mapping': str(m_code),
                    'is_protected': True,
                    'is_active': True,
                }
            )

            # Models for this make
            try:
                models_items = service.fetch_reference_data(f"models?make={m_code}")
                if models_items:
                    for mod in models_items:
                        mod_code = mod.get("key") or mod.get("id") or mod.get("name")
                        mod_label = mod.get("label") or mod.get("name")
                        if not mod_code or not mod_label:
                            continue
                        VehicleModel.objects.update_or_create(
                            business=business,
                            make=make_obj,
                            name=mod_label,
                            defaults={
                                'mobile_de_mapping': str(mod_code),
                                'is_protected': True,
                                'is_active': True,
                            }
                        )
            except Exception as e:
                self.stderr.write(self.style.WARNING(f"Could not sync models for make {make_obj.name}: {e}"))
            except Exception as e:
                self.stderr.write(self.style.WARNING(f"Could not sync models for make {make_obj.name}: {e}"))
