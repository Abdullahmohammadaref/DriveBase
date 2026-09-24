"""
Unit tests for the core Django models.

Tests:
- Vehicle model: auto-ID generation, computed properties (net prices, active_for)
- Transaction model: auto-status computation, financial summary class methods
- LegalEntity model: auto-ID generation
- PDF helper functions
"""

from django.test import TestCase
from decimal import Decimal
from datetime import date, timedelta
from django.utils import timezone

from manager.models import (
    Vehicle, Transaction, LegalEntity, Business, Branch,
    Make, VehicleModel, VehicleType, BodyType, Color,
    FuelType, DamageType, DoorsChoice, PaymentMethod,
    TaxPercentage, Category, Subcategory,
)
from manager.pdf_helpers import safe_display, get_vehicle_display_name, patch_vehicle_for_pdf
from .test_setup import BaseTestCase


# =============================================================================
# Vehicle Model Tests
# =============================================================================

class VehicleAutoIdTests(BaseTestCase):
    """Test that Vehicle.save() auto-generates sequential internal_id per business."""

    def test_first_vehicle_gets_id_1(self):
        """The first vehicle in the fixture should have internal_id=1."""
        self.assertEqual(self.vehicle_a.internal_id, 1)

    def test_second_vehicle_gets_next_id(self):
        """A new vehicle gets max(internal_id)+1 for that business."""
        v2 = Vehicle.objects.create(
            business=self.business_a,
            branch=self.branch_a,
            status="purchased",
            make=self.make_a,
            power_kw=100,
        )
        self.assertEqual(v2.internal_id, 2)

    def test_ids_are_independent_per_business(self):
        """Business B's first vehicle should also get internal_id=1."""
        self.assertEqual(self.vehicle_b.internal_id, 1)

    def test_invoice_number_auto_generated(self):
        """Saving a vehicle twice should generate an invoice number."""
        self.vehicle_a.save()
        self.vehicle_a.refresh_from_db()
        self.assertIsNotNone(self.vehicle_a.sale_invoice_number)
        self.assertTrue(self.vehicle_a.sale_invoice_number.startswith("Rng-"))


