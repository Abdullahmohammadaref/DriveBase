from django.contrib.auth.models import AbstractUser
from django.db import models
from django.core.validators import RegexValidator
from django.utils import timezone
from datetime import datetime
from django.db.models import Sum, Q, Case, When, FloatField, Value
from django.db.models.functions import Coalesce
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP


# from parler.models import TranslatableModel, TranslateFields   for translating fields with parler (not needed for now)
from django.utils.translation import gettext_lazy as _


# Create your models here.
class Business(models.Model):
    name = models.CharField(_('name'), max_length=100, unique=True)
    logo = models.ImageField(
        _('logo'),
        upload_to='images/businesses/',
        blank=True, null=True
    )

    # Address fields (Category 1)
    address_country = models.CharField(_('country'), max_length=100, blank=True, null=True)
    address_city = models.CharField(_('city'), max_length=100, blank=True, null=True)
    address_street = models.CharField(_('street'), max_length=200, blank=True, null=True)
    address_street_number = models.CharField(_('street number'), max_length=20, blank=True, null=True)
    address_postal_code = models.CharField(_('postal code'), max_length=20, blank=True, null=True)

    # Contact fields (Category 2)
    telephone_number = models.CharField(_('telephone number'), max_length=30, blank=True, null=True)
    fax_number = models.CharField(_('fax number'), max_length=30, blank=True, null=True)
    email = models.EmailField(_('email'), blank=True, null=True)

    # Bank fields (Category 3)
    bank_name = models.CharField(_('bank name'), max_length=100, blank=True, null=True)
    bank_bic_swift = models.CharField(_('BIC/SWIFT'), max_length=20, blank=True, null=True)
    bank_iban = models.CharField(_('IBAN'), max_length=34, blank=True, null=True)

    # Company registration fields (Category 4)
    managing_director = models.CharField(_('managing director'), max_length=200, blank=True, null=True)
    tax_id = models.CharField(_('tax ID'), max_length=50, blank=True, null=True)
    eori_number = models.CharField(_('EORI number'), max_length=20, blank=True, null=True)
    ust_id_nr = models.CharField(_('USt-IdNr'), max_length=20, blank=True, null=True)
    headquarters_city = models.CharField(_('headquarters city'), max_length=100, blank=True, null=True)
    court_district = models.CharField(_('court district'), max_length=100, blank=True, null=True)
    court_registration_number = models.CharField(_('court registration number'), max_length=50, blank=True, null=True)

    # Preferences fields (Category 5)
    target_annual_return = models.DecimalField(_('target annual return (%)'), max_digits=5, decimal_places=2, default=Decimal('10.00'))
    target_days_on_stock = models.PositiveIntegerField(_('target days on stock'), default=45)

    def __str__(self):
        return f"{self.name}"

class Branch(models.Model):
    business = models.ForeignKey(   
        Business,
        on_delete=models.CASCADE,
        related_name='business_branches',
        verbose_name=_('business')
    )
    name = models.CharField(_('name'), max_length=100)
    address = models.TextField(_('address'))
    is_active = models.BooleanField(_('is active'), default=True)

    def __str__(self):
        return f"{self.name}"

class User(AbstractUser):
    is_manager = models.BooleanField(_('is manager'), default=False)
    business = models.ForeignKey(
        Business,
        on_delete=models.SET_NULL,
        related_name='business_users',
        null=True,
        verbose_name=_('business')
    )
    transactions_access = models.BooleanField(_('transactions access'), default=False)
    legal_entities_access = models.BooleanField(_('legal entities access'), default=False)

    backup_email = models.EmailField(_('backup email address'), blank=True, null=True)
    last_activity_viewed_at = models.DateTimeField(
        _('last activity viewed at'),
        default=timezone.now,
        help_text=_('Tracks when the user last opened the notifications dropdown.')
    )

    def __str__(self):
        return f"{self.username}"

class Country(models.Model):
    name = models.CharField(_('name'), max_length=100)
    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name='countries',
        verbose_name=_('business')
    )
    is_active = models.BooleanField(_('is active'), default=True)

    class Meta:
        ordering = ['name']
        unique_together = ['name', 'business']
        verbose_name = _('Country')
        verbose_name_plural = _('Countries')

    def __str__(self):
        return self.name


class City(models.Model):
    name = models.CharField(_('name'), max_length=100)
    country = models.ForeignKey(
        'Country',
        on_delete=models.CASCADE,
        related_name='cities',
        verbose_name=_('country')
    )
    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name='cities',
        verbose_name=_('business')
    )
    is_active = models.BooleanField(_('is active'), default=True)

    class Meta:
        ordering = ['name']
        unique_together = ['name', 'country', 'business']
        verbose_name = _('City')
        verbose_name_plural = _('Cities')

    def __str__(self):
        return self.name


class LegalEntity(models.Model):
    TYPE_CHOICES = [
        ('individual', _('Individual')),
        ('company', _('Company')),
    ]
    internal_id = models.PositiveIntegerField(_('internal id'))

    name = models.CharField(_('name'), max_length=200)
    address_street = models.CharField(_('street'), max_length=200)
    address_street_number = models.PositiveIntegerField(_('street number'))
    address_postal_code = models.CharField(_('postal code'), max_length=20)
    address_country = models.ForeignKey(
        'Country',
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name='legal_entities',
        verbose_name=_('country')
    )
    address_city = models.ForeignKey(
        'City',
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name='legal_entities',
        verbose_name=_('city')
    )


    STATE_CHOICES = [
        ('active', _('Active')),
        ('inactive', _('Inactive')),
    ]
    status = models.CharField(_('status'), max_length=100, choices=STATE_CHOICES, default='active')

    email = models.EmailField(_('email'), blank=True, null=True)
    phone_number = models.CharField(_('phone number'), max_length=20, blank=True, null=True)
    type = models.CharField(
        _('type'),
        max_length=20,
        choices=TYPE_CHOICES,
        default='individual'
    )
    # Tax Identification Number - only required for companies
    tax_identification_number = models.CharField(
        _('tax identification number'),
        max_length=50,
        blank=True,
        null=True
    )
    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name='business_legal_entities',
        null=True,
        blank=True,
        verbose_name=_('business')
    )
    date_created = models.DateTimeField(_('date created'), auto_now_add=True)
    
    class Meta:
        ordering = ['name']
        unique_together = ['business', 'internal_id']
        verbose_name = _('Legal Entity')
        verbose_name_plural = _('Legal Entities')

    def save(self, *args, **kwargs):
        # Auto-generate internal_id if not provided
        if not self.internal_id:
            if self.business:
                last_entity = LegalEntity.objects.filter(business=self.business).order_by('-internal_id').first()
                self.internal_id = (last_entity.internal_id + 1) if last_entity else 1
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


################################################################
# Dynamic Choice Models
# These replace hardcoded CHOICE tuples for user-customizable options
################################################################

class PaymentMethod(models.Model):
    """User-defined payment methods for buy/sale transactions"""
    name = models.CharField(_('name'), max_length=100)
    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name='payment_methods',
        verbose_name=_('business')
    )
    is_active = models.BooleanField(_('is active'), default=True)
    applies_to_buy = models.BooleanField(_('applies to buy'), default=True)
    applies_to_sale = models.BooleanField(_('applies to sale'), default=True)
    applies_to_transactions = models.BooleanField(_('applies to transactions'), default=True)

    class Meta:
        ordering = ['name']
        unique_together = ['name', 'business']
        verbose_name = _('Payment Method')
        verbose_name_plural = _('Payment Methods')

    def __str__(self):
        return self.name


class VehicleType(models.Model):
    """User-defined vehicle types (Sedan, SUV, etc.)"""
    name = models.CharField(_('name'), max_length=100)
    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name='vehicle_types',
        verbose_name=_('business')
    )
    is_active = models.BooleanField(_('is active'), default=True)

    class Meta:
        ordering = ['name']
        unique_together = ['name', 'business']
        verbose_name = _('Vehicle Type')
        verbose_name_plural = _('Vehicle Types')

    def __str__(self):
        return self.name


