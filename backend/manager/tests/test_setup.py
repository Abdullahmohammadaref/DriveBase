"""
Shared test fixtures and base classes for the manager app test suite.

Provides a BaseTestCase with pre-built test data:
- 2 businesses (for cross-tenant isolation testing)
- Manager + Employee users per business
- Full set of dynamic choices (Make, Color, FuelType, etc.)
- Sample vehicles and transactions
"""

from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from decimal import Decimal
from datetime import date

from manager.models import (
    Business, Branch, Vehicle, Transaction, LegalEntity, Country, City,
    Make, VehicleModel, VehicleType, BodyType, Color,
    FuelType, DamageType, DoorsChoice, PaymentMethod,
    TaxPercentage, Currency, Category, Subcategory,
    ActivityLog,
)

User = get_user_model()


class BaseTestCase(TestCase):
    """
    Base test case with full test data for two isolated businesses.
    
    Sets up:
    - Business A & Business B
    - Users for each business
    - All dynamic choices
    - 1 vehicle, 1 transaction, 1 legal entity per business
    """

    @classmethod
    def setUpTestData(cls):
        # =====================================================================
        # Business A — primary test business
        # =====================================================================
        cls.business_a = Business.objects.create(
            name="Test Business A",
            address_city="Berlin",
        )
        cls.country_de_a = Country.objects.create(business=cls.business_a, name="Germany", is_active=True)
        cls.city_berlin = City.objects.create(business=cls.business_a, name="Berlin", country=cls.country_de_a, is_active=True)
        cls.city_munich = City.objects.create(business=cls.business_a, name="Munich", country=cls.country_de_a, is_active=True)

        cls.branch_a = Branch.objects.create(
            business=cls.business_a,
            name="Main Branch A",
            address="123 Test St, Berlin",
            is_active=True,
        )
        cls.manager_a = User.objects.create_user(
            username="manager_a",
            password="testpass123",
            email="manager_a@test.com",
            business=cls.business_a,
            is_manager=True,
        )
        cls.employee_a = User.objects.create_user(
            username="employee_a",
            password="testpass123",
            email="employee_a@test.com",
            business=cls.business_a,
            is_manager=False,
            transactions_access=True,
            legal_entities_access=True,
        )

        # Dynamic choices for Business A
        cls.make_a = Make.objects.create(business=cls.business_a, name="BMW", is_active=True)
        cls.model_a = VehicleModel.objects.create(
            business=cls.business_a, make=cls.make_a, name="X5", is_active=True
        )
        cls.vehicle_type_a = VehicleType.objects.create(
            business=cls.business_a, name="PKW", is_active=True
        )
        cls.body_type_a = BodyType.objects.create(
            business=cls.business_a, name="SUV", is_active=True
        )
        cls.color_a = Color.objects.create(
            business=cls.business_a, name="Black", is_active=True
        )
        cls.fuel_type_a = FuelType.objects.create(
            business=cls.business_a, name="Diesel", is_active=True
        )
        cls.damage_type_a = DamageType.objects.create(
            business=cls.business_a, name="Undamaged", is_active=True
        )
        cls.doors_a = DoorsChoice.objects.create(
            business=cls.business_a, name="4/5", is_active=True
        )
        cls.payment_method_a = PaymentMethod.objects.create(
            business=cls.business_a, name="Cash", is_active=True
        )
        cls.tax_no_tax_a = TaxPercentage.objects.create(
            business=cls.business_a, name="No Tax", percentage=Decimal("0"),
            is_active=True, is_no_tax=True,
        )
        cls.tax_19_a = TaxPercentage.objects.create(
            business=cls.business_a, name="19% VAT", percentage=Decimal("19.00"),
            is_active=True, is_no_tax=False,
        )
        cls.currency_a = Currency.objects.create(
            business=cls.business_a, name="Euro", code="EUR", is_active=True
        )
        cls.category_a = Category.objects.create(
            business=cls.business_a, name="Car Purchase", is_active=True
        )
        cls.subcategory_a = Subcategory.objects.create(
            business=cls.business_a, category=cls.category_a,
            name="New Car", is_active=True,
        )

        # Legal entity for Business A
        cls.legal_entity_a = LegalEntity.objects.create(
            business=cls.business_a,
            name="AutoHaus Berlin",
            type="company",
            address_street="Berliner Str",
            address_street_number=42,
            address_postal_code="10115",
            address_city=cls.city_berlin,
            address_country=cls.country_de_a,
            tax_identification_number="DE123456789",
        )

        # Vehicle for Business A
        cls.vehicle_a = Vehicle.objects.create(
            business=cls.business_a,
            branch=cls.branch_a,
            status="purchased",
            make=cls.make_a,
            model=cls.model_a,
            vehicle_type=cls.vehicle_type_a,
            body_type=cls.body_type_a,
            color=cls.color_a,
            fuel_type=cls.fuel_type_a,
            damage_type=cls.damage_type_a,
            doors=cls.doors_a,
            power_kw=200,
            year_of_construction=2023,
            kilometer=15000,
            chassis_number="WBAPH5C55BA123456",
            buy_price=Decimal("25000.00"),
            buy_tax=cls.tax_19_a,
            buy_date=date(2024, 1, 15),
            buy_payment_method=cls.payment_method_a,
            seller=cls.legal_entity_a,
        )

        # Transaction for Business A
        cls.transaction_a = Transaction.objects.create(
            business=cls.business_a,
            vehicle=cls.vehicle_a,
            amount=Decimal("25000.00"),
            date=date(2024, 1, 15),
            category="car_purchase",
            subcategory="new_car",
            tax=Decimal("19.00"),
            method="cash",
            from_or_to="AutoHaus Berlin",
            description="Vehicle purchase",
            currency="Euro (EUR)",
        )

        # =====================================================================
        # Business B — for cross-tenant isolation tests
        # =====================================================================
        cls.business_b = Business.objects.create(
            name="Test Business B",
            address_city="Munich",
        )
        cls.branch_b = Branch.objects.create(
            business=cls.business_b,
            name="Main Branch B",
            address="456 Other St, Munich",
            is_active=True,
        )
        cls.manager_b = User.objects.create_user(
            username="manager_b",
            password="testpass123",
            email="manager_b@test.com",
            business=cls.business_b,
            is_manager=True,
        )
        cls.make_b = Make.objects.create(
            business=cls.business_b, name="Mercedes", is_active=True
        )
        cls.model_b = VehicleModel.objects.create(
            business=cls.business_b, make=cls.make_b, name="C-Class", is_active=True
        )
        cls.vehicle_type_b = VehicleType.objects.create(
            business=cls.business_b, name="PKW", is_active=True
        )
        cls.body_type_b = BodyType.objects.create(
            business=cls.business_b, name="Sedan", is_active=True
        )
        cls.color_b = Color.objects.create(
            business=cls.business_b, name="Silver", is_active=True
        )
        cls.fuel_type_b = FuelType.objects.create(
            business=cls.business_b, name="Gasoline", is_active=True
        )
        cls.damage_type_b = DamageType.objects.create(
            business=cls.business_b, name="Minor", is_active=True
        )
        cls.doors_b = DoorsChoice.objects.create(
            business=cls.business_b, name="2/3", is_active=True
        )
        cls.payment_method_b = PaymentMethod.objects.create(
            business=cls.business_b, name="Transfer", is_active=True
        )
        cls.tax_19_b = TaxPercentage.objects.create(
            business=cls.business_b, name="19% VAT", percentage=Decimal("19.00"),
            is_active=True, is_no_tax=False,
        )
        cls.country_de_b = Country.objects.create(business=cls.business_b, name="Germany", is_active=True)
        cls.city_munich_b = City.objects.create(business=cls.business_b, name="Munich", country=cls.country_de_b, is_active=True)
        cls.legal_entity_b = LegalEntity.objects.create(
            business=cls.business_b,
            name="Munich Motors",
            type="company",
            address_street="Münchner Str",
            address_street_number=10,
            address_postal_code="80331",
            address_city=cls.city_munich_b,
            address_country=cls.country_de_b,
            tax_identification_number="DE987654321",
        )

        cls.vehicle_b = Vehicle.objects.create(
            business=cls.business_b,
            branch=cls.branch_b,
            status="purchased",
            make=cls.make_b,
            model=cls.model_b,
            vehicle_type=cls.vehicle_type_b,
            body_type=cls.body_type_b,
            color=cls.color_b,
            fuel_type=cls.fuel_type_b,
            damage_type=cls.damage_type_b,
            doors=cls.doors_b,
            power_kw=150,
            year_of_construction=2022,
            kilometer=30000,
            chassis_number="WDB2030461A123789",
            buy_price=Decimal("18000.00"),
            buy_tax=cls.tax_19_b,
            buy_date=date(2024, 3, 1),
            buy_payment_method=cls.payment_method_b,
            seller=cls.legal_entity_b,
        )

    def login_manager_a(self):
        """Log in as manager of Business A"""
        self.client.login(username="manager_a", password="testpass123")

    def login_employee_a(self):
        """Log in as employee of Business A"""
        self.client.login(username="employee_a", password="testpass123")

    def login_manager_b(self):
        """Log in as manager of Business B"""
        self.client.login(username="manager_b", password="testpass123")