class VehicleComputedPropertyTests(BaseTestCase):
    """Test Vehicle computed properties: net prices, active_for, etc."""

    def test_buy_price_net_with_19_percent_tax(self):
        """buy_price_net should = buy_price / 1.19 when 19% tax is applied."""
        expected_net = (Decimal("25000.00") / Decimal("1.19")).quantize(Decimal("0.01"))
        self.assertEqual(self.vehicle_a.buy_price_net, expected_net)

    def test_buy_price_net_with_no_tax(self):
        """buy_price_net should = buy_price when tax is 'No Tax'."""
        self.vehicle_a.buy_tax = self.tax_no_tax_a
        self.vehicle_a.save()
        self.vehicle_a.refresh_from_db()
        self.assertEqual(
            self.vehicle_a.buy_price_net,
            Decimal("25000.00").quantize(Decimal("0.01")),
        )

    def test_buy_price_net_with_no_tax_object(self):
        """buy_price_net should = buy_price when buy_tax is None."""
        self.vehicle_a.buy_tax = None
        self.vehicle_a.save()
        self.vehicle_a.refresh_from_db()
        self.assertEqual(
            self.vehicle_a.buy_price_net,
            Decimal("25000.00").quantize(Decimal("0.01")),
        )

    def test_sale_price_net_with_tax(self):
        """sale_price_net should compute correctly."""
        self.vehicle_a.sale_price = Decimal("30000.00")
        self.vehicle_a.sale_tax = self.tax_19_a
        self.vehicle_a.save()
        self.vehicle_a.refresh_from_db()
        expected_net = (Decimal("30000.00") / Decimal("1.19")).quantize(Decimal("0.01"))
        self.assertEqual(self.vehicle_a.sale_price_net, expected_net)

    def test_sale_price_net_returns_none_when_no_sale_price(self):
        """sale_price_net should be None when sale_price is not set."""
        self.assertIsNone(self.vehicle_a.sale_price_net)

    def test_active_for_days_since_purchase(self):
        """active_for should count days from buy_date to today (not sold)."""
        expected_days = (timezone.now().date() - date(2024, 1, 15)).days
        self.assertEqual(self.vehicle_a.active_for, expected_days)

    def test_active_for_stops_at_sale_date(self):
        """active_for should stop at sale_date when vehicle is sold."""
        self.vehicle_a.sale_date = date(2024, 6, 15)
        self.vehicle_a.save()
        expected_days = (date(2024, 6, 15) - date(2024, 1, 15)).days
        self.assertEqual(self.vehicle_a.active_for, expected_days)

    def test_active_for_returns_0_when_no_buy_date(self):
        """active_for should return 0 when buy_date is not set."""
        self.vehicle_a.buy_date = None
        self.vehicle_a.save()
        self.assertEqual(self.vehicle_a.active_for, 0)

    def test_buy_price_after_tax(self):
        """buy_price_after_tax should include tax."""
        expected = Decimal("25000.00") * (1 + Decimal("19.00") / 100)
        self.assertEqual(self.vehicle_a.buy_price_after_tax, expected)

    def test_buy_price_after_tax_returns_buy_price_when_no_tax(self):
        """buy_price_after_tax should return buy_price when no tax obj."""
        self.vehicle_a.buy_tax = None
        self.vehicle_a.save()
        self.vehicle_a.refresh_from_db()
        self.assertEqual(self.vehicle_a.buy_price_after_tax, Decimal("25000.00"))

    def test_str_representation(self):
        """Vehicle __str__ should show 'Make Model BodyType'."""
        result = str(self.vehicle_a)
        self.assertIn("BMW", result)
        self.assertIn("X5", result)
        self.assertIn("SUV", result)


# =============================================================================
# Transaction Model Tests
# =============================================================================

class TransactionAutoIdTests(BaseTestCase):
    """Test that Transaction.save() auto-generates sequential internal_id."""

    def test_first_transaction_gets_id_1(self):
        """The fixture transaction should have internal_id=1."""
        self.assertEqual(self.transaction_a.internal_id, 1)

    def test_second_transaction_increments(self):
        """New transaction gets max(internal_id)+1."""
        t2 = Transaction.objects.create(
            business=self.business_a,
            amount=Decimal("500.00"),
            date=date(2024, 2, 1),
        )
        self.assertEqual(t2.internal_id, 2)


class TransactionAutoStatusTests(BaseTestCase):
    """Test the auto-status computation in Transaction.save()."""

    def test_confirmed_when_all_fields_set(self):
        """Status should be 'confirmed' when category, subcategory, and tax are set."""
        self.assertEqual(self.transaction_a.status, "confirmed")

    def test_review_required_when_missing_category(self):
        """Status should be 'review_required' when category is missing."""
        t = Transaction.objects.create(
            business=self.business_a,
            amount=Decimal("100.00"),
            date=date(2024, 1, 1),
            subcategory="test",
            tax=Decimal("19.00"),
            # category is missing
        )
        self.assertEqual(t.status, "review_required")

    def test_review_required_when_missing_tax(self):
        """Status should be 'review_required' when tax is missing."""
        t = Transaction.objects.create(
            business=self.business_a,
            amount=Decimal("100.00"),
            date=date(2024, 1, 1),
            category="car_purchase",
            subcategory="test",
            # tax is missing
        )
        self.assertEqual(t.status, "review_required")

    def test_inactive_status_never_overridden(self):
        """Inactive status should NOT be changed to confirmed or review_required."""
        self.transaction_a.status = "inactive"
        self.transaction_a.save()
        self.transaction_a.refresh_from_db()
        self.assertEqual(self.transaction_a.status, "inactive")