class BodyType(models.Model):
    """User-defined body types (Compact, Luxury, Sports, etc.)"""
    name = models.CharField(_('name'), max_length=100)
    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name='body_types',
        verbose_name=_('business')
    )
    is_active = models.BooleanField(_('is active'), default=True)

    class Meta:
        ordering = ['name']
        unique_together = ['name', 'business']
        verbose_name = _('Body Type')
        verbose_name_plural = _('Body Types')

    def __str__(self):
        return self.name


class Make(models.Model):
    """User-defined vehicle makes (BMW, Toyota, etc.)"""
    name = models.CharField(_('name'), max_length=100)
    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name='makes',
        verbose_name=_('business')
    )
    is_active = models.BooleanField(_('is active'), default=True)

    class Meta:
        ordering = ['name']
        unique_together = ['name', 'business']
        verbose_name = _('Make')
        verbose_name_plural = _('Makes')
        db_table = 'manager_manufacturer'  # Keep old table name for migration

    def __str__(self):
        return self.name


class VehicleModel(models.Model):
    """User-defined vehicle models linked to a specific make"""
    name = models.CharField(_('name'), max_length=100)
    make = models.ForeignKey(
        'Make',
        on_delete=models.CASCADE,
        related_name='models',
        verbose_name=_('make'),
        db_column='manufacturer_id'  # Keep old column name for migration
    )
    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name='vehicle_models',
        verbose_name=_('business')
    )
    is_active = models.BooleanField(_('is active'), default=True)

    class Meta:
        ordering = ['name']
        unique_together = ['name', 'make', 'business']
        verbose_name = _('Vehicle Model')
        verbose_name_plural = _('Vehicle Models')
        db_table = 'manager_manufacturermodel'  # Keep old table name for migration

    def __str__(self):
        return f"{self.make.name} {self.name}"


class Color(models.Model):
    """User-defined vehicle colors"""
    name = models.CharField(_('name'), max_length=100)
    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name='colors',
        verbose_name=_('business')
    )
    is_active = models.BooleanField(_('is active'), default=True)

    class Meta:
        ordering = ['name']
        unique_together = ['name', 'business']
        verbose_name = _('Color')
        verbose_name_plural = _('Colors')

    def __str__(self):
        return self.name


class FuelType(models.Model):
    """User-defined fuel types (Gasoline, Diesel, Electric, etc.)"""
    name = models.CharField(_('name'), max_length=100)
    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name='fuel_types',
        verbose_name=_('business')
    )
    is_active = models.BooleanField(_('is active'), default=True)

    class Meta:
        ordering = ['name']
        unique_together = ['name', 'business']
        verbose_name = _('Fuel Type')
        verbose_name_plural = _('Fuel Types')

    def __str__(self):
        return self.name


class DamageType(models.Model):
    """User-defined damage types (Accident, Undamaged, etc.)"""
    name = models.CharField(_('name'), max_length=100)
    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name='damage_types',
        verbose_name=_('business')
    )
    is_active = models.BooleanField(_('is active'), default=True)

    class Meta:
        ordering = ['name']
        unique_together = ['name', 'business']
        verbose_name = _('Damage Type')
        verbose_name_plural = _('Damage Types')

    def __str__(self):
        return self.name


class DoorsChoice(models.Model):
    """User-defined door count options"""
    name = models.CharField(_('name'), max_length=50)
    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name='doors_choices',
        verbose_name=_('business')
    )
    is_active = models.BooleanField(_('is active'), default=True)

    class Meta:
        ordering = ['name']
        unique_together = ['name', 'business']
        verbose_name = _('Door Option')
        verbose_name_plural = _('Door Options')

    def __str__(self):
        return self.name


class TaxPercentage(models.Model):
    """User-defined tax percentage options (e.g., No Tax, 16%, 19%)"""
    name = models.CharField(_('name'), max_length=100)  # e.g., "No Tax", "16% VAT", "19% VAT"
    percentage = models.DecimalField(
        _('percentage'),
        max_digits=5,
        decimal_places=2,
        default=0,
        help_text=_('Tax percentage value (e.g., 16.00 for 16%)')
    )
    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name='tax_percentages',
        verbose_name=_('business')
    )
    is_active = models.BooleanField(_('is active'), default=True)
    is_no_tax = models.BooleanField(
        _('is no tax'),
        default=False,
        help_text=_('Check this for the "No Tax" option to enable special handling')
    )

    class Meta:
        ordering = ['percentage', 'name']
        unique_together = ['name', 'business']
        verbose_name = _('Tax Percentage')
        verbose_name_plural = _('Tax Percentages')

    def __str__(self):
        if self.is_no_tax:
            return self.name
        return f"{self.name} ({self.percentage}%)"


class Category(models.Model):
    """User-defined transaction categories"""
    name = models.CharField(_('name'), max_length=100)
    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name='categories',
        verbose_name=_('business')
    )
    is_active = models.BooleanField(_('is active'), default=True)

    class Meta:
        ordering = ['name']
        unique_together = ['name', 'business']
        verbose_name = _('Category')
        verbose_name_plural = _('Categories')

    def __str__(self):
        return self.name


class Subcategory(models.Model):
    """User-defined subcategories linked to a specific category"""
    name = models.CharField(_('name'), max_length=100)
    category = models.ForeignKey(
        'Category',
        on_delete=models.CASCADE,
        related_name='subcategories',
        verbose_name=_('category')
    )
    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name='subcategories',
        verbose_name=_('business')
    )
    is_active = models.BooleanField(_('is active'), default=True)

    class Meta:
        ordering = ['name']
        unique_together = ['name', 'category', 'business']
        verbose_name = _('Subcategory')
        verbose_name_plural = _('Subcategories')

    def __str__(self):
        return self.name


class Currency(models.Model):
    """User-defined currencies for transactions"""
    name = models.CharField(_('name'), max_length=100)  # e.g., "US Dollar"
    code = models.CharField(_('code'), max_length=10)   # e.g., "USD"
    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name='currencies',
        verbose_name=_('business')
    )
    is_active = models.BooleanField(_('is active'), default=True)

    class Meta:
        ordering = ['name']
        unique_together = ['code', 'business']
        verbose_name = _('Currency')
        verbose_name_plural = _('Currencies')

    def __str__(self):
        return f"{self.name} ({self.code})"


class KeyNumber(models.Model):
    """Tracks physical key numbers that can be assigned to vehicles."""
    number = models.PositiveIntegerField(_('key number'))
    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name='key_numbers',
        verbose_name=_('business')
    )
    vehicle = models.OneToOneField(
        'Vehicle',
        on_delete=models.SET_NULL,
        related_name='key_number',
        null=True,
        blank=True,
        verbose_name=_('vehicle')
    )
    is_active = models.BooleanField(_('is active'), default=True)

    class Meta:
        ordering = ['number']
        unique_together = ['number', 'business']
        verbose_name = _('Key Number')
        verbose_name_plural = _('Key Numbers')

    def __str__(self):
        return str(self.number)


