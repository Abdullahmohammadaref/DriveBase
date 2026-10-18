"""
Tests for mobile.de Marketplace Integration & Auto-Listing.

Covers:
1. Settings API (GET, PUT, POST /test-connection/)
2. Vehicle Listing Endpoints (GET detail, POST publish, POST delist)
3. Universal Two-Way Sync (price and mileage persisted to Vehicle model)
4. Automatic Background Delisting on 'sold' or 'inactive' status transition
5. Gallery Image Upload & Deletion
6. Vehicles list filter by 'listed_on_mobile_de' (yes/no)
"""

import json
from decimal import Decimal
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings

from manager.models import (
    Vehicle, MobileDeSettings, VehicleListingImage,
    FuelType, BodyType, Color, DoorsChoice,
    VehicleType, Make, VehicleModel
)
from .test_setup import BaseTestCase


class MobileDeSettingsApiTests(BaseTestCase):
    """Tests for mobile.de settings & credential management."""

    def test_get_settings_unauthenticated(self):
        response = self.client.get("/api/settings/mobile-de")
        self.assertEqual(response.status_code, 401)

    def test_get_settings_default_unconfigured(self):
        self.login_manager_a()
        response = self.client.get("/api/settings/mobile-de")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertFalse(data["is_configured"])
        self.assertIsNone(data["seller_id"])

    def test_update_settings_success(self):
        self.login_manager_a()
        payload = {
            "seller_id": "12345678",
            "api_username": "seller_api_user",
            "api_password": "supersecretpassword",
        }
        response = self.client.put(
            "/api/settings/mobile-de",
            data=json.dumps(payload),
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["is_configured"])
        self.assertEqual(data["seller_id"], "12345678")
        self.assertEqual(data["api_username"], "seller_api_user")

        # Verify in DB
        settings = MobileDeSettings.objects.get(business=self.business_a)
        self.assertTrue(settings.is_configured)
        self.assertEqual(settings.seller_id, "12345678")
        self.assertTrue(settings.api_password)

    def test_test_connection_endpoint(self):
        self.login_manager_a()
        # Save credentials first
        MobileDeSettings.objects.create(
            business=self.business_a,
            seller_id="12345678",
            api_username="seller_user",
            api_password="encrypted_pw",
        )
        response = self.client.post("/api/settings/mobile-de/test-connection")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertIn("verified", data["message"].lower())