class TransactionFinancialSummaryTests(BaseTestCase):
    """Test the Transaction financial summary class methods."""

    def test_gross_total_revenue_positive_amounts(self):
        """Gross total revenue counts only positive amounts."""
        qs = Transaction.objects.filter(business=self.business_a)
        result = Transaction.get_gross_total_revenue_from_queryset(qs)
        self.assertEqual(result, Decimal("25000.00"))

    def test_gross_total_expenses_negative_amounts(self):
        """Gross total expenses counts only negative amounts (as positive)."""
        Transaction.objects.create(
            business=self.business_a,
            amount=Decimal("-5000.00"),
            date=date(2024, 2, 1),
            category="office",
            subcategory="supplies",
            tax=Decimal("19.00"),
        )
        qs = Transaction.objects.filter(business=self.business_a)
        result = Transaction.get_gross_total_expenses_from_queryset(qs)
        self.assertEqual(result, Decimal("5000.00"))

    def test_net_total_revenue_deducts_tax(self):
        """Net revenue should divide by (1 + tax/100) to remove tax."""
        qs = Transaction.objects.filter(business=self.business_a)
        result = Transaction.get_net_total_revenue_from_queryset(qs)
        expected = (Decimal("25000.00") / Decimal("1.19")).quantize(Decimal("0.01"))
        self.assertEqual(result, expected)

    def test_summary_excludes_inactive(self):
        """Gross summary methods should exclude inactive transactions."""
        self.transaction_a.status = "inactive"
        self.transaction_a.save()
        qs = Transaction.objects.filter(business=self.business_a)
        result = Transaction.get_gross_total_revenue_from_queryset(qs)
        self.assertEqual(result, 0)


# =============================================================================
# LegalEntity Model Tests
# =============================================================================

class LegalEntityAutoIdTests(BaseTestCase):
    """Test LegalEntity auto-ID generation."""

    def test_first_entity_gets_id_1(self):
        self.assertEqual(self.legal_entity_a.internal_id, 1)

    def test_second_entity_increments(self):
        e2 = LegalEntity.objects.create(
            business=self.business_a,
            name="Second Entity",
            address_street="Test St",
            address_street_number=1,
            address_postal_code="10000",
            address_city=self.city_berlin,
            address_country=self.country_de_a,
        )
        self.assertEqual(e2.internal_id, 2)

    def test_ids_are_per_business(self):
        self.assertEqual(self.legal_entity_b.internal_id, 1)


# =============================================================================
# PDF Helper Tests
# =============================================================================

class PdfHelperTests(BaseTestCase):
    """Test PDF helper functions."""

    def test_safe_display_returns_name(self):
        self.assertEqual(safe_display(self.make_a), "BMW")

    def test_safe_display_returns_fallback_for_none(self):
        self.assertEqual(safe_display(None), "")
        self.assertEqual(safe_display(None, "N/A"), "N/A")

    def test_get_vehicle_display_name(self):
        display = get_vehicle_display_name(self.vehicle_a)
        self.assertIn("BMW", display)
        self.assertIn("X5", display)

    def test_patch_vehicle_for_pdf_adds_display_methods(self):
        v = patch_vehicle_for_pdf(self.vehicle_a)
        self.assertEqual(v.get_manufacturer_display(), "BMW")
        self.assertEqual(v.get_vehicle_type_display(), "PKW")
        self.assertEqual(v.get_body_type_display(), "SUV")
        self.assertEqual(v.get_color_display(), "Black")
        self.assertEqual(v.get_fuel_type_display(), "Diesel")

    def test_patch_vehicle_computes_buy_price_taxes(self):
        v = patch_vehicle_for_pdf(self.vehicle_a)
        expected_tax = float(Decimal("25000.00")) * float(Decimal("19.00")) / 100
        self.assertAlmostEqual(v.buy_price_taxes, expected_tax, places=2)