class Vehicle(models.Model):
    ### weel drice of car
    ### benzin liters, voltagem,
    ###  hose power
    ### torque (neuton)
    ### transmission (automatic or manual)

    # @ business related @#

    STATUS_CHOICES = [
        ('purchased', _('Purchased')),
        ('ready_for_sale', _('Ready for Sale')),
        ('reserved', _('Reserved')),
        ('sold', _('Sold')),
        ('inactive', _('Inactive')),
    ]

    # ('processing', 'Processing'),
    # ('paused', 'Paused'),
    # ('auction', 'Auction'),
    # ('24h', '24h'),


    # Store when vehicle was created
    date_created = models.DateTimeField(auto_now_add=True, blank=True, null=True)

    #_
    @property
    def active_for(self):
        """Calculate days since vehicle was bought (stops counting when sold)"""
        if self.buy_date:
            # If vehicle has been sold, calculate days from buy to sale date
            if self.sale_date:
                return (self.sale_date - self.buy_date).days
            # If not sold yet, calculate days from buy date to today
            else:
                return (timezone.now().date() - self.buy_date).days
        return 0

    @property
    def sale_price_after_tax(self):
        """Calculate days since vehicle was bought (stops counting when sold)"""
        if self.sale_price and self.sale_tax and self.sale_tax.percentage:
            return self.sale_price * (1 + self.sale_tax.percentage / 100)
        return self.sale_price if self.sale_price else None

    @property
    def buy_price_after_tax(self):
        """Calculate buy price including tax from the buy_tax FK"""
        if self.buy_price and self.buy_tax and self.buy_tax.percentage:
            return self.buy_price * (1 + self.buy_tax.percentage / 100)
        return self.buy_price if self.buy_price else None



    #__
    status = models.CharField(
        _('status'),
        max_length=20,
        choices=STATUS_CHOICES,
        blank=True, null=True
    )

    description = models.TextField(_('description'), blank=True, null=True)

    # Internal comments field for business use
    internal_comments = models.TextField(_('internal comments'), blank=True, null=True)


    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name='business_vehicles',
        blank=True, null=True,
        verbose_name=_('business')
    )

    #__
    branch = models.ForeignKey(
        Branch,
        on_delete=models.CASCADE,
        related_name='branch_vehicles',
        blank=True, null=True,
        verbose_name=_('branch')
    )

    ###### Custom internal ID - unique per business
    #__
    internal_id = models.PositiveIntegerField(_('internal id'), blank=True, null=True)

    #@ official details @#

    # Chassis Number (VIN) - 17 characters, excludes I, O, Q
    #__
    chassis_number = models.CharField(
        _('chassis number (VIN)'),
        max_length=17,
        #todo
        # unique=True,   maybe should only beu nique to internal id because what if tihs car landed inthe future on a buisnes tah also have m applicaton? then it will keep saying already exist for that busienss
        blank=True,
        null=True,
        validators=[
            RegexValidator(
                regex=r'^[A-HJ-NPR-Z0-9]{17}$',
                message=_('Enter a valid 17-character VIN (excluding I, O, and Q).')
            )
        ]
    )

    # Motor Vehicle Registration Number (Kraftfahrzeugbriefnummer)
    #__
    motor_vehicle_registration_number = models.CharField(
        _('motor vehicle registration number'),
        max_length=15,
        # unique=True,
        blank=True,
        null=True,
        # validators=[
        #     RegexValidator(
        #         regex=r'^[A-Z0-9\-\s]{5,15}$',
        #         message='Enter a valid German vehicle registration number (5-15 characters, letters, numbers, hyphens, spaces).'
        #     )
        # ]
    )

    # # Official License Plate Type (Amtliches Kennzeichen Categories)
    # LICENSE_PLATE_TYPE_CHOICES = [
    #     # Standard German License Plates
    #     ('standard', 'Standard License Plate'),
    #     ('personalized', 'Personalized License Plate (Wunschkennzeichen)'),
    #     ('seasonal', 'Seasonal License Plate (Saisonkennzeichen)'),
    #     ('red', 'Red License Plate (Rote Kennzeichen) - Trade/Test'),
    #     ('green', 'Green License Plate (Grüne Kennzeichen) - Agricultural'),
    #     ('yellow', 'Yellow License Plate (Gelbe Kennzeichen) - Military'),
    #     ('diplomatic', 'Diplomatic License Plate'),
    #     ('export', 'Export License Plate'),
    #     ('temporary', 'Temporary License Plate (Kurzzeitkennzeichen)'),
    #     ('classic', 'Classic Car License Plate (H-Kennzeichen)'),
    #     ('electric', 'Electric Vehicle License Plate (E-Kennzeichen)'),
    #     ('disabled', 'Disabled Person License Plate'),
    #     ('taxi', 'Taxi License Plate'),
    #     ('police', 'Police License Plate'),
    #     ('ambulance', 'Emergency Vehicle License Plate'),
    #     ('fire_department', 'Fire Department License Plate'),
    #     ('government', 'Government Vehicle License Plate'),
    #     ('municipal', 'Municipal Vehicle License Plate'),
    #
    #     # EU/International License Plates
    #     ('eu_standard', 'EU Standard License Plate'),
    #     ('international', 'International License Plate'),
    #     ('transit', 'Transit License Plate'),
    #     ('foreign', 'Foreign License Plate'),
    #     ('other', 'Other License Plate Type'),
    # ]
    #
    #
    # # License Plate Type
    # license_plate_type = models.CharField(
    #     max_length=20,
    #     choices=LICENSE_PLATE_TYPE_CHOICES,
    #     blank=True,
    #     null=True,
    #     help_text="Type of official license plate (Amtliches Kennzeichen)"
    # )

    #__
    # Official License Plate Number (Amtliches Kennzeichen)
    official_license_plate = models.CharField(
        _('official license plate'),
        max_length=15,
        # unique=True,
        blank=True,
        null=True,
        # validators=[
        #     RegexValidator(
        #         regex=r'^[A-Z]{1,3}-[A-Z]{1,2}\d{1,4}$',
        #         message='Enter a valid German license plate (e.g., B-AB 1234).'
        #     )
        # ],
        # help_text="Official License Plate Number (Amtliches Kennzeichen) - Format: District-Letters Numbers (e.g., B-AB 1234)"
    )




    #@ usage details @#
    # accident_vehicle = models.BooleanField(_('accident vehicle'), blank=True, null=True)

    # damage_type - now uses ForeignKey to DamageType model
    damage_type = models.ForeignKey(
        'DamageType',
        on_delete=models.SET_NULL,
        related_name='vehicles',
        null=True,
        blank=True,
        verbose_name=_('damage type')
    )

    first_registration_date = models.DateField(_('first registration date'), blank=True, null=True)

    @classmethod
    def get_year_choices(cls):
        """Get year choices for forms"""
        current_year = datetime.now().year
        return reversed([(str(year), str(year)) for year in range(1900, current_year + 3)])

    year_of_construction = models.PositiveIntegerField(_('year of construction'), blank=True, null=True)

    #__
    kilometer = models.PositiveIntegerField(_('kilometer'), blank=True, null=True)
    # @ car official details numbers @ #

    # @ buy details @#
    #__
    buy_price = models.DecimalField(_('buy price'), blank=True, null=True, max_digits=12, decimal_places=2)
    #__
    # buy_price_taxes - now uses ForeignKey to TaxPercentage model
    buy_tax = models.ForeignKey(
        'TaxPercentage',
        on_delete=models.SET_NULL,
        related_name='buy_vehicles',
        null=True,
        blank=True,
        verbose_name=_('buy tax')
    )
    buy_date = models.DateField(_('buy date'), blank=True, null=True)
    buy_delivery_collection_date = models.DateField(_('buy delivery/collection date'), blank=True, null=True)

    # buy_payment_method - now uses ForeignKey to PaymentMethod model
    buy_payment_method = models.ForeignKey(
        'PaymentMethod',
        on_delete=models.SET_NULL,
        related_name='buy_vehicles',
        null=True,
        blank=True,
        verbose_name=_('buy payment method')
    )
    seller = models.ForeignKey(
        LegalEntity,
        on_delete=models.SET_NULL,
        related_name='seller_vehicles',
        null=True,
        blank=True,
        verbose_name=_('seller')
    )
    buyer = models.ForeignKey(
        LegalEntity,
        on_delete=models.SET_NULL,
        related_name='buyer_vehicles',
        null=True,
        blank=True,
        verbose_name=_('buyer')
    )

    # @ sale details @#
    #__
    sale_price = models.DecimalField(_('sale price'), blank=True, null=True, max_digits=12, decimal_places=2)
    #__
    # sale_price_taxes - now uses ForeignKey to TaxPercentage model
    sale_tax = models.ForeignKey(
        'TaxPercentage',
        on_delete=models.SET_NULL,
        related_name='sale_vehicles',
        null=True,
        blank=True,
        verbose_name=_('sale tax')
    )


    sale_date = models.DateField(_('sale date'), blank=True, null=True)
    sale_delivery_collection_date = models.DateField(_('sale delivery/collection date'), blank=True, null=True)


    # sale_payment_method - now uses ForeignKey to PaymentMethod model
    sale_payment_method = models.ForeignKey(
        'PaymentMethod',
        on_delete=models.SET_NULL,
        related_name='sale_vehicles',
        null=True,
        blank=True,
        verbose_name=_('sale payment method')
    )
    sale_invoice_number = models.CharField(_('sale invoice number'), max_length=50, blank=True, null=True)


    # Sale Invoice Number (Rechnungsnummer) - Auto-generated
    sale_invoice_number = models.CharField(
        _('sale invoice number'),
        max_length=30,
        # unique=True,   ## maybe this shoudl be unique to internal id not id idk becaue what if two businesses ahd the same rechnung? i need to remember hwo rechnungs are made to decide
        blank=True,
        null=True,
    )


    # @ general details @#

    # vehicle_type - now uses ForeignKey to VehicleType model
    vehicle_type = models.ForeignKey(
        'VehicleType',
        on_delete=models.SET_NULL,
        related_name='vehicles',
        null=True,
        blank=True,
        verbose_name=_('vehicle type')
    )


    # body_type - now uses ForeignKey to BodyType model
    body_type = models.ForeignKey(
        'BodyType',
        on_delete=models.SET_NULL,
        related_name='vehicles',
        null=True,
        blank=True,
        verbose_name=_('body type')
    )



    # make - ForeignKey to Make model (renamed from manufacturer)
    make = models.ForeignKey(
        'Make',
        on_delete=models.SET_NULL,
        related_name='vehicles',
        null=True,
        blank=True,
        verbose_name=_('make'),
        db_column='manufacturer_id'  # Keep old column name for migration
    )

    # model - ForeignKey to VehicleModel (new FK, replaces manufacturer_model CharField)
    model = models.ForeignKey(
        'VehicleModel',
        on_delete=models.SET_NULL,
        related_name='vehicles',
        null=True,
        blank=True,
        verbose_name=_('model')
    )

    # Legacy field - kept for data migration, will be removed later
    manufacturer_model = models.CharField(
        _('manufacturer model (legacy)'),
        max_length=100,
        blank=True, null=True
    )

    # color - now uses ForeignKey to Color model
    color = models.ForeignKey(
        'Color',
        on_delete=models.SET_NULL,
        related_name='vehicles',
        null=True,
        blank=True,
        verbose_name=_('color')
    )

    # doors - now uses ForeignKey to DoorsChoice model
    doors = models.ForeignKey(
        'DoorsChoice',
        on_delete=models.SET_NULL,
        related_name='vehicles',
        null=True,
        blank=True,
        verbose_name=_('doors')
    )

    # fuel_type - now uses ForeignKey to FuelType model
    fuel_type = models.ForeignKey(
        'FuelType',
        on_delete=models.SET_NULL,
        related_name='vehicles',
        null=True,
        blank=True,
        verbose_name=_('fuel type')
    )
    #__
    power_kw = models.PositiveIntegerField(_('power (kW)'), blank=True, null=True)

    image = models.ImageField(
        _('image'),
        upload_to='images/vehicles/',
        blank=True, null=True
    )

    @property
    def total_revenue(self):
        result = self.vehicle_transactions.filter(
            amount__gt=0
        ).aggregate(
            total=Sum('amount')
        )['total']
        return result or 0

    @property
    def total_expenses(self):
        result = self.vehicle_transactions.filter(
            amount__lt=0
        ).aggregate(
            total=Sum('amount')
        )['total']
        return abs(result or 0)  # Return as positive number

    @property
    def net_profit(self):
        result = self.vehicle_transactions.aggregate(
            total=Sum('amount')
        )['total']
        return result or 0

        # New: compute net price (price before tax) when gross is stored and taxes are a percentage

    @property
    def buy_price_net(self):
        if self.buy_price is None:
            return None
        try:
            gross = Decimal(self.buy_price)
            # Get tax percentage from the buy_tax FK, default to 0 if not set or is_no_tax
            tax_percent = Decimal('0')
            if self.buy_tax and not self.buy_tax.is_no_tax:
                tax_percent = Decimal(self.buy_tax.percentage or 0)
            if tax_percent == Decimal('0'):
                return gross.quantize(Decimal('0.01'))
            tax_rate = tax_percent / Decimal('100')
            net = gross / (Decimal('1') + tax_rate)
            return net.quantize(Decimal('0.01'))
        except (InvalidOperation, ZeroDivisionError):
            return None

    @property
    def sale_price_net(self):
        if self.sale_price is None:
            return None
        try:
            gross = Decimal(self.sale_price)
            # Get tax percentage from the sale_tax FK, default to 0 if not set or is_no_tax
            tax_percent = Decimal('0')
            if self.sale_tax and not self.sale_tax.is_no_tax:
                tax_percent = Decimal(self.sale_tax.percentage or 0)
            if tax_percent == Decimal('0'):
                return gross.quantize(Decimal('0.01'))
            tax_rate = tax_percent / Decimal('100')
            net = gross / (Decimal('1') + tax_rate)
            return net.quantize(Decimal('0.01'))
        except (InvalidOperation, ZeroDivisionError):
            return None

    def get_financial_summary(self):
        """Get all financial data in one query for efficiency"""
        from django.db.models import Sum, Case, When, FloatField

        summary = self.vehicle_transactions.aggregate(
            revenue=Sum(
                Case(
                    When(amount__gt=0, then='amount'),
                    default=0,
                    output_field=FloatField()
                )
            ),
            expenses=Sum(
                Case(
                    When(amount__lt=0, then='amount'),
                    default=0,
                    output_field=FloatField()
                )
            )
        )

        revenue = summary['revenue'] or 0
        expenses = abs(summary['expenses'] or 0)  # Convert to positive
        net = revenue - expenses

        return {
            'revenue': revenue,
            'expenses': expenses,
            'net_profit': net
        }


    # =========================================================================
    # Legacy compatibility methods for PDF generation
    # These methods replicate the old get_*_display() behavior for FK fields
    # that were previously CharField choices. Legacy PDF views call these.
    # =========================================================================

    def get_manufacturer_display(self):
        """Legacy compat: was choices CharField, now FK to Make."""
        return self.make.name if self.make else ""

    def get_vehicle_type_display(self):
        """Legacy compat: was choices CharField, now FK to VehicleType."""
        return self.vehicle_type.name if self.vehicle_type else ""

    def get_body_type_display(self):
        """Legacy compat: was choices CharField, now FK to BodyType."""
        return self.body_type.name if self.body_type else ""

    def get_color_display(self):
        """Legacy compat: was choices CharField, now FK to Color."""
        return self.color.name if self.color else ""

    def get_fuel_type_display(self):
        """Legacy compat: was choices CharField, now FK to FuelType."""
        return self.fuel_type.name if self.fuel_type else ""

    def get_buy_payment_method_display(self):
        """Legacy compat: was choices CharField, now FK to PaymentMethod."""
        return self.buy_payment_method.name if self.buy_payment_method else ""

    def get_sale_payment_method_display(self):
        """Legacy compat: was choices CharField, now FK to PaymentMethod."""
        return self.sale_payment_method.name if self.sale_payment_method else ""

    def get_damage_type_display(self):
        """Legacy compat: was choices CharField, now FK to DamageType."""
        return self.damage_type.name if self.damage_type else ""

    @property
    def buy_price_taxes(self):
        """Legacy compat: computed buy tax amount from FK relationship."""
        if self.buy_price and self.buy_tax and self.buy_tax.percentage:
            return float(self.buy_price) * float(self.buy_tax.percentage) / 100
        return 0

    @property
    def sale_price_taxes(self):
        """Legacy compat: computed sale tax amount from FK relationship."""
        if self.sale_price and self.sale_tax and self.sale_tax.percentage:
            return float(self.sale_price) * float(self.sale_tax.percentage) / 100
        return 0

    # Also provide 'manufacturer' as an alias for legacy code that accesses vehicle.manufacturer directly
    @property
    def manufacturer(self):
        """Legacy compat: old code uses vehicle.manufacturer, now it's vehicle.make."""
        return self.make.name if self.make else ""

    class Meta:
        ###### Ensure internal_id is unique per business
        unique_together = ['business', 'internal_id']
        ordering = ['business', 'internal_id']

    def save(self, *args, **kwargs):
        # Auto-generate internal_id if not provided
        if not self.internal_id:
            if self.business:
                # Get the highest internal_id for this business (ALL vehicles to avoid unique constraint violations)
                last_vehicle = Vehicle.objects.filter(business=self.business).order_by('-internal_id').first()
                self.internal_id = (last_vehicle.internal_id + 1) if last_vehicle else 1

        # Auto-generate invoice number if not provided
        if not self.sale_invoice_number and self.pk:
            # Get the business ID


            # Count existing invoices for this business
            existing_count = Vehicle.objects.filter(
                business=self.business,
                sale_invoice_number__isnull=False
            ).count()

            # Generate sequential number
            sequential_number = existing_count + 1

            # Create invoice number
            self.sale_invoice_number = f"Rng-{sequential_number:04d}"

        # Auto-release key if vehicle is sold or inactive
        if self.pk and self.status in ['sold', 'inactive']:
            from manager.models import KeyNumber
            KeyNumber.objects.filter(vehicle=self).update(vehicle=None)

        super().save(*args, **kwargs)

    def __str__(self):
        make_name = self.make.name if self.make else ""
        model_name = self.model.name if self.model else (self.manufacturer_model or "")
        body_name = self.body_type.name if self.body_type else ""
        parts = [p for p in (make_name, model_name, body_name) if p]
        return " ".join(parts) or f"Vehicle #{self.internal_id}"

    # def __str__(self):
    #     manufacturer_label = self.get_manufacturer_display() if self.manufacturer else ''
    #     body_label = self.get_body_type_display() if self.body_type else ''
    #     parts = [p for p in (manufacturer_label, self.manufacturer_model, body_label) if p]
    #     return " ".join(parts) or _("Vehicle #{}").format(self.internal_id)