class MobileDeVehicleEndpointsTests(BaseTestCase):
    """Tests for listing, publishing, universal sync, and delisting."""

    def setUp(self):
        super().setUp()
        # Configure mobile.de for business_a
        self.mobile_settings = MobileDeSettings.objects.create(
            business=self.business_a,
            seller_id="12345678",
            api_username="seller_user",
            api_password="encrypted_pw",
        )

    def test_get_vehicle_mobile_de_details(self):
        self.login_manager_a()
        response = self.client.get(f"/api/vehicles/{self.vehicle_a.internal_id}/mobile-de")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["internal_id"], self.vehicle_a.internal_id)
        self.assertEqual(data["mobile_de_status"], "not_listed")
        self.assertEqual(data["sale_price"], float(self.vehicle_a.sale_price) if self.vehicle_a.sale_price else None)

    def test_publish_universal_sync(self):
        """
        Verify universal two-way sync:
        Editing price, mileage, and marketplace attributes in the listing form
        persists both core Vehicle columns AND marketplace attributes.
        """
        self.login_manager_a()
        # Ensure status is ready_for_sale
        self.vehicle_a.status = "ready_for_sale"
        self.vehicle_a.save()

        publish_payload = {
            "sale_price": 28500.0,
            "kilometer": 42000,
            "transmission": "AUTOMATIC_GEAR",
            "condition": "USED",
            "hu_date": "11/2027",
            "features": ["NAVIGATION_SYSTEM", "LED_HEADLIGHTS", "BLUETOOTH"],
            "emission_class": "EURO6",
            "emission_badge": "GREEN",
            "fuel_consumption_combined": 5.4,
            "co2_emission_combined": 128.0,
            "efficiency_class": "A",
            "mobile_de_description": "Top maintained executive vehicle in pristine condition."
        }

        response = self.client.post(
            f"/api/vehicles/{self.vehicle_a.internal_id}/mobile-de/publish",
            data=json.dumps(publish_payload),
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["status"], "active")
        self.assertIsNotNone(data["ad_id"])

        # Reload vehicle from database and verify universal sync
        self.vehicle_a.refresh_from_db()
        self.assertEqual(self.vehicle_a.sale_price, Decimal("28500.0"))
        self.assertEqual(self.vehicle_a.kilometer, 42000)
        self.assertEqual(self.vehicle_a.transmission, "AUTOMATIC_GEAR")
        self.assertEqual(self.vehicle_a.condition, "USED")
        self.assertEqual(self.vehicle_a.hu_date, "11/2027")
        self.assertEqual(self.vehicle_a.features, ["NAVIGATION_SYSTEM", "LED_HEADLIGHTS", "BLUETOOTH"])
        self.assertEqual(self.vehicle_a.mobile_de_status, "active")
        self.assertEqual(self.vehicle_a.mobile_de_description, "Top maintained executive vehicle in pristine condition.")

    def test_publish_preserves_master_specs_when_omitted(self):
        """
        Verify that publishing without sale_price or kilometer keeps the vehicle's
        existing master data intact and publishes successfully.
        """
        self.login_manager_a()
        self.vehicle_a.status = "ready_for_sale"
        self.vehicle_a.sale_price = Decimal("32000.00")
        self.vehicle_a.kilometer = 55000
        self.vehicle_a.save()

        publish_payload = {
            "transmission": "AUTOMATIC_GEAR",
            "condition": "USED",
            "hu_date": "06/2026",
            "features": ["NAVIGATION_SYSTEM"],
            "emission_class": "EURO6",
            "emission_badge": "GREEN",
        }

        response = self.client.post(
            f"/api/vehicles/{self.vehicle_a.internal_id}/mobile-de/publish",
            data=json.dumps(publish_payload),
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])

        self.vehicle_a.refresh_from_db()
        self.assertEqual(self.vehicle_a.sale_price, Decimal("32000.00"))
        self.assertEqual(self.vehicle_a.kilometer, 55000)
        self.assertEqual(self.vehicle_a.mobile_de_status, "active")

    def test_delist_vehicle(self):
        self.login_manager_a()
        # Set vehicle as active on mobile.de first
        self.vehicle_a.mobile_de_status = "active"
        self.vehicle_a.mobile_de_ad_id = "ad_12345"
        self.vehicle_a.mobile_de_url = "https://suchen.mobile.de/fahrzeuge/details.html?id=ad_12345"
        self.vehicle_a.save()

        response = self.client.post(f"/api/vehicles/{self.vehicle_a.internal_id}/mobile-de/delist")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])

        self.vehicle_a.refresh_from_db()
        self.assertEqual(self.vehicle_a.mobile_de_status, "not_listed")
        self.assertIsNone(self.vehicle_a.mobile_de_ad_id)

    def test_automatic_delist_on_sold_status(self):
        """
        When a vehicle is marked sold in ACAR, it must automatically
        delist from mobile.de via model save hook.
        """
        self.vehicle_a.status = "ready_for_sale"
        self.vehicle_a.mobile_de_status = "active"
        self.vehicle_a.mobile_de_ad_id = "ad_99999"
        self.vehicle_a.save()

        # Mark vehicle sold
        self.vehicle_a.status = "sold"
        self.vehicle_a.save()

        self.vehicle_a.refresh_from_db()
        self.assertEqual(self.vehicle_a.mobile_de_status, "not_listed")
        self.assertIsNone(self.vehicle_a.mobile_de_ad_id)

    def test_gallery_image_upload_and_delete(self):
        self.login_manager_a()
        dummy_file = SimpleUploadedFile("test_photo.jpg", b"dummy image data", content_type="image/jpeg")

        # Upload gallery image (param name is 'image')
        response = self.client.post(
            f"/api/vehicles/{self.vehicle_a.internal_id}/mobile-de/gallery-images",
            {"image": dummy_file},
            format="multipart"
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        image_id = data["id"]

        # Verify DB record exists
        self.assertTrue(VehicleListingImage.objects.filter(id=image_id, vehicle=self.vehicle_a).exists())

        # Delete image
        del_response = self.client.delete(f"/api/vehicles/{self.vehicle_a.internal_id}/mobile-de/gallery-images/{image_id}")
        self.assertEqual(del_response.status_code, 200)
        del_data = del_response.json()
        self.assertTrue(del_data["success"])
        self.assertFalse(VehicleListingImage.objects.filter(id=image_id).exists())


class MobileDeVehiclesFilterTests(BaseTestCase):
    """Tests for the 'listed_on_mobile_de' query filter (yes/no)."""

    def setUp(self):
        super().setUp()
        self.vehicle_a.mobile_de_status = "active"
        self.vehicle_a.save()

    def test_filter_listed_on_mobile_de_yes(self):
        self.login_manager_a()
        response = self.client.get("/api/vehicles?listed_on_mobile_de=yes")
        self.assertEqual(response.status_code, 200)
        items = response.json()["vehicles"]["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["internal_id"], self.vehicle_a.internal_id)

    def test_filter_listed_on_mobile_de_no(self):
        self.login_manager_a()
        response = self.client.get("/api/vehicles?listed_on_mobile_de=no")
        self.assertEqual(response.status_code, 200)
        items = response.json()["vehicles"]["items"]
        self.assertEqual(len(items), 0)


class MobileDeChoicesMappingAndProtectionTests(BaseTestCase):
    """Tests for protected marketplace choices, explicit mappings, and zero silent defaults."""

    def setUp(self):
        super().setUp()
        self.mobile_settings = MobileDeSettings.objects.create(
            business=self.business_a,
            seller_id="12345678",
            api_username="seller_user",
            api_password="encrypted_pw",
        )
        self.vehicle_a.status = "ready_for_sale"
        self.vehicle_a.sale_price = Decimal("25000.00")
        self.vehicle_a.kilometer = 45000
        self.vehicle_a.transmission = "AUTOMATIC_GEAR"
        self.vehicle_a.save()

    def test_unmapped_fuel_type_fails_publishing_with_descriptive_error(self):
        """Zero silent fallback: an unmapped choice like 'haha' must fail with a clear 400 error."""
        self.login_manager_a()
        unmapped_fuel = FuelType.objects.create(
            business=self.business_a,
            name="haha",
            mobile_de_mapping=None,
            is_protected=False
        )
        self.vehicle_a.fuel_type = unmapped_fuel
        self.vehicle_a.save()

        publish_payload = {
            "transmission": "AUTOMATIC_GEAR",
            "condition": "USED",
            "features": ["NAVIGATION_SYSTEM"],
        }
        response = self.client.post(
            f"/api/vehicles/{self.vehicle_a.internal_id}/mobile-de/publish",
            data=json.dumps(publish_payload),
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 400)
        detail = response.json()["detail"]
        self.assertIn("haha", detail)
        self.assertIn("not recognized or mapped", detail)

    def test_custom_choice_with_explicit_mapping_publishes_successfully(self):
        """A custom internal name with explicit mobile_de_mapping publishes without errors."""
        self.login_manager_a()
        custom_fuel = FuelType.objects.create(
            business=self.business_a,
            name="HVO100 Synthetic Fuel",
            mobile_de_mapping="DIESEL",
            is_protected=False
        )
        self.vehicle_a.fuel_type = custom_fuel
        self.vehicle_a.save()

        publish_payload = {
            "transmission": "AUTOMATIC_GEAR",
            "condition": "USED",
            "features": ["NAVIGATION_SYSTEM"],
        }
        response = self.client.post(
            f"/api/vehicles/{self.vehicle_a.internal_id}/mobile-de/publish",
            data=json.dumps(publish_payload),
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])

    def test_protected_choice_cannot_be_deleted(self):
        """Protected choices cannot be deleted or cascade purged."""
        self.login_manager_a()
        self.fuel_type_a.is_protected = True
        self.fuel_type_a.save()

        response = self.client.delete(f"/api/choices/fuel_type/{self.fuel_type_a.id}")
        self.assertEqual(response.status_code, 400)
        self.assertIn("protected", response.json()["detail"].lower())

    def test_protected_choice_cannot_be_renamed(self):
        """Protected choices cannot be renamed."""
        self.login_manager_a()
        self.fuel_type_a.is_protected = True
        self.fuel_type_a.save()

        response = self.client.patch(
            f"/api/choices/fuel_type/{self.fuel_type_a.id}",
            data=json.dumps({"name": "Corrupted Fuel Name"}),
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("protected", response.json()["detail"].lower())

    def test_protected_choice_cannot_be_remapped(self):
        """Protected choices cannot have their mobile_de_mapping altered."""
        self.login_manager_a()
        self.fuel_type_a.is_protected = True
        self.fuel_type_a.mobile_de_mapping = "PETROL"
        self.fuel_type_a.save()

        response = self.client.patch(
            f"/api/choices/fuel_type/{self.fuel_type_a.id}",
            data=json.dumps({"name": self.fuel_type_a.name, "mobile_de_mapping": "DIESEL"}),
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("protected", response.json()["detail"].lower())

    def test_seed_official_mobile_de_choices(self):
        """seed_official_mobile_de_choices seeds all 10 fuels, 9 bodies, 14 colors, 3 doors as protected."""
        from manager.services.mobile_de_service import (
            seed_official_mobile_de_choices,
            OFFICIAL_MOBILE_DE_FUELS,
            OFFICIAL_MOBILE_DE_BODIES,
            OFFICIAL_MOBILE_DE_COLORS,
            OFFICIAL_MOBILE_DE_DOORS,
        )
        seed_official_mobile_de_choices(self.business_a)

        self.assertEqual(
            FuelType.objects.filter(business=self.business_a, is_protected=True).count(),
            len(OFFICIAL_MOBILE_DE_FUELS)
        )
        self.assertEqual(
            BodyType.objects.filter(business=self.business_a, is_protected=True).count(),
            len(OFFICIAL_MOBILE_DE_BODIES) + 1  # 47 official categories + 1 universal fallback ('Sonstige / Andere')
        )
        self.assertEqual(
            Color.objects.filter(business=self.business_a, is_protected=True).count(),
            len(OFFICIAL_MOBILE_DE_COLORS)
        )
        self.assertEqual(
            DoorsChoice.objects.filter(business=self.business_a, is_protected=True).count(),
            len(OFFICIAL_MOBILE_DE_DOORS)
        )

    def test_marketplace_options_exact_clean_names(self):
        """marketplace-options uses exact clean official German labels matching Accept-Language: de."""
        self.login_manager_a()
        response = self.client.get("/api/choices/marketplace-options")
        self.assertEqual(response.status_code, 200)
        fuels = response.json()["fuel_type"]
        fuel_codes = {f["code"]: f["label"] for f in fuels}
        self.assertEqual(fuel_codes["DIESEL"], "Diesel")
        self.assertEqual(fuel_codes["PETROL"], "Benzin")
        self.assertEqual(fuel_codes["HYBRID_PLUGIN"], "Plug-in-Hybrid")
        self.assertEqual(fuel_codes["LPG"], "Autogas (LPG)")
        self.assertEqual(fuel_codes["CNG"], "Erdgas (CNG)")

        bodies = response.json()["body_type"]
        body_codes = {b["code"]: b["label"] for b in bodies}
        self.assertEqual(body_codes["EstateCar"], "Kombi")
        self.assertEqual(body_codes["OffRoad"], "Geländewagen")
        self.assertEqual(body_codes["SportsCar"], "Sportwagen")

        colors = response.json()["color"]
        color_codes = {c["code"]: c["label"] for c in colors}
        self.assertEqual(color_codes["BLACK"], "Schwarz")
        self.assertEqual(color_codes["WHITE"], "Weiß")
        self.assertEqual(color_codes["GREY"], "Grau")


class MultiClassMarketplaceAndValidationTests(BaseTestCase):
    """Tests for multi-class mobile.de publishing, payload generation, and conditional doors validation."""

    def setUp(self):
        super().setUp()
        self.mobile_settings = MobileDeSettings.objects.create(
            business=self.business_a,
            seller_id="12345678",
            api_username="seller_user",
            api_password="encrypted_pw",
        )
        self.motorrad_type = VehicleType.objects.create(
            business=self.business_a,
            name="Motorrad",
            mobile_de_mapping="Motorbike",
            is_active=True,
        )
        self.bike_body = BodyType.objects.create(
            business=self.business_a,
            name="Naked Bike",
            mobile_de_mapping="NakedBike",
            vehicle_classes=["Motorbike"],
            is_active=True,
        )
        self.bike_make = Make.objects.create(
            business=self.business_a,
            name="Ducati",
            mobile_de_mapping="Ducati",
            vehicle_classes=["Motorbike"],
            is_active=True,
        )
        self.bike_model = VehicleModel.objects.create(
            business=self.business_a,
            make=self.bike_make,
            name="Monster",
            vehicle_classes=["Motorbike"],
            is_active=True,
        )

    def test_publish_motorcycle_without_doors(self):
        """Motorcycle can be published without doors; doors is not in mapping issues or specifics."""
        from manager.services.mobile_de_service import get_mobile_de_service

        self.login_manager_a()
        bike = Vehicle.objects.create(
            business=self.business_a,
            vehicle_type=self.motorrad_type,
            make=self.bike_make,
            model=self.bike_model,
            body_type=self.bike_body,
            doors=None,  # Crucial: motorcycle has no doors
            fuel_type=self.fuel_type_a,
            color=self.color_a,
            damage_type=self.damage_type_a,
            branch=self.branch_a,
            status="ready_for_sale",
            sale_price=Decimal("11500.00"),
            kilometer=8000,
            transmission="MANUAL_GEAR",
        )

        # 1. GET mobile-de details: doors should NOT be reported in mapping issues
        res = self.client.get(f"/api/vehicles/{bike.internal_id}/mobile-de")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["vehicle_class"], "Motorbike")
        issue_fields = [i["field"] for i in data.get("mapping_issues", [])]
        self.assertNotIn("doors", issue_fields)

        # 2. build_ad_payload: verify category, class, and absence of doorCount
        service = get_mobile_de_service(self.business_a)
        payload = service.build_ad_payload(bike)
        vehicle_payload = payload.get("ad", {}).get("vehicle", {})
        self.assertEqual(vehicle_payload.get("class"), "Motorbike")
        self.assertEqual(vehicle_payload.get("category"), "NakedBike")
        self.assertNotIn("doorCount", vehicle_payload.get("specifics", {}))

        # 3. Publish endpoint success
        pub_res = self.client.post(
            f"/api/vehicles/{bike.internal_id}/mobile-de/publish",
            data=json.dumps({"transmission": "MANUAL_GEAR", "condition": "USED"}),
            content_type="application/json"
        )
        self.assertEqual(pub_res.status_code, 200)
        self.assertTrue(pub_res.json()["success"])

    def test_vehicle_doors_validation_conditional_by_class(self):
        """Doors is mandatory for Cars (PKW) but optional/omitted for Motorcycles (Motorrad)."""
        from manager.models import KeyNumber
        self.login_manager_a()

        key1 = KeyNumber.objects.create(business=self.business_a, number=881)
        key2 = KeyNumber.objects.create(business=self.business_a, number=882)

        base_payload = {
            "branch_id": self.branch_a.id,
            "make_id": self.make_a.id,
            "model_id": self.model_a.id,
            "body_type_id": self.body_type_a.id,
            "fuel_type_id": self.fuel_type_a.id,
            "color_id": self.color_a.id,
            "damage_type_id": self.damage_type_a.id,
            "power_kw": 150,
            "year_of_construction": 2022,
            "kilometer": 20000,
            "chassis_number": "WBA12345678901234",
            "buy_price": "10000.00",
            "buy_date": "2024-01-15",
            "buy_payment_method_id": self.payment_method_a.id,
            "seller_id": self.legal_entity_a.id,
            "key_number_id": key1.id,
        }

        # 1. POST /api/vehicles with PKW (Car) and doors_id=None -> 400
        car_payload = {
            **base_payload,
            "vehicle_type_id": self.vehicle_type_a.id,  # PKW
            "doors_id": None,  # Missing doors for car
        }
        res_car = self.client.post(
            "/api/vehicles",
            data=json.dumps(car_payload),
            content_type="application/json"
        )
        self.assertEqual(res_car.status_code, 400)
        self.assertIn("Doors selection is required", res_car.json().get("detail", ""))

        # 2. POST /api/vehicles with Motorrad and doors_id=None -> 201 Created
        bike_payload = {
            **base_payload,
            "vehicle_type_id": self.motorrad_type.id,  # Motorrad
            "make_id": self.bike_make.id,
            "model_id": self.bike_model.id,
            "body_type_id": self.bike_body.id,
            "doors_id": None,  # No doors for bike
            "chassis_number": "WBABK123456789012",
            "key_number_id": key2.id,
        }
        res_bike = self.client.post(
            "/api/vehicles",
            data=json.dumps(bike_payload),
            content_type="application/json"
        )
        self.assertEqual(res_bike.status_code, 201)
        created_id = res_bike.json()["internal_id"]
        v = Vehicle.objects.get(internal_id=created_id, business=self.business_a)
        self.assertTrue(v.doors is None or v.doors.name == "Keine")
        self.assertEqual(v.vehicle_type, self.motorrad_type)