class Transaction(models.Model):

    #################

    STATUS_CHOICES = [
        ('confirmed', _('Confirmed')),
        ('review_required', _('Review required')),
        ('inactive', _('Inactive')),
    ]

    status = models.CharField(
        _('status'),
        max_length=20,
        choices=STATUS_CHOICES,
        blank=True, null=True
    )

    vehicle = models.ForeignKey(
        Vehicle,
        on_delete=models.CASCADE,
        related_name='vehicle_transactions',
        blank=True, null=True,
        verbose_name=_('Vehicle')

    )

    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name='business_transactions',
        blank=True, null=True,
        verbose_name=_('business')
    )

    #################

    internal_id = models.PositiveIntegerField(_('internal id'), blank=True, null=True)

    #####################
    METHOD_CHOICES = [
        ('cash', _('Cash')),
        ('volksbank', _('Volksbank')),
        ('sparkasse', _('Sparkasse')),
        ('other', _('Other')),
    ]

    method = models.CharField(_('method'), max_length=20, choices=METHOD_CHOICES, blank=True, null=True)
    
    # FK replacement for method (using PaymentMethod model)
    payment_method = models.ForeignKey(
        'PaymentMethod',
        on_delete=models.SET_NULL,
        related_name='transactions',
        null=True,
        blank=True,
        verbose_name=_('payment method')
    )

    #####################

    # Buchungsdatum   /   Wertstellungsdatum
    date = models.DateField(_('date'), blank=True, null=True)
    # Buchungstext
    description = models.TextField(_('information'), blank=True, null=True)
    # Betrag
    amount = models.DecimalField(_('amount'), blank=True, null=True, max_digits=12, decimal_places=2)

    CURRENCY_CHOICES = [
        ('Afghani', 'AFN'),
        ('Euro', 'EUR'),
        ('Lek', 'ALL'),
        ('Algerian Dinar', 'DZD'),
        ('US Dollar', 'USD'),
        ('Kwanza', 'AOA'),
        ('East Caribbean Dollar', 'XCD'),
        ('Arab Accounting Dinar', 'XAD'),
        ('Argentine Peso', 'ARS'),
        ('Armenian Dram', 'AMD'),
        ('Aruban Florin', 'AWG'),
        ('Australian Dollar', 'AUD'),
        ('Azerbaijan Manat', 'AZN'),
        ('Bahamian Dollar', 'BSD'),
        ('Bahraini Dinar', 'BHD'),
        ('Taka', 'BDT'),
        ('Barbados Dollar', 'BBD'),
        ('Belarusian Ruble', 'BYN'),
        ('Belize Dollar', 'BZD'),
        ('CFA Franc BCEAO', 'XOF'),
        ('Bermudian Dollar', 'BMD'),
        ('Indian Rupee', 'INR'),
        ('Ngultrum', 'BTN'),
        ('Boliviano', 'BOB'),
        ('Mvdol', 'BOV'),
        ('Convertible Mark', 'BAM'),
        ('Pula', 'BWP'),
        ('Norwegian Krone', 'NOK'),
        ('Brazilian Real', 'BRL'),
        ('Brunei Dollar', 'BND'),
        ('Bulgarian Lev', 'BGN'),
        ('Burundi Franc', 'BIF'),
        ('Cabo Verde Escudo', 'CVE'),
        ('Riel', 'KHR'),
        ('CFA Franc BEAC', 'XAF'),
        ('Canadian Dollar', 'CAD'),
        ('Cayman Islands Dollar', 'KYD'),
        ('Chilean Peso', 'CLP'),
        ('Unidad de Fomento', 'CLF'),
        ('Yuan Renminbi', 'CNY'),
        ('Colombian Peso', 'COP'),
        ('Unidad de Valor Real', 'COU'),
        ('Comorian Franc', 'KMF'),
        ('Congolese Franc', 'CDF'),
        ('New Zealand Dollar', 'NZD'),
        ('Costa Rican Colon', 'CRC'),
        ('Cuban Peso', 'CUP'),
        ('Caribbean Guilder', 'XCG'),
        ('Czech Koruna', 'CZK'),
        ('Danish Krone', 'DKK'),
        ('Djibouti Franc', 'DJF'),
        ('Dominican Peso', 'DOP'),
        ('Egyptian Pound', 'EGP'),
        ('El Salvador Colon', 'SVC'),
        ('Nakfa', 'ERN'),
        ('Lilangeni', 'SZL'),
        ('Ethiopian Birr', 'ETB'),
        ('Falkland Islands Pound', 'FKP'),
        ('Fiji Dollar', 'FJD'),
        ('CFP Franc', 'XPF'),
        ('Dalasi', 'GMD'),
        ('Lari', 'GEL'),
        ('Ghana Cedi', 'GHS'),
        ('Gibraltar Pound', 'GIP'),
        ('Quetzal', 'GTQ'),
        ('Pound Sterling', 'GBP'),
        ('Guinean Franc', 'GNF'),
        ('Guyana Dollar', 'GYD'),
        ('Gourde', 'HTG'),
        ('Lempira', 'HNL'),
        ('Hong Kong Dollar', 'HKD'),
        ('Forint', 'HUF'),
        ('Iceland Krona', 'ISK'),
        ('Rupiah', 'IDR'),
        ('SDR (Special Drawing Right)', 'XDR'),
        ('Iranian Rial', 'IRR'),
        ('Iraqi Dinar', 'IQD'),
        ('New Israeli Sheqel', 'ILS'),
        ('Jamaican Dollar', 'JMD'),
        ('Yen', 'JPY'),
        ('Jordanian Dinar', 'JOD'),
        ('Tenge', 'KZT'),
        ('Kenyan Shilling', 'KES'),
        ('North Korean Won', 'KPW'),
        ('Won', 'KRW'),
        ('Kuwaiti Dinar', 'KWD'),
        ('Som', 'KGS'),
        ('Lao Kip', 'LAK'),
        ('Lebanese Pound', 'LBP'),
        ('Loti', 'LSL'),
        ('Rand', 'ZAR'),
        ('Liberian Dollar', 'LRD'),
        ('Libyan Dinar', 'LYD'),
        ('Swiss Franc', 'CHF'),
        ('Pataca', 'MOP'),
        ('Malagasy Ariary', 'MGA'),
        ('Malawi Kwacha', 'MWK'),
        ('Malaysian Ringgit', 'MYR'),
        ('Rufiyaa', 'MVR'),
        ('Ouguiya', 'MRU'),
        ('Mauritius Rupee', 'MUR'),
        ('ADB Unit of Account', 'XUA'),
        ('Mexican Peso', 'MXN'),
        ('Mexican Unidad de Inversion (UDI)', 'MXV'),
        ('Moldovan Leu', 'MDL'),
        ('Tugrik', 'MNT'),
        ('Moroccan Dirham', 'MAD'),
        ('Mozambique Metical', 'MZN'),
        ('Kyat', 'MMK'),
        ('Namibia Dollar', 'NAD'),
        ('Nepalese Rupee', 'NPR'),
        ('Cordoba Oro', 'NIO'),
        ('Naira', 'NGN'),
        ('Denar', 'MKD'),
        ('Rial Omani', 'OMR'),
        ('Pakistan Rupee', 'PKR'),
        ('Balboa', 'PAB'),
        ('Kina', 'PGK'),
        ('Guarani', 'PYG'),
        ('Sol', 'PEN'),
        ('Philippine Peso', 'PHP'),
        ('Zloty', 'PLN'),
        ('Qatari Rial', 'QAR'),
        ('Romanian Leu', 'RON'),
        ('Russian Ruble', 'RUB'),
        ('Rwanda Franc', 'RWF'),
        ('Saint Helena Pound', 'SHP'),
        ('Tala', 'WST'),
        ('Dobra', 'STN'),
        ('Saudi Riyal', 'SAR'),
        ('Serbian Dinar', 'RSD'),
        ('Seychelles Rupee', 'SCR'),
        ('Leone', 'SLE'),
        ('Singapore Dollar', 'SGD'),
        ('Sucre', 'XSU'),
        ('Solomon Islands Dollar', 'SBD'),
        ('Somali Shilling', 'SOS'),
        ('South Sudanese Pound', 'SSP'),
        ('Sri Lanka Rupee', 'LKR'),
        ('Sudanese Pound', 'SDG'),
        ('Surinam Dollar', 'SRD'),
        ('Swedish Krona', 'SEK'),
        ('WIR Euro', 'CHE'),
        ('WIR Franc', 'CHW'),
        ('Syrian Pound', 'SYP'),
        ('New Taiwan Dollar', 'TWD'),
        ('Somoni', 'TJS'),
        ('Tanzanian Shilling', 'TZS'),
        ('Baht', 'THB'),
        ('Pa\'anga', 'TOP'),
        ('Trinidad and Tobago Dollar', 'TTD'),
        ('Tunisian Dinar', 'TND'),
        ('Turkish Lira', 'TRY'),
        ('Turkmenistan New Manat', 'TMT'),
        ('Uganda Shilling', 'UGX'),
        ('Hryvnia', 'UAH'),
        ('UAE Dirham', 'AED'),
        ('US Dollar (Next day)', 'USN'),
        ('Peso Uruguayo', 'UYU'),
        ('Uruguay Peso en Unidades Indexadas (UI)', 'UYI'),
        ('Unidad Previsional', 'UYW'),
        ('Uzbekistan Sum', 'UZS'),
        ('Vatu', 'VUV'),
        ('Bolívar Soberano', 'VES'),
        ('Dong', 'VND'),
        ('Yemeni Rial', 'YER'),
        ('Zambian Kwacha', 'ZMW'),
        ('Zimbabwe Gold', 'ZWG'),
        ('Bond Markets Unit European Composite Unit (EURCO)', 'XBA'),
        ('Bond Markets Unit European Monetary Unit (E.M.U.-6)', 'XBB'),
        ('Bond Markets Unit European Unit of Account 9 (E.U.A.-9)', 'XBC'),
        ('Bond Markets Unit European Unit of Account 17 (E.U.A.-17)', 'XBD'),
        ('Codes specifically reserved for testing purposes', 'XTS'),
        ('The codes assigned for transactions where no currency is involved', 'XXX'),
        ('Gold', 'XAU'),
        ('Palladium', 'XPD'),
        ('Platinum', 'XPT'),
        ('Silver', 'XAG'),
    ]

    # currency
    currency = models.CharField(
        _('currency'),
        choices=CURRENCY_CHOICES,
        blank=True, null=True
    )
    
    # FK replacement for currency (using Currency model)
    currency_fk = models.ForeignKey(
        'Currency',
        on_delete=models.SET_NULL,
        related_name='transactions',
        null=True,
        blank=True,
        verbose_name=_('currency')
    )
    
    # Name / (Remitter & Payee)
    from_or_to = models.CharField(_('from/to'), blank=True, null=True)

    #//////////

    #camtTxId
    datetime = models.CharField(_('date time'), blank=True, null=True)

    ################3

    tax = models.DecimalField(_('tax'), blank=True, null=True, max_digits=10, decimal_places=2)

    CATEGORY_CHOICES = [
        ('car_purchase', _('Car Purchase')),
        ('advance_payment', _('Advance Payment')),
        ('legal_costs', _('Legal Costs')),
        ('car_sale', _('Car Sale')),
        ('bank', _('Bank')),
        ('contributions', _('Contributions')),
        ('entertainment', _('Entertainment')),
        ('office', _('Office')),
        ('loan', _('Loan')),
        ('deposit', _('Deposit')),
        ('withdrawal', _('Withdrawal')),
        ('vehicles', _('Vehicles')),
        ('financing', _('Financing')),
        ('court_costs', _('Court Costs')),
        ('price_reduction', _('Price Reduction')),
        ('deposit_bond', _('Deposit Bond')),
        ('wages_salaries', _('Wages Salaries')),
        ('rent_utilities', _('Rent Utilities')),
        ('private_transfer', _('Private Transfer')),
        ('commission', _('Commission')),
        ('invoice', _('Invoice')),
        ('donation', _('Donation')),
        ('tax_consultant', _('Tax Consultant')),
        ('taxes', _('Taxes')),
        ('phone_communication', _('Phone Communication')),
        ('insurance', _('Insurance')),
        ('advertising', _('Advertising')),
        ('other_fees', _('Other Fees')),
        ('unknown', _('Unknown')),
    ]

    category = models.CharField(_('category'), max_length=20, choices=CATEGORY_CHOICES, blank=True, null=True)

    # FK replacement for category (using Category model)
    category_fk = models.ForeignKey(
        'Category',
        on_delete=models.SET_NULL,
        related_name='transactions',
        null=True,
        blank=True,
        verbose_name=_('category')
    )

    subcategory = models.CharField(_('subcategory'), max_length=20, blank=True, null=True)
    
    # FK replacement for subcategory (using Subcategory model)
    subcategory_fk = models.ForeignKey(
        'Subcategory',
        on_delete=models.SET_NULL,
        related_name='transactions',
        null=True,
        blank=True,
        verbose_name=_('subcategory')
    )

    # Internal comments field for business use
    internal_comments = models.TextField(_('internal comments'), blank=True, null=True)

    #################

    @classmethod
    def get_total_revenue(cls, business=None):
        """Get total revenue (positive amounts) for all transactions"""
        queryset = cls.objects.all()
        if business:
            queryset = queryset.filter(business=business)

        result = queryset.filter(
            amount__gt=0
        ).aggregate(
            total=Sum('amount')
        )['total']
        return result or 0

    @classmethod
    def get_total_expenses(cls, business=None):
        """Get total expenses (negative amounts as positive number) for all transactions"""
        queryset = cls.objects.all()
        if business:
            queryset = queryset.filter(business=business)

        result = queryset.filter(
            amount__lt=0
        ).aggregate(
            total=Sum('amount')
        )['total']
        return abs(result) or 0  # Return as positive number

    @classmethod
    def get_net_profit(cls, business=None):
        """Get net profit (sum of all amounts) for all transactions"""
        queryset = cls.objects.all()
        if business:
            queryset = queryset.filter(business=business)

        result = queryset.aggregate(
            total=Sum('amount')
        )['total']
        return result or 0



###################################################333

    @classmethod
    def get_net_total_revenue_from_queryset(cls, queryset):
        """Sum nets for transactions with amount > 0 (returns positive Decimal)."""
        total_net = Decimal('0')
        for t in queryset.filter(amount__gt=0):
            try:
                gross = Decimal(t.amount)
                tax_pct = Decimal(t.tax or 0)
                denom = Decimal('1') + (tax_pct / Decimal('100'))
                net = (gross / denom).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            except (InvalidOperation, ZeroDivisionError):
                net = Decimal('0')
            total_net += net
        return total_net

    @classmethod
    def get_net_total_expenses_from_queryset(cls, queryset):
        """Sum nets for transactions with amount < 0 (returns negative Decimal)."""
        total_net = Decimal('0')
        for t in queryset.filter(amount__lt=0):
            try:
                gross = Decimal(t.amount)
                tax_pct = Decimal(t.tax or 0)
                denom = Decimal('1') + (tax_pct / Decimal('100'))
                net = (gross / denom).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            except (InvalidOperation, ZeroDivisionError):
                net = Decimal('0')
            total_net += net
        return abs(total_net)

    @classmethod
    def get_net_difference_from_queryset(cls, queryset):
        """Net difference = total net revenue (positive) + total net expenses (negative)."""
        revenue_net = cls.get_net_total_revenue_from_queryset(queryset)
        expenses_net = cls.get_net_total_expenses_from_queryset(queryset)
        return revenue_net - expenses_net

    @classmethod
    def get_tax_total_revenue_from_queryset(cls, queryset):
        """Sum tax portions for transactions with amount > 0 (returns positive Decimal)."""
        total_tax = Decimal('0')
        for t in queryset.filter(amount__gt=0):
            try:
                gross = Decimal(t.amount)
                tax_pct = Decimal(t.tax or 0)
                denom = Decimal('1') + (tax_pct / Decimal('100'))
                net = (gross / denom)
                tax_amount = (net * (tax_pct / Decimal('100'))).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            except (InvalidOperation, ZeroDivisionError):
                tax_amount = Decimal('0')
            total_tax += abs(tax_amount)
        return total_tax

    @classmethod
    def get_tax_total_expenses_from_queryset(cls, queryset):
        """Sum tax portions for transactions with amount < 0 (returns positive Decimal)."""
        total_tax = Decimal('0')
        for t in queryset.filter(amount__lt=0):
            try:
                gross = Decimal(t.amount)
                tax_pct = Decimal(t.tax or 0)
                denom = Decimal('1') + (tax_pct / Decimal('100'))
                net = (gross / denom)
                # tax portion magnitude = abs(gross - net)
                tax_amount = (gross - net).copy_abs().quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            except (InvalidOperation, ZeroDivisionError):
                tax_amount = Decimal('0')
            total_tax += tax_amount
        return abs(total_tax)

    @classmethod
    def get_tax_difference_from_queryset(cls, queryset):
        """Total tax = revenue tax (positive) + expenses tax (positive)."""
        revenue_tax = cls.get_tax_total_revenue_from_queryset(queryset)
        expenses_tax = cls.get_tax_total_expenses_from_queryset(queryset)
        return revenue_tax + expenses_tax

    @classmethod
    def get_gross_total_revenue_from_queryset(cls, queryset):
        queryset = queryset.exclude(status='inactive')
        result = queryset.filter(amount__gt=0).aggregate(total=Sum('amount'))['total']
        return result if result is not None else 0

    @classmethod
    def get_gross_total_expenses_from_queryset(cls, queryset):
        queryset = queryset.exclude(status='inactive')
        result = queryset.filter(amount__lt=0).aggregate(total=Sum('amount'))['total']
        # Check if result is None before using abs()
        if result is None:
            return 0
        return abs(result)

    @classmethod
    def get_gross_difference_from_queryset(cls, queryset):
        queryset = queryset.exclude(status='inactive')
        result = queryset.aggregate(total=Sum('amount'))['total']
        return result if result is not None else 0



######################################3333



    @classmethod
    def get_net_total_revenue_for_vehicle_queryset(cls, vehicle_queryset):
        """Get total revenue for transactions linked to specific vehicles"""
        vehicle_ids = vehicle_queryset.values_list('id', flat=True)
        queryset = cls.objects.filter(vehicle_id__in=vehicle_ids)
        return cls.get_net_total_revenue_from_queryset(queryset)

    @classmethod
    def get_net_total_expenses_for_vehicle_queryset(cls, vehicle_queryset):
        """Get total expenses for transactions linked to specific vehicles"""
        vehicle_ids = vehicle_queryset.values_list('id', flat=True)
        queryset = cls.objects.filter(vehicle_id__in=vehicle_ids)
        return cls.get_net_total_expenses_from_queryset(queryset)

    @classmethod
    def get_net_difference_for_vehicle_queryset(cls, vehicle_queryset):
        """Get net profit for transactions linked to specific vehicles"""
        vehicle_ids = vehicle_queryset.values_list('id', flat=True)
        queryset = cls.objects.filter(vehicle_id__in=vehicle_ids)
        return cls.get_net_difference_from_queryset(queryset)

    @classmethod
    def get_tax_total_revenue_for_vehicle_queryset(cls, vehicle_queryset):
        """Get total revenue for transactions linked to specific vehicles"""
        vehicle_ids = vehicle_queryset.values_list('id', flat=True)
        queryset = cls.objects.filter(vehicle_id__in=vehicle_ids)
        return cls.get_tax_total_revenue_from_queryset(queryset)

    @classmethod
    def get_tax_total_expenses_for_vehicle_queryset(cls, vehicle_queryset):
        """Get total expenses for transactions linked to specific vehicles"""
        vehicle_ids = vehicle_queryset.values_list('id', flat=True)
        queryset = cls.objects.filter(vehicle_id__in=vehicle_ids)
        return cls.get_tax_total_expenses_from_queryset(queryset)

    @classmethod
    def get_tax_difference_for_vehicle_queryset(cls, vehicle_queryset):
        """Get net profit for transactions linked to specific vehicles"""
        vehicle_ids = vehicle_queryset.values_list('id', flat=True)
        queryset = cls.objects.filter(vehicle_id__in=vehicle_ids)
        return cls.get_tax_difference_from_queryset(queryset)

    @classmethod
    def get_total_revenue_for_vehicle_queryset(cls, vehicle_queryset):
        """Get total revenue for transactions linked to specific vehicles"""
        vehicle_ids = vehicle_queryset.values_list('id', flat=True)
        queryset = cls.objects.filter(vehicle_id__in=vehicle_ids)
        return cls.get_gross_total_revenue_from_queryset(queryset)

    @classmethod
    def get_total_expenses_for_vehicle_queryset(cls, vehicle_queryset):
        """Get total expenses for transactions linked to specific vehicles"""
        vehicle_ids = vehicle_queryset.values_list('id', flat=True)
        queryset = cls.objects.filter(vehicle_id__in=vehicle_ids)
        return cls.get_gross_total_expenses_from_queryset(queryset)

    @classmethod
    def get_net_profit_for_vehicle_queryset(cls, vehicle_queryset):
        """Get net profit for transactions linked to specific vehicles"""
        vehicle_ids = vehicle_queryset.values_list('id', flat=True)
        queryset = cls.objects.filter(vehicle_id__in=vehicle_ids)
        return cls.get_gross_difference_from_queryset(queryset)


    class Meta:
        ###### Ensure internal_id is unique per business
        unique_together = ['business', 'internal_id']
        ordering = ['business', 'internal_id']

    def save(self, *args, **kwargs):
        # Auto-generate internal_id if not provided
        if not self.internal_id:
            if self.business:
                last_transaction = Transaction.objects.filter(business=self.business).order_by('-internal_id').first()
                self.internal_id = (last_transaction.internal_id + 1) if last_transaction else 1

        # =====================================================================
        # Auto-compute status based on mandatory fields
        # Rule:
        # - If any mandatory field is missing/empty/null → 'review_required' (unless 'inactive')
        # - If all mandatory fields are filled:
        #     - If status is None/empty → 'confirmed'
        #     - Otherwise preserve status (e.g. 'confirmed', 'review_required', 'inactive')
        # - 'inactive' status is NEVER overridden
        # =====================================================================
        if self.status != 'inactive':
            has_category = bool((self.category and str(self.category).strip()) or self.category_fk_id)
            has_subcategory = bool((self.subcategory and str(self.subcategory).strip()) or self.subcategory_fk_id)
            has_tax = self.tax is not None
            has_date = bool(self.date)
            has_method = bool((self.method and str(self.method).strip()) or self.payment_method_id)
            has_from_or_to = bool(self.from_or_to and str(self.from_or_to).strip())
            has_amount = self.amount is not None
            has_currency = bool((self.currency and str(self.currency).strip()) or self.currency_fk_id)

            all_mandatory = (has_category and has_subcategory and has_tax and
                             has_date and has_method and has_from_or_to and
                             has_amount and has_currency)

            if not all_mandatory:
                self.status = 'review_required'
            elif not self.status:
                self.status = 'confirmed'

        super().save(*args, **kwargs)

    @property
    def method_display(self):
        """Human-readable label for the method choice (e.g. 'Sparkasse')."""
        if self.payment_method:
            return self.payment_method.name
        return self.get_method_display() if self.method else ''

    @property
    def category_display(self):
        """Human-readable label for the category choice (e.g. 'Car Purchase')."""
        return self.get_category_display() if self.category else ''

    def __str__(self):
        # Use the human-readable category label (and keep subcategory text)
        category_label = self.get_category_display() if self.category else None
        if category_label and self.subcategory:
            return f"{category_label} ({self.subcategory})"
        elif category_label:
            return f"{category_label}"
        # fallback to method label if category missing
        elif self.method:
            return self.get_method_display()
        else:
            return _("Transaction #{}").format(self.internal_id)


class VehicleExpenseEarning(models.Model):
    """
    Lightweight, vehicle-scoped expense/earning entry (MVP).
    Distinct from Transaction — NOT linked to bank transactions yet.
    Reuses the same Category/Subcategory models as Transaction.
    """
    TYPE_CHOICES = [
        ('expense', _('Expense')),
        ('earning', _('Earning')),
    ]

    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name='vehicle_expenses_earnings',
        verbose_name=_('business'),
    )
    vehicle = models.ForeignKey(
        'Vehicle',
        on_delete=models.CASCADE,
        related_name='expenses_earnings',
        verbose_name=_('vehicle'),
    )
    category = models.ForeignKey(
        'Category',
        on_delete=models.PROTECT,
        related_name='vehicle_expenses_earnings',
        verbose_name=_('category'),
    )
    subcategory = models.ForeignKey(
        'Subcategory',
        on_delete=models.PROTECT,
        related_name='vehicle_expenses_earnings',
        verbose_name=_('subcategory'),
    )
    type = models.CharField(_('type'), max_length=10, choices=TYPE_CHOICES)
    amount = models.DecimalField(_('amount'), max_digits=12, decimal_places=2)
    is_active = models.BooleanField(_('is active'), default=True)
    created_at = models.DateTimeField(_('created at'), auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    @property
    def signed_amount(self):
        return self.amount if self.type == 'earning' else -self.amount

    def __str__(self):
        return f"{self.get_type_display()}: {self.amount} ({self.vehicle_id})"


class AuthActionRequest(models.Model):
    """
    Universal model for cross-device authentication actions.
    
    Supports all email-based auth flows with a single polling system:
    - Manager Login: Manager enters credentials, clicks email link on any device
    - Employee Login: Employee enters credentials, manager approves via email
    - Password Reset: User requests reset, clicks email link to proceed
    - Email Verification: User verifies email ownership via link
    
    Flow:
    1. User submits form → AuthActionRequest created with PENDING status
    2. Email sent with approval/verification link
    3. User's frontend polls /api/auth/poll-status/{request_id}
    4. Recipient clicks link → status changes to APPROVED
    5. Frontend receives 200 OK → takes appropriate action
    """
    ACTION_TYPES = [
        ('employee_login', _('Employee Login')),
        ('manager_login', _('Manager Login')),
        ('password_reset', _('Password Reset')),
        ('verify_email', _('Verify Email')),  # Stage 1: Verify backup email (login forgot-email flow)
        ('confirm_email', _('Confirm Email')),  # Stage 2: Confirm new email (login forgot-email flow)
        # User Settings flows
        ('password_change', _('Password Change')),  # Verify before changing password
        ('email_change_verify_old', _('Email Change - Verify Old')),  # Stage 1: verify old email
        ('email_change_verify_new', _('Email Change - Verify New')),  # Stage 2: verify new email
        ('backup_email_verify_official', _('Backup Email - Verify Official')),  # Stage 1: verify via official email
        ('backup_email_verify_new', _('Backup Email - Verify New')),  # Stage 2: verify new backup email
        # Registration flows
        ('register_verify_email', _('Register - Verify Email')),
        ('register_verify_backup', _('Register - Verify Backup')),
        ('admin_activate', _('Admin Activate Account')),
    ]
    
    STATUS_CHOICES = [
        ('pending', _('Pending')),
        ('approved', _('Approved')),
        ('rejected', _('Rejected')),
        ('expired', _('Expired')),
        ('used', _('Used')),
        ('waiting_for_new_email', _('Waiting for New Email')),  # Two-stage email change
        ('waiting_for_backup_email', _('Waiting for Backup Email')),  # Registration: waiting for backup verification
        ('waiting_for_admin', _('Waiting for Admin')),  # Registration: waiting for admin activation
    ]
    
    # Unique identifier for polling (UUID)
    request_id = models.CharField(_('request ID'), max_length=64, unique=True, db_index=True)
    
    # Token for approval link (separate from request_id for security)
    approval_token = models.CharField(_('approval token'), max_length=64, unique=True)
    
    # Type of action this request is for
    action_type = models.CharField(
        _('action type'),
        max_length=40,
        choices=ACTION_TYPES,
        default='manager_login'
    )
    
    # The user who initiated the request
    user = models.ForeignKey(
        'User',
        on_delete=models.CASCADE,
        related_name='auth_requests',
        verbose_name=_('user')
    )
    
    # Status of the request
    status = models.CharField(
        _('status'),
        max_length=25,
        choices=STATUS_CHOICES,
        default='pending'
    )
    
    # JSON payload for storing action-specific context
    # Examples:
    #   - password_reset: {"reset_token": "..."}
    #   - verify_email: {"new_email": "new@example.com"}
    #   - login: {} (no extra data needed)
    payload = models.JSONField(_('payload'), default=dict, blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(_('created at'), auto_now_add=True)
    expires_at = models.DateTimeField(_('expires at'))
    approved_at = models.DateTimeField(_('approved at'), null=True, blank=True)
    
    # IP address for security logging
    ip_address = models.GenericIPAddressField(_('IP address'), null=True, blank=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = _('Auth Action Request')
        verbose_name_plural = _('Auth Action Requests')
    
    def is_expired(self):
        """Check if the request has expired."""
        return timezone.now() > self.expires_at
    
    def approve(self):
        """Approve the request. Returns True if successful."""
        if self.is_expired():
            self.status = 'expired'
            self.save()
            return False
        
        if self.status != 'pending':
            return False
        
        self.status = 'approved'
        self.approved_at = timezone.now()
        self.save()
        return True
    
    def mark_used(self):
        """Mark the request as used (after successful action)."""
        self.status = 'used'
        self.save()
    
    def __str__(self):
        return f"AuthActionRequest({self.user.username}, {self.action_type}, {self.status})"


class ActivityLog(models.Model):
    """
    Tracks user activity across the system.
    Logs actions like create, update, delete, status_change on various entities.
    """
    ACTION_CHOICES = [
        ('create', _('Create')),
        ('update', _('Update')),
        ('delete', _('Delete')),
        ('status_change', _('Status Change')),
    ]
    
    ENTITY_CHOICES = [
        ('vehicle', _('Vehicle')),
        ('transaction', _('Transaction')),
        ('legal_entity', _('Legal Entity')),
        ('user', _('User')),
        ('business_settings', _('Business Settings')),
        ('choice', _('Choice')),
    ]
    
    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name='activity_logs',
        verbose_name=_('business')
    )
    
    user = models.ForeignKey(
        'User',
        on_delete=models.SET_NULL,
        related_name='activity_logs',
        null=True,
        blank=True,
        verbose_name=_('user')
    )
    
    action = models.CharField(
        _('action'),
        max_length=20,
        choices=ACTION_CHOICES
    )
    
    entity_type = models.CharField(
        _('entity type'),
        max_length=30,
        choices=ENTITY_CHOICES
    )
    
    entity_id = models.PositiveIntegerField(
        _('entity ID'),
        null=True,
        blank=True,
        help_text=_('Internal ID of the affected entity')
    )
    
    entity_name = models.CharField(
        _('entity name'),
        max_length=200,
        blank=True,
        help_text=_('Display name for the entity (e.g., "BMW X5", "Transaction #123")')
    )
    
    details = models.TextField(
        _('details'),
        blank=True,
        help_text=_('Additional details about the action')
    )
    
    timestamp = models.DateTimeField(
        _('timestamp'),
        auto_now_add=True
    )
    
    class Meta:
        ordering = ['-timestamp']
        verbose_name = _('Activity Log')
        verbose_name_plural = _('Activity Logs')
    
    def __str__(self):
        return f"{self.user.username if self.user else 'System'} {self.action} {self.entity_type} [{self.entity_name}]"
