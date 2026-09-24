from django.contrib.auth import authenticate, login, logout, get_user_model
from django.db import IntegrityError
from django.shortcuts import render, redirect
from django_browser_reload.views import message
from django.urls import reverse
from django.http import HttpResponse, HttpResponseRedirect, JsonResponse
from django.contrib import messages

from .models import *
from .pdf_generators.transaction_pdfs import (
    generate_transaction_pdf,
    generate_transactions_summary_pdf,
)
from .pdf_generators.vehicle_pdfs import (
    generate_binding_order_pdf,
    generate_identity_check_pdf,
    generate_receipt_verkaufvertrag_pdf,
    generate_sale_agreement_pdf,
    generate_vehicle_buy_contract_pdf,
    generate_vehicle_sale_contract_pdf,
)


import tempfile
import os
from datetime import datetime
import pandas
import io
from decimal import Decimal
import re
from num2words import num2words





"""
#####
Reference to: Django_tutorials/15_Django-email-confirm at main · pythonlessons/Django_tutorials, 2022
Django_tutorials/15_Django-email-confirm at main · pythonlessons/Django_tutorials, 2022
"""
from django.template.loader import render_to_string
from django.contrib.sites.shortcuts import get_current_site
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.core.mail import EmailMultiAlternatives
from django.utils.html import strip_tags

import secrets
# from cryptography.fernet import Fernet

from .tokens import account_activation_token

from django_ratelimit.decorators import ratelimit

# Create your views here.

# In your views.py
from django.shortcuts import render
from django.http import Http404

import re
from django.core.paginator import Paginator, EmptyPage, PageNotAnInteger
from decimal import Decimal, InvalidOperation



### HELPER FUNCTIONS ####
def get_manufacturer_models_for_manufacturer(manufacturer):
    """Helper function to get manufacturer models without needing a request object"""
    MANUFACTURER_MODELS_CHOICES = {
        'audi': ['A1', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'Q2', 'Q3', 'Q4', 'Q5', 'Q7', 'Q8', 'TT', 'R8', 'e-tron',
                     'e-tron GT', 'RS3', 'RS4', 'RS5', 'RS6', 'RS7'],
        'bmw': ['1 Series', '2 Series', '3 Series', '4 Series', '5 Series', '6 Series', '7 Series', '8 Series',
                    'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'Z3', 'Z4', 'Z8', 'i3', 'i8', 'iX', 'i4', 'iX3'],
        'mercedes': ['A-Class', 'B-Class', 'C-Class', 'CLA-Class', 'CLS-Class', 'E-Class', 'S-Class', 'G-Class',
                         'GLA-Class', 'GLB-Class', 'GLC-Class', 'GLE-Class', 'GLS-Class', 'AMG GT', 'SL-Class',
                         'SLC-Class', 'Sprinter', 'V-Class', 'Metris'],
        'porsche': ['911', 'Cayenne', 'Macan', 'Panamera', 'Taycan', 'Boxster', 'Cayman', '718', '918 Spyder',
                        'Carrera GT'],
        'volkswagen': ['Golf', 'Jetta', 'Passat', 'Arteon', 'Tiguan', 'Atlas', 'Beetle', 'CC', 'Eos', 'Routan',
                           'Touareg', 'ID.4', 'ID.3', 'ID.6', 'ID.7', 'T-Cross', 'T-Roc'],
        'opel': ['Corsa', 'Astra', 'Insignia', 'Mokka', 'Crossland', 'Grandland', 'Combo', 'Vivaro', 'Movano',
                     'Adam', 'Karl', 'Vectra', 'Zafira', 'Meriva', 'Antara'],
        'mini': ['Cooper', 'Cooper S', 'Cooper SE', 'Countryman', 'Clubman', 'Convertible', 'Hardtop', 'Paceman'],
        'smart': ['Fortwo', 'Forfour', 'Roadster', 'Crossblade'],
        'maybach': ['S-Class', 'GLS', '57', '62', 'Landaulet'],
        'bugatti': ['Veyron', 'Chiron', 'Divo', 'Centodieci', 'La Voiture Noire', 'EB110'],
        'lamborghini': ['Huracan', 'Aventador', 'Urus', 'Gallardo', 'Murcielago', 'Countach', 'Diablo', 'Espada',
                            'Miura', 'Countach LPI 800-4'],
        'bentley': ['Continental', 'Flying Spur', 'Bentayga', 'Mulsanne', 'Azure', 'Arnage'],
        'rolls_royce': ['Ghost', 'Wraith', 'Dawn', 'Cullinan', 'Phantom', 'Silver Shadow', 'Corniche'],
        'toyota': ['Camry', 'Corolla', 'RAV4', 'Highlander', 'Prius', 'Yaris', 'Avalon', '4Runner', 'Sequoia',
                       'Tacoma', 'Tundra', 'Sienna', 'Land Cruiser', 'C-HR', 'Venza', 'GR Supra'],
        'honda': ['Civic', 'Accord', 'CR-V', 'Pilot', 'Fit', 'HR-V', 'Passport', 'Ridgeline', 'Insight', 'Clarity',
                      'NSX', 'S2000'],
        'nissan': ['Altima', 'Sentra', 'Rogue', 'Murano', 'Pathfinder', 'Versa', 'Maxima', 'Armada', 'Titan',
                       'Frontier', 'NV200', 'NV Passenger', '370Z', 'GT-R'],
        'hyundai': ['Elantra', 'Sonata', 'Tucson', 'Santa Fe', 'Accent', 'Veloster', 'Genesis', 'Palisade',
                        'Kona', 'Ioniq', 'Nexo'],
        'kia': ['Forte', 'Optima', 'Sportage', 'Sorento', 'Rio', 'Stinger', 'Telluride', 'Niro', 'Soul', 'Sedona'],
        'mazda': ['Mazda3', 'Mazda6', 'CX-5', 'CX-9', 'MX-5', 'CX-3', 'CX-30', 'MX-30', 'Tribute', 'Protege'],
        'subaru': ['Impreza', 'Legacy', 'Outback', 'Forester', 'WRX', 'Ascent', 'BRZ', 'Crosstrek', 'Tribeca'],
        'lexus': ['IS', 'ES', 'GS', 'LS', 'RX', 'GX', 'LX', 'NX', 'UX', 'LC', 'RC', 'SC'],
        'infiniti': ['Q50', 'Q60', 'Q70', 'QX50', 'QX60', 'QX80', 'G37', 'M35', 'FX35', 'JX35'],
        'acura': ['ILX', 'TLX', 'RLX', 'RDX', 'MDX', 'NSX', 'TSX', 'TL', 'RSX', 'Integra'],
        'genesis': ['G70', 'G80', 'G90', 'GV70', 'GV80'],
        'volvo': ['S60', 'S90', 'V60', 'V90', 'XC40', 'XC60', 'XC90', '240', '740', '940', '850', 'C30'],
        'jaguar': ['XE', 'XF', 'XJ', 'F-PACE', 'E-PACE', 'I-PACE', 'XK', 'F-Type', 'X-Type', 'S-Type'],
        'land_rover': ['Range Rover', 'Range Rover Sport', 'Range Rover Evoque', 'Discovery', 'Defender',
                           'Freelander', 'LR2', 'LR3', 'LR4'],
    }

    # Get distinct manufacturer + model pairs from DB
    db_pairs = Vehicle.objects.values_list('manufacturer', 'manufacturer_model').distinct()

    for manu, model in db_pairs:
        if not manu or not model:
            continue

        key = str(manu).strip().lower()
        model_value = str(model).strip()

        # ensure key exists and is a list
        if key not in MANUFACTURER_MODELS_CHOICES:
            MANUFACTURER_MODELS_CHOICES[key] = []

        # append model if missing
        if model_value not in MANUFACTURER_MODELS_CHOICES[key]:
            MANUFACTURER_MODELS_CHOICES[key].append(model_value)

    # Convert list of strings to list of tuples (value, label)
    model_list = MANUFACTURER_MODELS_CHOICES.get(manufacturer, [])
    return [(model, model) for model in model_list]

def get_subcategories_for_category(category):
    """Helper function to get manufacturer models without needing a request object"""
    CATEGORIES_SUBCATEGORIES_CHOICES = {
        'car_purchase': ['Purchase Price', 'Partial Payment', 'Final Payment', 'Purchase Price Reduction',
                         'Cancellation', 'Damages'],
        'advance_payment': ['Down Payment', 'Installment', 'Advance on Salary', 'Project Advance', 'Supplier Advance'],
        'legal_costs': ['Lawyer Fees', 'Court Fees', 'Notary Fees', 'Legal Consultation', 'Contract Review',
                        'Lawsuit Costs'],
        'car_sale': ['Sale Price', 'Deposit Received', 'Final Payment Received', 'Commission Paid',
                     'Sale Cancellation'],
        'bank': ['Account Fees', 'Transfer Fees', 'Loan Interest', 'Credit Card Fees', 'Bank Charges',
                 'Overdraft Fees'],
        'contributions': ['Association Fees', 'Chamber of Commerce', 'Professional Memberships',
                          'Industry Contributions'],
        'entertainment': ['Business Meals', 'Client Entertainment', 'Corporate Events', 'Team Building',
                          'Conference Meals'],
        'office': ['Office Supplies', 'Furniture', 'Equipment', 'Software', 'Maintenance', 'Cleaning Services'],
        'loan': ['Principal Payment', 'Interest Payment', 'Loan Fees', 'Early Repayment', 'Loan Processing'],
        'deposit': ['Capital Injection', 'Owner Investment', 'Shareholder Deposit', 'Additional Capital'],
        'withdrawal': ['Owner Drawings', 'Partner Withdrawals', 'Dividend Payments', 'Personal Expenses'],
        'vehicles': ['Fuel', 'Maintenance', 'Repairs', 'Insurance', 'Tax', 'Parking', 'Tolls', 'Leasing Costs'],
        'financing': ['Loan Arrangement', 'Broker Fees', 'Financing Costs', 'Credit Fees', 'Security Deposits'],
        'court_costs': ['Filing Fees', 'Expert Witness', 'Court Reports', 'Bailiff Costs', 'Legal Proceedings'],
        'price_reduction': ['Discount Given', 'Rebate', 'Price Adjustment', 'Customer Refund', 'Warranty Reduction'],
        'deposit_bond': ['Rental Deposit', 'Security Deposit', 'Contract Bond', 'Performance Guarantee'],
        'wages_salaries': ['Gross Salary', 'Overtime', 'Bonuses', 'Commissions', 'Holiday Pay', 'Sick Pay'],
        'rent_utilities': ['Base Rent', 'Heating', 'Electricity', 'Water', 'Internet', 'Property Tax',
                           'Maintenance Fees'],
        'private_transfer': ['Personal Transfer', 'Owner Withdrawal', 'Family Support', 'Personal Investment'],
        'commission': ['Sales Commission', 'Broker Commission', 'Agent Fees', 'Referral Fees', 'Success Fees'],
        'invoice': ['Customer Invoice', 'Service Invoice', 'Product Sale', 'Recurring Billing', 'Credit Note'],
        'other_fees': ['Bank Charges', 'Government Fees', 'License Fees', 'Permit Costs', 'Miscellaneous Charges'],
        'donation': ['Charity Donation', 'Political Donation', 'Community Support', 'Educational Sponsorship'],
        'tax_consultant': ['Tax Preparation', 'Consultation Fees', 'Filing Services', 'Tax Planning', 'Audit Support'],
        'taxes': ['Income Tax', 'VAT', 'Corporate Tax', 'Trade Tax', 'Property Tax', 'Payroll Tax'],
        'phone_communication': ['Mobile Phone', 'Landline', 'Internet Services', 'Postage', 'Courier Services',
                                'Software Licenses'],
        'insurance': ['Vehicle Insurance', 'Business Insurance', 'Liability Insurance', 'Health Insurance',
                      'Property Insurance'],
        'advertising': ['Online Ads', 'Print Media', 'Billboards', 'Social Media', 'Marketing Campaigns',
                        'Promotional Materials'],
        'other': ['Miscellaneous', 'Uncategorized', 'General Expenses', 'One-time Costs'],
        'unknown': ['To be Categorized', 'Needs Review', 'Unidentified Transaction'],
    }

    # Convert list of strings to list of tuples (value, label)
    subcategories_list = CATEGORIES_SUBCATEGORIES_CHOICES.get(category, [])
    return [(subcategory, subcategory) for subcategory in subcategories_list]

###############add ########################
def validate_chassis_number(vin):
    """Validate VIN format"""

    # Remove spaces and convert to uppercase
    vin = vin.replace(' ', '').upper()

    # Check length and pattern
    if len(vin) != 17:
        return False, "Chassis number must be exactly 17 characters"

    if not re.match(r'^[A-HJ-NPR-Z0-9]{17}$', vin):
        return False, "Chassis number contains invalid characters(I, O, Q)"

    if Vehicle.objects.exclude(status="inactive").filter(chassis_number=vin).exists():
        return False, "Chassis number already exists"

    return True, ""

def validate_motor_vehicle_registration(registration_number):
    """Validate motor vehicle registration number with universal rules"""


    # 2. Must be reasonable length (not too short, not too long)
    if len(registration_number) < 3 or len(registration_number) > 12:
        return False, "Registration number must be between 3-12 characters"

    # 3. Must contain only letters and numbers (universal)
    if not registration_number.isalnum():
        return False, "Registration number can only contain letters and numbers"

    if Vehicle.objects.exclude(status="inactive").filter(motor_vehicle_registration_number=registration_number).exists():
        return False, "Registration number already exists"

    return True, ""

def validate_license_plate(license_plate):
    """Validate license plate with universal rules"""

    # Only enforce what ALL countries have in common:

    # 2. Must be reasonable length (not too short, not too long)
    if len(license_plate) < 3 or len(license_plate) > 12:
        return False, "License plate must be between 3-12 characters"

    # 3. Must contain only letters and numbers (universal)
    if not license_plate.isalnum():
        return False, "License plate can only contain letters and numbers"

    if Vehicle.objects.exclude(status="inactive").filter(official_license_plate=license_plate).exists():
        return False, "License plate already exists"

    return True, ""
############### edit #####################
def validate_chassis_number_edit(vin, vehicle):
    """Validate VIN format"""

    # Remove spaces and convert to uppercase
    vin = vin.replace(' ', '').upper()

    # Check length and pattern
    if len(vin) != 17:
        return False, "Chassis number must be exactly 17 characters"

    if not re.match(r'^[A-HJ-NPR-Z0-9]{17}$', vin):
        return False, "Chassis number contains invalid characters(I, O, Q)"

    if Vehicle.objects.exclude(id=vehicle.id).exclude(status="inactive").filter(chassis_number=vin).exists():
        return False, "Chassis number already exists"

    return True, ""

def validate_motor_vehicle_registration_edit(registration_number, vehicle):
    """Validate motor vehicle registration number with universal rules"""


    # 2. Must be reasonable length (not too short, not too long)
    if len(registration_number) < 3 or len(registration_number) > 12:
        return False, "Registration number must be between 3-12 characters"

    # 3. Must contain only letters and numbers (universal)
    if not registration_number.isalnum():
        return False, "Registration number can only contain letters and numbers"

    if Vehicle.objects.exclude(id=vehicle.id).exclude(internal_id=vehicle.internal_id).exclude(status="inactive").filter(motor_vehicle_registration_number=registration_number).exists():
        return False, "Registration number already exists"

    return True, ""

def validate_license_plate_edit(license_plate, vehicle):
    """Validate license plate with universal rules"""

    # Only enforce what ALL countries have in common:

    # 2. Must be reasonable length (not too short, not too long)
    if len(license_plate) < 3 or len(license_plate) > 12:
        return False, "License plate must be between 3-12 characters"

    # 3. Must contain only letters and numbers (universal)
    if not license_plate.isalnum():
        return False, "License plate can only contain letters and numbers"

    if Vehicle.objects.exclude(id=vehicle.id).exclude(internal_id=vehicle.internal_id).exclude(status="inactive").filter(official_license_plate=license_plate).exists():
        return False, "License plate already exists"

    return True, ""


################# idk ##################
def modify_filename_with_timestamp(filename):
    """
    Add current date and time to filename while preserving the extension
    Example: 'car image.jpg' -> 'car_image_20241220_143052.jpg'
    """
    if not filename:
        return filename

    # Get current date and time
    now = datetime.now()
    timestamp = now.strftime("%Y%m%d_%H%M%S")

    # Split filename and extension
    name, ext = os.path.splitext(filename)

    # Replace spaces with underscores and add timestamp
    name_with_underscores = name.replace(' ', '_')
    new_filename = f"{name_with_underscores}_{timestamp}{ext}"

    return new_filename
def get_manufacturer_models(request):
    """Return manufacturer models for a specific manufacturer via AJAX"""
    manufacturer_id = request.GET.get('manufacturer_id')
    
    if not manufacturer_id:
        return JsonResponse({'success': False, 'models': [], 'message': 'manufacturer_id is required'})
    
    try:
        # Get models from ManufacturerModel table
        models = ManufacturerModel.objects.filter(
            manufacturer_id=manufacturer_id,
            is_active=True
        ).values('id', 'name').order_by('name')
        
        return JsonResponse({
            'success': True,
            'models': list(models)
        })
    except Exception as e:
        return JsonResponse({'success': False, 'models': [], 'message': str(e)})
###############################################


################### error pages ######################
def custom_404(request, exception=None):
    return render(request, '404.html', status=404)

# def custom_500(request):
#     return render(request, '500.html', status=500)
###################################################
##############Vehicles###############
# def vehicles_access_validation(request, business_name):
#     if request.user.is_authenticated:
#         if request.user.business.name == business_name:
#             pass
#         else:
#             messages.error(request, "You dont have access to that page")
#             return redirect(reverse('vehicles', args=[business_name]))
#     else:
#         messages.error(request, "You are not logged in, please login.")
#         return redirect(reverse('user-login'))

def get_vehicle_models(request, business_name):
    """AJAX endpoint to get vehicle models for a specific manufacturer"""
    if request.user.is_authenticated:
        if request.user.business.name == business_name:
            manufacturer = request.GET.get('manufacturer')
            if manufacturer:
                # Get unique models for the selected manufacturer in this business (active vehicles only)
                models = Vehicle.objects.exclude(status="inactive").filter(
                    business=request.user.business,
                    manufacturer=manufacturer,
                    manufacturer_model__isnull=False,
                ).values_list('manufacturer_model', flat=True).distinct().order_by('manufacturer_model')

                return JsonResponse({
                    'models': list(models)
                })
        else:
            messages.error(request, "Forbidden: You dont have access to perform this action")
            return redirect('vehicles', business_name=request.user.business.name)
    else:
        messages.error(request, "Unauthorized: You are not logged in, please log in.")
        return redirect(reverse('user-login'))
    # return JsonResponse({'models': []})

def vehicles(request, business_name):
    if request.user.is_authenticated:
        if request.user.business.name == business_name:
            user = request.user

            # Get all active vehicles for this business
            vehicles_queryset = Vehicle.objects.filter(business=user.business)  # .exclude(status="inactive")

            # Initialize filter values
            filter_data = {}

            if request.method == 'GET':
                # Get filter parameters from URL
                status_filter = request.GET.get('status', '')
                manufacturer_filter = request.GET.get('manufacturer', '')
                manufacturer_model_filter = request.GET.get('manufacturer_model', '')
                vehicle_type_filter = request.GET.get('vehicle_type', '')
                body_type_filter = request.GET.get('body_type', '')
                fuel_type_filter = request.GET.get('fuel_type', '')
                color_filter = request.GET.get('color', '')
                doors_filter = request.GET.get('doors', '')
                branch_filter = request.GET.get('branch', '')

                # Price filters
                min_buy_price = request.GET.get('min_buy_price', '')
                max_buy_price = request.GET.get('max_buy_price', '')
                specific_buy_price = request.GET.get('specific_buy_price', '')
                min_sale_price = request.GET.get('min_sale_price', '')
                max_sale_price = request.GET.get('max_sale_price', '')
                specific_sale_price = request.GET.get('specific_sale_price', '')
                # Date filters
                min_buy_date = request.GET.get('min_buy_date', '')
                max_buy_date = request.GET.get('max_buy_date', '')
                specific_buy_date = request.GET.get('specific_buy_date', '')
                min_sale_date = request.GET.get('min_sale_date', '')
                max_sale_date = request.GET.get('max_sale_date', '')
                specific_sale_date = request.GET.get('specific_sale_date', '')
                min_year = request.GET.get('min_year', '')
                max_year = request.GET.get('max_year', '')
                specific_year = request.GET.get('specific_year', '')
                min_kilometer = request.GET.get('min_kilometer', '')
                max_kilometer = request.GET.get('max_kilometer', '')
                specific_kilometer = request.GET.get('specific_kilometer', '')
                min_power_kw = request.GET.get('min_power_kw', '')
                max_power_kw = request.GET.get('max_power_kw', '')
                specific_power_kw = request.GET.get('specific_power_kw', '')

                # Search filters
                vehicle_id_search = request.GET.get('vehicle_id_search', '')
                chassis_number_search = request.GET.get('chassis_number_search', '')
                motor_vehicle_registration_search = request.GET.get('motor_vehicle_registration_search', '')
                official_license_plate_search = request.GET.get('official_license_plate_search', '')
                sale_invoice_number_search = request.GET.get('sale_invoice_number', '')

                # Accident vehicle filter
                damage_type_filter = request.GET.get('damage_type', '')
                # accident_vehicle_filter = request.GET.get('accident_vehicle', '')

                # Apply filters
                if status_filter:
                    vehicles_queryset = vehicles_queryset.filter(status=status_filter)
                    filter_data['status'] = status_filter
                else:
                    vehicles_queryset = vehicles_queryset.exclude(status="inactive")

                if manufacturer_filter:
                    vehicles_queryset = vehicles_queryset.filter(manufacturer=manufacturer_filter)
                    filter_data['manufacturer'] = manufacturer_filter

                if manufacturer_model_filter:
                    vehicles_queryset = vehicles_queryset.filter(manufacturer_model__icontains=manufacturer_model_filter)
                    filter_data['manufacturer_model'] = manufacturer_model_filter

                if vehicle_type_filter:
                    vehicles_queryset = vehicles_queryset.filter(vehicle_type=vehicle_type_filter)
                    filter_data['vehicle_type'] = vehicle_type_filter

                if body_type_filter:
                    vehicles_queryset = vehicles_queryset.filter(body_type=body_type_filter)
                    filter_data['body_type'] = body_type_filter

                if fuel_type_filter:
                    vehicles_queryset = vehicles_queryset.filter(fuel_type=fuel_type_filter)
                    filter_data['fuel_type'] = fuel_type_filter

                if color_filter:
                    vehicles_queryset = vehicles_queryset.filter(color=color_filter)
                    filter_data['color'] = color_filter

                if doors_filter:
                    vehicles_queryset = vehicles_queryset.filter(doors=doors_filter)
                    filter_data['doors'] = doors_filter

                if branch_filter:
                    vehicles_queryset = vehicles_queryset.filter(branch_id=branch_filter)
                    filter_data['branch'] = branch_filter

                # Buy price filters
                if min_buy_price:
                    vehicles_queryset = vehicles_queryset.filter(buy_price__gte=min_buy_price)
                    filter_data['min_buy_price'] = min_buy_price

                if max_buy_price:
                    vehicles_queryset = vehicles_queryset.filter(buy_price__lte=max_buy_price)
                    filter_data['max_buy_price'] = max_buy_price

                # if specific_buy_price:
                #     vehicles_queryset = vehicles_queryset.filter(specific_buy_price=specific_buy_price)
                #     filter_data['specific_buy_price'] = specific_buy_price

                # Sale price filters
                if min_sale_price:
                    vehicles_queryset = vehicles_queryset.filter(sale_price__gte=min_sale_price)
                    filter_data['min_sale_price'] = min_sale_price

                if max_sale_price:
                    vehicles_queryset = vehicles_queryset.filter(sale_price__lte=max_sale_price)
                    filter_data['max_sale_price'] = max_sale_price

                # if specific_sale_price:
                #     vehicles_queryset = vehicles_queryset.filter(specific_sale_price=specific_sale_price)
                #     filter_data['specific_sale_price'] = specific_sale_price

                # Date filters
                if min_buy_date:
                    vehicles_queryset = vehicles_queryset.filter(buy_date__gte=min_buy_date)
                    filter_data['min_buy_date'] = min_buy_date

                if max_buy_date:
                    vehicles_queryset = vehicles_queryset.filter(buy_date__lte=max_buy_date)
                    filter_data['max_buy_date'] = max_buy_date

                # if specific_buy_date:
                #     vehicles_queryset = vehicles_queryset.filter(specific_buy_date=specific_buy_date)
                #     filter_data['specific_buy_date'] = specific_buy_date

                if min_sale_date:
                    vehicles_queryset = vehicles_queryset.filter(sale_date__gte=min_sale_date)
                    filter_data['min_sale_date'] = min_sale_date

                if max_sale_date:
                    vehicles_queryset = vehicles_queryset.filter(sale_date__lte=max_sale_date)
                    filter_data['max_sale_date'] = max_sale_date

                # if specific_sale_date:
                #     vehicles_queryset = vehicles_queryset.filter(specific_sale_date=specific_sale_date)
                #     filter_data['specific_sale_date'] = specific_sale_date

                if min_year:
                    vehicles_queryset = vehicles_queryset.filter(year_of_construction__gte=min_year)
                    filter_data['min_year'] = min_year

                if max_year:
                    vehicles_queryset = vehicles_queryset.filter(year_of_construction__lte=max_year)
                    filter_data['max_year'] = max_year

                # if specific_year:
                #     vehicles_queryset = vehicles_queryset.filter(year_of_construction=specific_year)
                #     filter_data['specific_year'] = specific_year

                if min_kilometer:
                    vehicles_queryset = vehicles_queryset.filter(kilometer__gte=min_kilometer)
                    filter_data['min_kilometer'] = min_kilometer

                if max_kilometer:
                    vehicles_queryset = vehicles_queryset.filter(kilometer__lte=max_kilometer)
                    filter_data['max_kilometer'] = max_kilometer

                # if specific_kilometer:
                #     vehicles_queryset = vehicles_queryset.filter(kilometer=specific_kilometer)
                #     filter_data['specific_kilometer'] = specific_kilometer

                # Power filters
                if min_power_kw:
                    vehicles_queryset = vehicles_queryset.filter(power_kw__gte=min_power_kw)
                    filter_data['min_power_kw'] = min_power_kw

                if max_power_kw:
                    vehicles_queryset = vehicles_queryset.filter(power_kw__lte=max_power_kw)
                    filter_data['max_power_kw'] = max_power_kw

                # if specific_power_kw:
                #     vehicles_queryset = vehicles_queryset.filter(power_kw=specific_power_kw)
                #     filter_data['specific_power_kw'] = specific_power_kw

                # Search filters
                if vehicle_id_search:
                    vehicles_queryset = vehicles_queryset.filter(internal_id=vehicle_id_search)
                    filter_data['vehicle_id_search'] = vehicle_id_search

                if chassis_number_search:
                    vehicles_queryset = vehicles_queryset.filter(chassis_number=chassis_number_search)
                    filter_data['chassis_number_search'] = chassis_number_search

                if motor_vehicle_registration_search:
                    vehicles_queryset = vehicles_queryset.filter(
                        motor_vehicle_registration_number=motor_vehicle_registration_search)
                    filter_data['motor_vehicle_registration_search'] = motor_vehicle_registration_search

                if official_license_plate_search:
                    vehicles_queryset = vehicles_queryset.filter(
                        official_license_plate=official_license_plate_search)
                    filter_data['official_license_plate_search'] = official_license_plate_search

                if sale_invoice_number_search:
                    vehicles_queryset = vehicles_queryset.filter(sale_invoice_number=sale_invoice_number_search)
                    filter_data['sale_invoice_number_search'] = sale_invoice_number_search

                if damage_type_filter:
                    vehicles_queryset = vehicles_queryset.filter(damage_type=damage_type_filter)
                    filter_data['damage_type'] = damage_type_filter

                # # Accident vehicle filter
                # if accident_vehicle_filter != '':
                #     accident_value = accident_vehicle_filter == 'true'
                #     vehicles_queryset = vehicles_queryset.filter(accident_vehicle=accident_value)
                #     filter_data['accident_vehicle'] = accident_vehicle_filter
            else:
                vehicles_queryset = vehicles_queryset.exclude(status="inactive")
            # Apply sorting
            sort_field = request.GET.get('sort', '')
            sort_order = request.GET.get('order', 'asc')

            if sort_field:
                # Map sort field names to actual model fields
                sort_field_mapping = {
                    'manufacturer': 'manufacturer',
                    'manufacturer_model': 'manufacturer_model',
                    'buy_price': 'buy_price',
                    'sale_price': 'sale_price',
                    'kilometer': 'kilometer',
                    'buy_date': 'buy_date',
                    'sale_date': 'sale_date',
                    'status': 'status',
                    'year': 'year_of_construction',
                    'power_kw': 'power_kw',
                    'doors': 'doors',
                    'vehicle_type': 'vehicle_type',
                    'body_type': 'body_type',
                    'fuel_type': 'fuel_type',
                    'color': 'color',
                    'branch': 'branch__name',  # Sort by branch name
                    'accident_vehicle': 'accident_vehicle',
                    'damage_type_filter':'damage_type_filter',
                    'id': 'id',
                }

                actual_sort_field = sort_field_mapping.get(sort_field)
                if actual_sort_field:
                    if sort_order == 'desc':
                        actual_sort_field = f'-{actual_sort_field}'
                    vehicles_queryset = vehicles_queryset.order_by(actual_sort_field)
                    filter_data['sort'] = sort_field
                    filter_data['order'] = sort_order
                else:
                    # Default sorting by internal_ID if invalid field
                    vehicles_queryset = vehicles_queryset.order_by('-internal_id')
            else:
                # Default sorting by ID if no sort specified
                vehicles_queryset = vehicles_queryset.order_by('-internal_id')

            # Get all branches for the business
            branches = Branch.objects.filter(business=user.business)

            # Paginate vehicles - default 20 per page
            page = request.GET.get('page', 1)
            paginator = Paginator(vehicles_queryset, 20)
            try:
                vehicles_page = paginator.page(page)
            except PageNotAnInteger:
                vehicles_page = paginator.page(1)
            except EmptyPage:
                vehicles_page = paginator.page(paginator.num_pages)

            # Fetch dynamic choices from database models
            business = request.user.business
            manufacturer_choices = [(m.id, m.name) for m in Manufacturer.objects.filter(business=business, is_active=True)]
            vehicle_type_choices = [(vt.id, vt.name) for vt in VehicleType.objects.filter(business=business, is_active=True)]
            body_type_choices = [(bt.id, bt.name) for bt in BodyType.objects.filter(business=business, is_active=True)]
            fuel_type_choices = [(ft.id, ft.name) for ft in FuelType.objects.filter(business=business, is_active=True)]
            color_choices = [(c.id, c.name) for c in Color.objects.filter(business=business, is_active=True)]
            doors_choices = [(d.id, d.name) for d in DoorsChoice.objects.filter(business=business, is_active=True)]
            damage_type_choices = [(dt.id, dt.name) for dt in DamageType.objects.filter(business=business, is_active=True)]

            return render(request, 'vehicles.html', {

                'net_total_vehicle_revenue' : Transaction.get_net_total_revenue_for_vehicle_queryset(vehicles_queryset),
                'net_total_vehicle_expenses' :  Transaction.get_net_total_expenses_for_vehicle_queryset(vehicles_queryset),
                'net_vehicle_difference' : Transaction.get_net_difference_for_vehicle_queryset(vehicles_queryset),

                'tax_total_vehicle_revenue': Transaction.get_tax_total_revenue_for_vehicle_queryset(vehicles_queryset),
                'tax_total_vehicle_expenses': Transaction.get_tax_total_expenses_for_vehicle_queryset(vehicles_queryset),
                'tax_vehicle_difference': Transaction.get_tax_difference_for_vehicle_queryset(vehicles_queryset),

                'gross_total_vehicle_revenue': Transaction.get_total_revenue_for_vehicle_queryset(vehicles_queryset),
                'gross_total_vehicle_expenses': Transaction.get_total_expenses_for_vehicle_queryset(vehicles_queryset),
                'gross_vehicle_difference': Transaction.get_net_profit_for_vehicle_queryset(vehicles_queryset),


                'user': user,
                'vehicles': vehicles_page,
                'paginator': paginator,
                'page_obj': vehicles_page,
                'total_count' : vehicles_queryset.count(),
                'branches': branches,
                'filter_data': filter_data,
                'status_choices': Vehicle.STATUS_CHOICES,
                'manufacturer_choices': manufacturer_choices,
                'vehicle_type_choices': vehicle_type_choices,
                'body_type_choices': body_type_choices,
                'fuel_type_choices': fuel_type_choices,
                'color_choices': color_choices,
                'doors_choices': doors_choices,
                'damage_type_choices': damage_type_choices,
            })
        else:
            messages.error(request, "Forbidden: You don't have access to this page.")
            return redirect('vehicles', business_name=request.user.business.name)
    else:
        messages.error(request, "Unauthorized: You are not logged in, please log in.")
        return redirect(reverse('user-login'))
def add_new_vehicle(request, business_name):
    if request.user.is_authenticated:
        if request.user.business.name == business_name:
            # Fetch dynamic choices from database models
            business = request.user.business
            fuel_choices = [(ft.id, ft.name) for ft in FuelType.objects.filter(business=business, is_active=True)]
            manufacturer_choices = [(m.id, m.name) for m in Manufacturer.objects.filter(business=business, is_active=True)]
            vehicle_type_choices = [(vt.id, vt.name) for vt in VehicleType.objects.filter(business=business, is_active=True)]
            body_type_choices = [(bt.id, bt.name) for bt in BodyType.objects.filter(business=business, is_active=True)]
            color_choices = [(c.id, c.name) for c in Color.objects.filter(business=business, is_active=True)]
            doors_choices = [(d.id, d.name) for d in DoorsChoice.objects.filter(business=business, is_active=True)]
            payment_method_choices = [(pm.id, pm.name) for pm in PaymentMethod.objects.filter(business=business, is_active=True)]
            damage_type_choices = [(dt.id, dt.name) for dt in DamageType.objects.filter(business=business, is_active=True)]
            tax_percentage_choices = [(tp.id, str(tp), float(tp.percentage)) for tp in TaxPercentage.objects.filter(business=business, is_active=True)]

            manufacturer_models = {}


            empty_mandatory_fields_errors = {}

            context = {
                'fuel_choices': fuel_choices,
                'manufacturer_choices': manufacturer_choices,
                'vehicle_type_choices': vehicle_type_choices,
                'body_type_choices': body_type_choices,
                'color_choices': color_choices,
                'damage_type_choices' : damage_type_choices,
                'doors_choices': doors_choices,
                # 'license_plate_type_choices': license_plate_type_choices,
                'payment_method_choices': payment_method_choices,
                'tax_percentage_choices': tax_percentage_choices,
                # 'status_choices': status_choices,
                'year_choices': Vehicle.get_year_choices(),
                'branch_choices': [(branch.id, branch.name) for branch in request.user.business.business_branches.filter(is_active=True)],
                'legal_entity_choices': [(entity.id, str(entity)) for entity in LegalEntity.objects.filter(business=request.user.business)],

                'empty_mandatory_fields_errors': empty_mandatory_fields_errors,

                'manufacturer_models': manufacturer_models,

                'user': request.user,

                'first_render': True
                # ... other context
            }
            if request.method == "POST":
                vehicle_document = request.FILES.get('vehicle_document')
                empty_mandatory_fields_errors = {}

                # Modify filename with timestamp if image exists
                if vehicle_document:
                    if vehicle_document.name.lower().endswith((".jpeg", ".jpg", ".png", ".gif")):
                        # Get the original filename
                        original_filename = vehicle_document.name
                        # Create new filename with timestamp
                        new_filename = modify_filename_with_timestamp(original_filename)
                        # Update the file's name attribute
                        vehicle_document.name = new_filename
                    else:
                        messages.error(request, "Invalid file type for vehicle document. Please upload an image file (jpeg, jpg, png, gif).")
                        empty_mandatory_fields_errors["vehicle_document"] = "Invalid file type. only .jpeg, .jpg, .png, .gif are allowed"

                # Current information
                branch_id = request.POST.get('branch', '').strip()
                if branch_id:
                    branch= Branch.objects.get(id=branch_id)
                else:
                    branch = None

                # status = request.POST.get('status', '').strip()

                # Vehicle Details
                vehicle_type = request.POST.get('vehicle_type', '').strip()
                body_type = request.POST.get('body_type', '').strip()
                manufacturer = request.POST.get('manufacturer', '').strip()
                manufacturer_model = request.POST.get('manufacturer_model', '').strip()
                color = request.POST.get('color', '').strip()

                doors = request.POST.get('doors', '').strip()
                fuel_type = request.POST.get('fuel_type', '').strip()
                power_kw = request.POST.get('power_kw', '').strip()

                # Usage details
                damage_type = request.POST.get('damage_type', '').strip()
                # accident_vehicle = request.POST.get('accident_vehicle') == 'on'  # Checkbox returns 'on' if checked
                first_registration_date = request.POST.get('first_registration_date', '').strip()
                year_of_construction = request.POST.get('year_of_construction', '').strip()
                kilometer = request.POST.get('kilometer', '').strip()

                # Official details
                chassis_number = request.POST.get('chassis_number', '').strip()
                motor_vehicle_registration_number = request.POST.get('motor_vehicle_registration_number', '').strip()
                official_license_plate = request.POST.get('official_license_plate', '').strip()

                # Purchase details
                buy_price = request.POST.get('buy_price', '').strip()

                # Get buy_tax FK ID (from TaxPercentage dropdown)
                buy_tax_id = request.POST.get('buy_tax', '').strip()
                buy_tax_id = int(buy_tax_id) if buy_tax_id else None


                buy_date = request.POST.get('buy_date', '').strip()
                buy_delivery_collection_date = request.POST.get('buy_delivery_collection_date', '').strip()
                if not buy_delivery_collection_date:
                    buy_delivery_collection_date = None
                buy_payment_method = request.POST.get('buy_payment_method', '').strip()

                # Seller details
                seller_id = request.POST.get('seller_id', '').strip()

                # additional information
                description = request.POST.get('description', '').strip()
                internal_comments = request.POST.get('internal_comments', '').strip()

                # Clear any old session data first
                if 'temp_vehicle_document' in request.session:
                    # Clean up old temp file
                    try:
                        os.unlink(request.session['temp_vehicle_document'])
                    except:
                        pass
                    del request.session['temp_vehicle_document']

                if 'temp_vehicle_document_name' in request.session:
                    del request.session['temp_vehicle_document_name']


                motor_vehicle_registration_number_formatted = motor_vehicle_registration_number.replace(' ', '').replace('-', '').upper() if motor_vehicle_registration_number else ''
                official_license_plate_formatted = official_license_plate.replace(' ', '').replace('-', '').upper() if official_license_plate else ''

                # If file exists but other validation fails, store it temporarily
                if vehicle_document:
                    # Save to temporary location
                    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(vehicle_document.name)[1])
                    for chunk in vehicle_document.chunks():
                        temp_file.write(chunk)
                    temp_file.close()

                    # Store temp file path in session
                    request.session['temp_vehicle_document'] = temp_file.name
                    request.session['temp_vehicle_document_name'] = vehicle_document.name

                if chassis_number:
                    chassis_number_valid, chassis_error = validate_chassis_number(chassis_number)
                    if not chassis_number_valid:
                        empty_mandatory_fields_errors["chassis_number"] = chassis_error

                if motor_vehicle_registration_number_formatted:
                    motor_registration_valid, motor_error = validate_motor_vehicle_registration(
                        motor_vehicle_registration_number_formatted)
                    if not motor_registration_valid:
                        empty_mandatory_fields_errors["motor_vehicle_registration_number"] = motor_error

                if official_license_plate_formatted:
                    license_plate_valid, license_error = validate_license_plate(official_license_plate_formatted)
                    if not license_plate_valid:
                        empty_mandatory_fields_errors["official_license_plate"] = license_error


                # File input (if you add a name attribute to the file input)
                # uploaded_file = request.FILES.get('uploaded_file')  # Files are accessed via request.FILES, not request.POST
                # Define mandatory fields and their error messages
                mandatory_fields = {
                    'branch': 'Branch cannot be empty',
                    # 'status': 'Status cannot be empty',
                    'vehicle_type': 'Vehicle type cannot be empty',
                    'body_type': 'Body type cannot be empty',
                    'manufacturer': 'Make cannot be empty',
                    'manufacturer_model': 'Model cannot be empty',
                    'damage_type' : 'Damage type cannot be empty',
                    'color': 'Color cannot be empty',
                    'doors': 'Doors cannot be empty',
                    'fuel_type': 'Fuel type cannot be empty',
                    'power_kw': 'Power (KW) cannot be empty',
                    'first_registration_date': 'First registration date cannot be empty',
                    'year_of_construction': 'Year of construction cannot be empty',
                    'kilometer': 'Kilometer cannot be empty',
                    'chassis_number': 'Chassis number cannot be empty',
                    'motor_vehicle_registration_number': 'Motor vehicle registration number cannot be empty',
                    'official_license_plate': 'Official license plate cannot be empty',
                    'buy_price': 'Purchase price cannot be empty',
                    # 'buy_price_taxes': 'Purchase price taxes cannot be empty',
                    'buy_date': 'Purchase date cannot be empty',
                    # 'buy_delivery_collection_date': 'Purchase delivery/collection date cannot be empty',
                    'buy_payment_method': 'Purchase payment method cannot be empty',
                    'seller_id': 'Seller cannot be empty',
                    # 'vehicle_document': 'Vehicle document cannot be empty',
                    # 'file_uploaded': False,  # Add this
                    # 'uploaded_filename': None,  # Add this
                }


                # Check for empty fields

                empty_field_exists = False
                for field_name, error_message in mandatory_fields.items():
                    field_value = locals().get(field_name, '')  # Get the variable value
                    if not field_value:
                        empty_field_exists = True
                        empty_mandatory_fields_errors[field_name] = error_message
                if empty_field_exists:
                    messages.error(request, "Mandatory fields cannot be empty")

                # Check if there are any errors
                if empty_mandatory_fields_errors:
                    # Handle errors
                    context["empty_mandatory_fields_errors"] = empty_mandatory_fields_errors
                    context["file_uploaded"] = bool(vehicle_document)
                    context["uploaded_filename"] = vehicle_document.name if vehicle_document else None
                    context["first_render"] = False
                    return render(request, 'add_new_vehicle.html', context)
                else:
                    if 'temp_vehicle_document' in request.session:
                        try:
                            os.unlink(request.session['temp_vehicle_document'])
                        except:
                            pass
                        del request.session['temp_vehicle_document']
                    if 'temp_vehicle_document_name' in request.session:
                        del request.session['temp_vehicle_document_name']

                    try:

                        Vehicle.objects.create(
                            # Current information
                            branch=branch,
                            status="purchased",

                            # Vehicle Details
                            vehicle_type=vehicle_type,
                            body_type=body_type,
                            manufacturer=manufacturer,
                            manufacturer_model=manufacturer_model,
                            color=color,
                            damage_type=damage_type,
                            doors=doors,
                            fuel_type=fuel_type,
                            power_kw=power_kw,

                            # Usage details
                            # accident_vehicle=accident_vehicle,
                            first_registration_date=first_registration_date,
                            year_of_construction=year_of_construction,
                            kilometer=kilometer,

                            # Official details
                            chassis_number=chassis_number,
                            motor_vehicle_registration_number=motor_vehicle_registration_number_formatted,
                            official_license_plate=official_license_plate_formatted,

                            # Purchase details
                            buy_price=buy_price,
                            buy_tax_id=buy_tax_id,
                            buy_date=buy_date,
                            buy_delivery_collection_date=buy_delivery_collection_date,
                            buy_payment_method=buy_payment_method,

                            # Seller details
                            seller=LegalEntity.objects.get(id=seller_id) if seller_id else None,

                            # System fields
                            business=request.user.business,

                            # additional fields
                            description = description,
                            internal_comments = internal_comments,
                            image = vehicle_document,
                        )


                        messages.success(request, 'New vehicle added successfully!')
                        return redirect('vehicles', business_name=business_name)
                    except Exception as e:
                        # Handle any database constraint errors
                        if 'UNIQUE constraint failed' in str(e):
                            messages.error(request, 'A vehicle with similar details already exists. Please check the unique identifiers (chassis number, registration number, or license plate).')
                        else:
                            messages.error(request, f'Error adding vehicle: {str(e)}')
                        context["first_render"] = False
                        return render(request, 'add_new_vehicle.html', context)
            else:
                # GET request - clear any old session data
                if 'temp_vehicle_document' in request.session:
                    try:
                        os.unlink(request.session['temp_vehicle_document'])
                    except:
                        pass
                    del request.session['temp_vehicle_document']
                if 'temp_vehicle_document_name' in request.session:
                    del request.session['temp_vehicle_document_name']

                return render(request, "add_new_vehicle.html", context)
        else:
            messages.error(request, "Forbidden: you dont have permission to access this page.")
            return redirect('vehicles', business_name=request.user.business.name)
    else:
        messages.error(request, "Unauthorized: You are not logged in, please log in.")
        return redirect(reverse('user-login'))
def vehicle_details(request, business_name, vehicle_internal_id):
    """Display and handle vehicle details editing"""
    if request.user.is_authenticated:
        if request.user.business.name == business_name:
            vehicle_id = Vehicle.objects.get(internal_id=vehicle_internal_id, business=request.user.business).id
            try:
                vehicle = Vehicle.objects.get(id=vehicle_id, business=request.user.business)
                vehicle_transactions = vehicle.vehicle_transactions.all().order_by('-internal_id')
                # Prev/Next navigation: compute previous and next active vehicle internal IDs
                try:
                    # Get active vehicle internal IDs in descending order (newest first)
                    active_qs = Vehicle.objects.filter(business=request.user.business).exclude(status='inactive').order_by('-internal_id')
                    # Exclude vehicles with null internal_id and coerce to int for robust comparisons/sorting
                    active_ids_desc = [int(x) for x in active_qs.values_list('internal_id', flat=True) if x is not None]  # ints, descending

                    prev_vehicle_internal_id = None
                    next_vehicle_internal_id = None

                    # Normalize current id to int if possible
                    try:
                        cur = int(vehicle_internal_id)
                    except Exception:
                        cur = None

                    if cur is not None and active_ids_desc:
                        # If current exists among active vehicles, use its neighbors directly
                        if cur in active_ids_desc:
                            idx = active_ids_desc.index(cur)
                            if idx > 0:
                                prev_vehicle_internal_id = int(active_ids_desc[idx - 1])
                            if idx < len(active_ids_desc) - 1:
                                next_vehicle_internal_id = int(active_ids_desc[idx + 1])
                        else:
                            # Current is not active (or not in active list) -- find the insertion point
                            # We'll compute neighbors by inserting cur into a copy and keeping descending order
                            tmp = active_ids_desc.copy()
                            tmp.append(cur)
                            tmp = sorted(tmp, reverse=True)
                            idx = tmp.index(cur)
                            if idx > 0:
                                prev_vehicle_internal_id = int(tmp[idx - 1])
                            if idx < len(tmp) - 1:
                                next_vehicle_internal_id = int(tmp[idx + 1])
                    else:
                        prev_vehicle_internal_id = None
                        next_vehicle_internal_id = None
                except Exception:
                    prev_vehicle_internal_id = None
                    next_vehicle_internal_id = None

            except Vehicle.DoesNotExist:
                messages.error(request, "Vehicle not found.")
                return redirect('vehicles', business_name=business_name)

            # Fetch dynamic choices from database models
            business = request.user.business
            fuel_choices = [(ft.id, ft.name) for ft in FuelType.objects.filter(business=business, is_active=True)]
            manufacturer_choices = [(m.id, m.name) for m in Make.objects.filter(business=business, is_active=True)]
            vehicle_type_choices = [(vt.id, vt.name) for vt in VehicleType.objects.filter(business=business, is_active=True)]
            body_type_choices = [(bt.id, bt.name) for bt in BodyType.objects.filter(business=business, is_active=True)]
            color_choices = [(c.id, c.name) for c in Color.objects.filter(business=business, is_active=True)]
            doors_choices = [(d.id, d.name) for d in DoorsChoice.objects.filter(business=business, is_active=True)]
            payment_method_choices = [(pm.id, pm.name) for pm in PaymentMethod.objects.filter(business=business, is_active=True)]
            damage_type_choices = [(dt.id, dt.name) for dt in DamageType.objects.filter(business=business, is_active=True)]
            tax_percentage_choices = [(tp.id, str(tp), float(tp.percentage)) for tp in TaxPercentage.objects.filter(business=business, is_active=True)]
            status_choices = Vehicle.STATUS_CHOICES

            manufacturer_models = {}

            empty_mandatory_fields_errors = {}

            context = {
                'vehicle': vehicle,
                'vehicle_transactions': vehicle_transactions,
                'fuel_choices': fuel_choices,
                'manufacturer_choices': manufacturer_choices,
                'vehicle_type_choices': vehicle_type_choices,
                'body_type_choices': body_type_choices,
                'color_choices': color_choices,
                'damage_type_choices' : damage_type_choices,
                'doors_choices': doors_choices,
                'payment_method_choices': payment_method_choices,
                'tax_percentage_choices': tax_percentage_choices,
                'status_choices': status_choices,
                'year_choices': Vehicle.get_year_choices(),
                'branch_choices': [(branch.id, branch.name) for branch in
                                   request.user.business.business_branches.filter(is_active=True)],
                'legal_entity_choices': [(entity.id, str(entity)) for entity in
                                   LegalEntity.objects.filter(business=request.user.business)],

                'empty_mandatory_fields_errors': empty_mandatory_fields_errors,

                'manufacturer_models': manufacturer_models,

                'user': request.user,

                'first_render': True,
                # Prev/next navigation ids for vehicle details page
                'prev_vehicle_internal_id': prev_vehicle_internal_id,
                'next_vehicle_internal_id': next_vehicle_internal_id,
            }

            if request.method == "POST":
                vehicle_document = request.FILES.get('vehicle_document')
                empty_mandatory_fields_errors = {}
                # Modify filename with timestamp if image exists
                if vehicle_document:
                    if vehicle_document.name.lower().endswith((".jpeg", ".jpg", ".png", ".gif")):
                        # Get the original filename
                        original_filename = vehicle_document.name
                        # Create new filename with timestamp
                        new_filename = modify_filename_with_timestamp(original_filename)
                        # Update the file's name attribute
                        vehicle_document.name = new_filename
                    else:
                        messages.error(request, "Invalid file type for vehicle document. Please upload an image file (jpeg, jpg, png, gif).")
                        empty_mandatory_fields_errors["vehicle_document"] = "Invalid file type. only .jpeg, .jpg, .png, .gif are allowed"


                # Current information
                branch_id = request.POST.get('branch', '').strip()
                if branch_id:
                    branch = Branch.objects.get(id=branch_id)
                else:
                    branch = None

                status = request.POST.get('status', '').strip()

                # Vehicle Details
                vehicle_type = request.POST.get('vehicle_type', '').strip()
                body_type = request.POST.get('body_type', '').strip()
                manufacturer = request.POST.get('manufacturer', '').strip()
                manufacturer_model = request.POST.get('manufacturer_model', '').strip()
                color = request.POST.get('color', '').strip()
                damage_type = request.POST.get('damage_type', '').strip()
                doors = request.POST.get('doors', '').strip()
                fuel_type = request.POST.get('fuel_type', '').strip()
                power_kw = request.POST.get('power_kw', '').strip()

                # Usage details
                # accident_vehicle = request.POST.get('accident_vehicle') == 'on'  # Checkbox returns 'on' if checked
                first_registration_date = request.POST.get('first_registration_date', '').strip()
                year_of_construction = request.POST.get('year_of_construction', '').strip()
                kilometer = request.POST.get('kilometer', '').strip()

                # Official details
                chassis_number = request.POST.get('chassis_number', '').strip()
                motor_vehicle_registration_number = request.POST.get('motor_vehicle_registration_number', '').strip()
                official_license_plate = request.POST.get('official_license_plate', '').strip()

                # Purchase details
                buy_price = request.POST.get('buy_price', '').strip()
                buy_tax_id = request.POST.get('buy_tax', '').strip()
                buy_tax = None
                if buy_tax_id:
                    try:
                        buy_tax = TaxPercentage.objects.get(id=buy_tax_id, business=request.user.business)
                    except TaxPercentage.DoesNotExist:
                        buy_tax = None

                buy_date = request.POST.get('buy_date', '').strip()
                buy_delivery_collection_date = request.POST.get('buy_delivery_collection_date', '').strip()
                if not buy_delivery_collection_date:
                    buy_delivery_collection_date = None
                buy_payment_method = request.POST.get('buy_payment_method', '').strip()

                # Sale details (only process if status is ready_for_sale)
                sale_price = request.POST.get('sale_price', '').strip()
                sale_tax_id = request.POST.get('sale_tax', '').strip()
                sale_tax = None
                if sale_tax_id:
                    try:
                        sale_tax = TaxPercentage.objects.get(id=sale_tax_id, business=request.user.business)
                    except TaxPercentage.DoesNotExist:
                        sale_tax = None
                sale_commission = request.POST.get('sale_commission', '').strip()
                sale_date = request.POST.get('sale_date', '').strip()
                sale_delivery_collection_date = request.POST.get('sale_delivery_collection_date', '').strip()
                if not sale_delivery_collection_date:
                    sale_delivery_collection_date = None
                sale_payment_method = request.POST.get('sale_payment_method', '').strip()

                # Seller details
                seller_id = request.POST.get('seller_id', '').strip()

                # Buyer details
                buyer_id = request.POST.get('buyer_id', '').strip()

                # additional information
                description = request.POST.get('description', '').strip()
                internal_comments = request.POST.get('internal_comments', '').strip()



                motor_vehicle_registration_number_formatted = motor_vehicle_registration_number.replace(' ', '').replace('-', '').upper() if motor_vehicle_registration_number else ''
                official_license_plate_formatted = official_license_plate.replace(' ', '').replace('-', '').upper() if official_license_plate else ''

                if chassis_number:
                    chassis_number_valid, chassis_error = validate_chassis_number_edit(chassis_number, vehicle)
                    if not chassis_number_valid:
                        empty_mandatory_fields_errors["chassis_number"] = chassis_error

                if motor_vehicle_registration_number_formatted:
                    motor_registration_valid, motor_error = validate_motor_vehicle_registration_edit(
                        motor_vehicle_registration_number_formatted, vehicle)
                    if not motor_registration_valid:
                        empty_mandatory_fields_errors["motor_vehicle_registration_number"] = motor_error

                if official_license_plate_formatted:
                    license_plate_valid, license_error = validate_license_plate_edit(official_license_plate_formatted,
                                                                                     vehicle)
                    if not license_plate_valid:
                        empty_mandatory_fields_errors["official_license_plate"] = license_error

                # Define mandatory fields and their error messages
                mandatory_fields = {
                    'branch': 'Branch cannot be empty',
                    'status': 'Status cannot be empty',
                    'vehicle_type': 'Vehicle type cannot be empty',
                    'body_type': 'Body type cannot be empty',
                    'manufacturer': 'Make cannot be empty',
                    'manufacturer_model': 'Model cannot be empty',
                    'color': 'Color cannot be empty',
                    'damage_type' : 'Damage type cannot be empty',
                    'doors': 'Doors cannot be empty',
                    'fuel_type': 'Fuel type cannot be empty',
                    'power_kw': 'Power (KW) cannot be empty',
                    'first_registration_date': 'First registration date cannot be empty',
                    'year_of_construction': 'Year of construction cannot be empty',
                    'kilometer': 'Kilometer cannot be empty',
                    'chassis_number': 'Chassis number cannot be empty',
                    'motor_vehicle_registration_number': 'Motor vehicle registration number cannot be empty',
                    'official_license_plate': 'Official license plate cannot be empty',
                    'buy_price': 'Purchase price cannot be empty',
                    # 'buy_price_taxes': 'Purchase price taxes cannot be empty',
                    'buy_date': 'Purchase date cannot be empty',
                    # 'buy_delivery_collection_date': 'Purchase delivery/collection date cannot be empty',
                    'buy_payment_method': 'Purchase payment method cannot be empty',
                    'seller_id': 'Seller cannot be empty',
                    # 'vehicle_document': 'Vehicle document cannot be empty',
                    # 'file_uploaded': False,  # Add this
                    # 'uploaded_filename': None,  # Add this
                }

                # Add sale fields to mandatory validation if status is ready_for_sale AND sale fields have values
                # This allows users to change status to ready_for_sale without immediately requiring sale fields
                if status == "ready_for_sale" or status == "reserved":
                    # Only require sale fields if at least one sale field has a value (indicating user is filling sale data)
                    sale_fields_with_values = any([
                        sale_price, sale_date,
                        sale_delivery_collection_date, sale_payment_method, buyer_id
                    ])

                    if sale_fields_with_values:
                        sale_mandatory_fields = {
                            'sale_price': 'Sale price cannot be empty',
                            # 'sale_price_taxes': 'Sale price taxes cannot be empty',
                            'sale_date': 'Sale date cannot be empty',
                            # 'sale_delivery_collection_date': 'Sale delivery/collection date cannot be empty',
                            'sale_payment_method': 'Sale payment method cannot be empty',
                            'buyer_id': 'Buyer cannot be empty',
                        }
                        mandatory_fields.update(sale_mandatory_fields)

                # If status is "sold", ALL sale fields are mandatory
                if status == "sold":
                    sale_mandatory_fields = {
                        'sale_price': 'Sale price cannot be empty',
                        # 'sale_price_taxes': 'Sale price taxes cannot be empty',
                        'sale_date': 'Sale date cannot be empty',
                        # 'sale_delivery_collection_date': 'Sale delivery/collection date cannot be empty',
                        'sale_payment_method': 'Sale payment method cannot be empty',
                        'buyer_id': 'Buyer cannot be empty',
                    }
                    mandatory_fields.update(sale_mandatory_fields)

                # Check for empty fields
                empty_field_exists = False
                for field_name, error_message in mandatory_fields.items():
                    field_value = locals().get(field_name, '')  # Get the variable value
                    if not field_value:
                        empty_field_exists = True
                        empty_mandatory_fields_errors[field_name] = error_message
                if empty_field_exists:
                    messages.error(request, "Mandatory fields cannot be empty")

                # Check uniqueness for chassis number, motor vehicle registration, and license plate
                # Only check if the values are different from the current vehicle's values
                # Normalize values for comparison (handle None values and formatting differences)

                # Chassis number comparison
                current_chassis = vehicle.chassis_number or ""
                if chassis_number and chassis_number.strip() != current_chassis.strip():
                    existing_vehicle = Vehicle.objects.exclude(status="inactive").filter(
                        business=request.user.business,
                        chassis_number=chassis_number,
                    ).exclude(id=vehicle_id).first()
                    if existing_vehicle:
                        empty_mandatory_fields_errors[
                            "chassis_number"] = f"Chassis number '{chassis_number}' already exists for another active vehicle"

                # Motor vehicle registration comparison
                current_motor_reg = vehicle.motor_vehicle_registration_number or ""
                current_motor_reg_formatted = current_motor_reg.replace(' ', '').replace('-', '').upper()
                if motor_vehicle_registration_number_formatted and motor_vehicle_registration_number_formatted != current_motor_reg_formatted:
                    existing_vehicle = Vehicle.objects.exclude(status="inactive").filter(
                        business=request.user.business,
                        motor_vehicle_registration_number=motor_vehicle_registration_number_formatted,
                    ).exclude(id=vehicle_id).first()
                    if existing_vehicle:
                        empty_mandatory_fields_errors[
                            "motor_vehicle_registration_number"] = f"Motor vehicle registration number '{motor_vehicle_registration_number_formatted}' already exists for another active vehicle"

                # Official license plate comparison
                current_license = vehicle.official_license_plate or ""
                current_license_formatted = current_license.replace(' ', '').replace('-', '').upper()
                if official_license_plate_formatted and official_license_plate_formatted != current_license_formatted:
                    existing_vehicle = Vehicle.objects.exclude(status="inactive").filter(
                        business=request.user.business,
                        official_license_plate=official_license_plate_formatted,
                    ).exclude(id=vehicle_id).first()
                    if existing_vehicle:
                        empty_mandatory_fields_errors[
                            "official_license_plate"] = f"Official license plate '{official_license_plate_formatted}' already exists for another active vehicle"

                # Check if there are any errors
                if empty_mandatory_fields_errors:
                    # Handle errors
                    context["empty_mandatory_fields_errors"] = empty_mandatory_fields_errors
                    context["file_uploaded"] = bool(vehicle_document)
                    context["uploaded_filename"] = vehicle_document.name if vehicle_document else None
                    context["first_render"] = False
                    return render(request, 'vehicle_details.html', context)
                else:
                    # Update vehicle fields
                    vehicle.status = status
                    vehicle.description = description
                    vehicle.internal_comments = internal_comments
                    vehicle.branch = branch

                    # Official details
                    vehicle.chassis_number = chassis_number
                    vehicle.motor_vehicle_registration_number = motor_vehicle_registration_number_formatted
                    vehicle.official_license_plate = official_license_plate_formatted

                    # Usage details
                    vehicle.damage_type = damage_type
                    # vehicle.accident_vehicle = accident_vehicle
                    vehicle.first_registration_date = first_registration_date or None
                    vehicle.year_of_construction = year_of_construction or None
                    vehicle.kilometer = kilometer or None

                    # Buy details
                    vehicle.buy_price = buy_price or None
                    vehicle.buy_tax = buy_tax
                    vehicle.buy_date = buy_date or None
                    vehicle.buy_delivery_collection_date = buy_delivery_collection_date or None
                    vehicle.buy_payment_method = buy_payment_method

                    # Seller details
                    vehicle.seller = LegalEntity.objects.get(id=seller_id) if seller_id else None

                    # Buyer details
                    vehicle.buyer = LegalEntity.objects.get(id=buyer_id) if buyer_id else None

                    # Sale details
                    vehicle.sale_price = sale_price or None
                    vehicle.sale_tax = sale_tax
                    vehicle.sale_commission = sale_commission or None
                    vehicle.sale_date = sale_date or None
                    vehicle.sale_delivery_collection_date = sale_delivery_collection_date or None
                    vehicle.sale_payment_method = sale_payment_method

                    # General details
                    vehicle.vehicle_type = vehicle_type
                    vehicle.body_type = body_type
                    vehicle.manufacturer = manufacturer
                    vehicle.manufacturer_model = manufacturer_model
                    vehicle.color = color
                    vehicle.doors = doors
                    vehicle.fuel_type = fuel_type
                    vehicle.power_kw = power_kw or None

                    # Handle image upload
                    if vehicle_document:
                        vehicle.image = vehicle_document

                    try:
                        vehicle.save()
                        messages.success(request, "Vehicle details updated successfully.")
                        return redirect('vehicle-details', business_name=business_name,
                                        vehicle_internal_id=vehicle_internal_id)
                    except Exception as e:
                        messages.error(request, f"Error updating vehicle: {str(e)}")
                        context["empty_mandatory_fields_errors"] = {"general": "Database error occurred"}
                        context["first_render"] = False
                        return render(request, 'vehicle_details.html', context)
            else:
                # GET request - populate manufacturer_models if manufacturer is already set
                if vehicle.manufacturer:
                    manufacturer_models = get_manufacturer_models_for_manufacturer(vehicle.manufacturer)
                    context["manufacturer_models"] = manufacturer_models

            return render(request, 'vehicle_details.html', context)
        else:
            messages.error(request, "Forbidden: You dont have access to this page")
            return redirect('vehicles', business_name=request.user.business.name)
    else:
        messages.error(request, "Unauthorized: You are not logged in, please log in.")
        return redirect(reverse('user-login'))

def delete_vehicle(request, business_name, vehicle_internal_id):
    """Delete (deactivate) a vehicle"""
    if request.user.is_authenticated:
        if request.user.business.name == business_name:
            vehicle_id = Vehicle.objects.get(internal_id=vehicle_internal_id, business=request.user.business).id
            if request.method == 'POST':
                try:
                    vehicle = Vehicle.objects.get(id=vehicle_id, business=request.user.business)
                    vehicle.status = "inactive"
                    vehicle.save()
                    messages.success(request,
                                     f"Vehicle {vehicle.manufacturer} {vehicle.manufacturer_model} has been deleted (deactivated).")
                    return redirect('vehicles', business_name=business_name)
                except Vehicle.DoesNotExist:
                    messages.error(request, "Vehicle not found.")
                    return redirect('vehicles', business_name=business_name)
            else:
                messages.error(request, "Invalid request method.")
                return redirect('vehicles', business_name=business_name)
        else:
            messages.error(request, "Forbidden: You dont have access to perform this action")
            return redirect('vehicles', business_name=request.user.business.name)
    else:
        messages.error(request, "Unauthorized: You are not logged in, please log in.")
        return redirect(reverse('user-login'))
def activate_vehicle(request, business_name, vehicle_internal_id):
    """Activate a vehicle - check for unique constraint violations"""

    if request.user.is_authenticated:
        if request.user.business.name == business_name:
            vehicle_id = Vehicle.objects.get(internal_id=vehicle_internal_id, business=request.user.business).id
            if request.method == 'POST':
                try:
                    vehicle = Vehicle.objects.get(id=vehicle_id, business=request.user.business)

                    # Only allow activation of inactive vehicles
                    if vehicle.status != "inactive":
                        messages.error(request, "Only inactive vehicles can be activated.")
                        return redirect('vehicles', business_name=business_name)

                    # Check for unique constraint violations on the three key attributes
                    errors = []

                    # Check chassis number uniqueness (if not empty)
                    if vehicle.chassis_number:
                        existing_vehicle = Vehicle.objects.filter(
                            business=request.user.business,
                            chassis_number=vehicle.chassis_number,
                            status__in=["purchased", "ready_for_sale", "sold"]
                        ).exclude(id=vehicle_id).first()
                        if existing_vehicle:
                            errors.append(
                                f"Chassis number '{vehicle.chassis_number}' is already used by another active vehicle (ID: {existing_vehicle.id})")

                    # Check motor vehicle registration number uniqueness (if not empty)
                    if vehicle.motor_vehicle_registration_number:
                        existing_vehicle = Vehicle.objects.filter(
                            business=request.user.business,
                            motor_vehicle_registration_number=vehicle.motor_vehicle_registration_number,
                            status__in=["purchased", "ready_for_sale", "sold"]
                        ).exclude(id=vehicle_id).first()
                        if existing_vehicle:
                            errors.append(
                                f"Motor vehicle registration number '{vehicle.motor_vehicle_registration_number}' is already used by another active vehicle (ID: {existing_vehicle.id})")

                    # Check official license plate uniqueness (if not empty)
                    if vehicle.official_license_plate:
                        existing_vehicle = Vehicle.objects.filter(
                            business=request.user.business,
                            official_license_plate=vehicle.official_license_plate,
                            status__in=["purchased", "ready_for_sale", "sold"]
                        ).exclude(id=vehicle_id).first()
                        if existing_vehicle:
                            errors.append(
                                f"Official license plate '{vehicle.official_license_plate}' is already used by another active vehicle (ID: {existing_vehicle.id})")

                    # If there are errors, show them and don't activate
                    if errors:
                        for error in errors:
                            messages.error(request, error)
                        return redirect('vehicles', business_name=business_name)

                    # If no errors, activate the vehicle (set to purchased status)
                    vehicle.status = "purchased"
                    vehicle.save()
                    messages.success(request,
                                     f"Vehicle {vehicle.manufacturer} {vehicle.manufacturer_model} has been activated successfully.")
                    return redirect('vehicles', business_name=business_name)

                except Vehicle.DoesNotExist:
                    messages.error(request, "Vehicle not found.")
                    return redirect('vehicles', business_name=business_name)
            else:
                messages.error(request, "Invalid request method.")
                return redirect('vehicles', business_name=business_name)
        else:
            messages.error(request, "Forbidden: You dont have access to perform this action")
            return redirect('vehicles', business_name=request.user.business.name)
    else:
        messages.error(request, "Unauthorized: You are not logged in, please log in.")
        return redirect(reverse('user-login'))
        
####################################
#################Transactions###################
def transactions(request, business_name):
    if request.user.is_authenticated:
        if request.user.business.name == business_name:
            if request.user.transactions_access:
                user = request.user

                # Get all active transactions for this business
                transactions_queryset = Transaction.objects.filter(business=user.business)  # .exclude(status="inactive")

                net_total_revenue = Transaction.get_net_total_revenue_from_queryset(transactions_queryset)
                net_total_expenses = Transaction.get_net_total_expenses_from_queryset(transactions_queryset)
                net_difference = Transaction.get_net_difference_from_queryset(transactions_queryset)

                tax_total_revenue = Transaction.get_tax_total_revenue_from_queryset(transactions_queryset)
                tax_total_expenses = Transaction.get_tax_total_expenses_from_queryset(transactions_queryset)
                tax_difference = Transaction.get_tax_difference_from_queryset(transactions_queryset)

                gross_total_revenue = Transaction.get_gross_total_revenue_from_queryset(transactions_queryset)
                gross_total_expenses = Transaction.get_gross_total_expenses_from_queryset(transactions_queryset)
                gross_difference = Transaction.get_gross_difference_from_queryset(transactions_queryset)






                # Initialize filter values
                filter_data = {}
                empty_mandatory_fields_errors = {}
                if request.method == "POST":
                    transactions_file = request.FILES.get('transactions_file')
                    method = request.POST.get('method')
                    if not method:
                        empty_mandatory_fields_errors['method'] = 'This field cannot be empty'
                    if not transactions_file:
                        empty_mandatory_fields_errors['transactions_file'] = 'This field cannot be empty'
                    if not method or not transactions_file:
                        messages.error(request, 'please fill in required fields')
                        return render(request, 'transactions.html', {

                            'net_total_revenue': net_total_revenue,
                            'net_total_expenses': net_total_expenses,
                            'net_difference': net_difference,

                            'tax_total_revenue': tax_total_revenue,
                            'tax_total_expenses': tax_total_expenses,
                            'tax_difference': tax_difference,

                            'gross_total_revenue': gross_total_revenue,
                            'gross_total_expenses': gross_total_expenses,
                            'gross_difference': gross_difference,




                            'user': user,
                            'empty_mandatory_fields_errors': empty_mandatory_fields_errors,
                            'transactions': transactions_queryset,
                            'total_count': transactions_queryset.count(),
                            'filter_data': filter_data,
                            'status_choices': Transaction.STATUS_CHOICES,
                            'method_choices': Transaction.METHOD_CHOICES,
                            'category_choices': Transaction.CATEGORY_CHOICES,
                            'currency_choices': Transaction.CURRENCY_CHOICES,
                            # 'subcategory_choices': Transaction.SUBCATEGORY_CHOICES,
                        })
                    if transactions_file:
                        try:
                            csv_text = transactions_file.read().decode('utf-8')
                        except UnicodeDecodeError:
                            messages.error(request, "Please upload a valid utf-8 encoded .csv file.")
                            empty_mandatory_fields_errors['transactions_file'] = "Invalid file"
                            return render(request, 'transactions.html', {
                                'net_total_revenue': net_total_revenue,
                                'net_total_expenses': net_total_expenses,
                                'net_difference': net_difference,

                                'tax_total_revenue': tax_total_revenue,
                                'tax_total_expenses': tax_total_expenses,
                                'tax_difference': tax_difference,

                                'gross_total_revenue': gross_total_revenue,
                                'gross_total_expenses': gross_total_expenses,
                                'gross_difference': gross_difference,






                                'user': user,
                                'empty_mandatory_fields_errors': empty_mandatory_fields_errors,
                                'transactions': transactions_queryset,
                                'total_count': transactions_queryset.count(),
                                'filter_data': filter_data,
                                'status_choices': Transaction.STATUS_CHOICES,
                                'method_choices': Transaction.METHOD_CHOICES,
                                'category_choices': Transaction.CATEGORY_CHOICES,
                                'currency_choices': Transaction.CURRENCY_CHOICES,
                                # 'subcategory_choices': Transaction.SUBCATEGORY_CHOICES,
                            })
                        data_table = pandas.read_csv(io.StringIO(csv_text), sep=';')
                        data_table = data_table.iloc[::-1]
                        data_table = data_table.reset_index(drop=True)

                        existing_ids = set(Transaction.objects.values_list('datetime', flat=True))

                        # Iterate through rows and process
                        try:
                            for index, row in data_table.iterrows():
                                camt_tx_id = row['camtTxId']
                                amount_unprocessed = row['Betrag']

                                def process_currency_string(currency_str):
                                    try:
                                        # Extract number and determine sign
                                        match = re.search(r'([–\-])?\D*([\d,.]+\d)', currency_str)
                                        if not match:
                                            return Decimal('0')

                                        number_str = match.group(2).replace(',', '')
                                        return -Decimal(number_str) if match.group(1) else Decimal(number_str)
                                    except:
                                        return Decimal('0')

                                amount = process_currency_string(amount_unprocessed)

                                date = row['Buchungsdatum']
                                description = row['Verwendungszweck']
                                currency_label = row['Währungbetrag']

                                def get_currency_name(code):
                                    """Get currency name and optionally auto-create Currency FK record."""
                                    # First check legacy hardcoded choices for the name
                                    for name, curr_code in Transaction.CURRENCY_CHOICES:
                                        if curr_code == code:
                                            # Also ensure Currency FK exists
                                            Currency.objects.get_or_create(
                                                code=code,
                                                business=user.business,
                                                defaults={'name': name, 'is_active': True}
                                            )
                                            return name
                                    # If not found in hardcoded choices, create new Currency FK
                                    if code and str(code).strip():
                                        Currency.objects.get_or_create(
                                            code=code,
                                            business=user.business,
                                            defaults={'name': code, 'is_active': True}
                                        )
                                    return code  # return code if not found in hardcoded

                                currency = get_currency_name(currency_label)

                                foreign_sender = row['Remitterdivergent']
                                if foreign_sender and pandas.notna(foreign_sender) and str(foreign_sender).strip() != '':
                                    from_or_to = row['Remitterdivergent']
                                else:
                                    from_or_to = row['Name']



                                # Check if this camtTxId exists in the database
                                if camt_tx_id in existing_ids:
                                    transaction = Transaction.objects.get(datetime=camt_tx_id)
                                    transaction.datetime = camt_tx_id
                                    transaction.method = method
                                    transaction.amount = amount
                                    transaction.date = date
                                    transaction.description = description
                                    transaction.currency = currency
                                    transaction.from_or_to = from_or_to
                                    # transaction.status = "review_required"

                                    transaction.save()
                                else:
                                    # Properly indent the code inside the else block
                                    Transaction.objects.create(
                                        status="review_required",
                                        business=user.business,
                                        datetime=camt_tx_id,
                                        method=method,
                                        amount=amount,
                                        date=date,
                                        description=description,
                                        currency=currency,
                                        from_or_to=from_or_to,
                                        tax=0
                                    )
                        except KeyError:
                            messages.error(request, ".csv file is invalid. Please upload a valid extracted .csv file from StarMoney application for your account")
                            empty_mandatory_fields_errors['transactions_file'] = "Invalid file"
                            return render(request, 'transactions.html', {
                                'net_total_revenue': net_total_revenue,
                                'net_total_expenses': net_total_expenses,
                                'net_difference': net_difference,

                                'tax_total_revenue': tax_total_revenue,
                                'tax_total_expenses': tax_total_expenses,
                                'tax_difference': tax_difference,

                                'gross_total_revenue': gross_total_revenue,
                                'gross_total_expenses': gross_total_expenses,
                                'gross_difference': gross_difference,





                                'user': user,
                                'empty_mandatory_fields_errors': empty_mandatory_fields_errors,
                                'transactions': transactions_queryset,
                                'total_count': transactions_queryset.count(),
                                'filter_data': filter_data,
                                'status_choices': Transaction.STATUS_CHOICES,
                                'method_choices': Transaction.METHOD_CHOICES,
                                'category_choices': Transaction.CATEGORY_CHOICES,
                                'currency_choices': Transaction.CURRENCY_CHOICES,
                                # 'subcategory_choices': Transaction.SUBCATEGORY_CHOICES,
                            })
                        messages.success(request, 'Transaction data updated')


                if request.method == 'GET':
                    # Get filter parameters from URL
                    status_filter = request.GET.get('status', '')
                    category_filter = request.GET.get('category', '')
                    subcategory_filter = request.GET.get('subcategory', '')
                    internal_id_filter = request.GET.get('internal_id', '')
                    vehicle_filter = request.GET.get('vehicle', '')
                    method_filter = request.GET.get('method', '')

                    # Price filters
                    min_amount = request.GET.get('min_amount', '')
                    max_amount = request.GET.get('max_amount', '')


                    # Date filters
                    min_date = request.GET.get('min_date', '')
                    max_date = request.GET.get('max_date', '')

                    currency_filter = request.GET.get('currency', '')


                    # Apply filters
                    if status_filter:
                        transactions_queryset = transactions_queryset.filter(status=status_filter)
                        filter_data['status'] = status_filter
                    else:
                        transactions_queryset = transactions_queryset.exclude(status="inactive")
                    if category_filter:
                        transactions_queryset = transactions_queryset.filter(category=category_filter)
                        filter_data['category'] = category_filter

                    if subcategory_filter:
                        transactions_queryset = transactions_queryset.filter(subcategory__icontains=subcategory_filter)
                        filter_data['subcategory'] = subcategory_filter

                    if internal_id_filter:
                        transactions_queryset = transactions_queryset.filter(internal_id=internal_id_filter)
                        filter_data['internal_id'] = internal_id_filter

                    if vehicle_filter:
                        transactions_queryset = transactions_queryset.filter(vehicle=vehicle_filter)
                        filter_data['vehicle'] = vehicle_filter

                    if method_filter:
                        transactions_queryset = transactions_queryset.filter(method=method_filter)
                        filter_data['method'] = method_filter

                    # Buy price filters
                    if min_amount:
                        transactions_queryset = transactions_queryset.filter(amount__gte=min_amount)
                        filter_data['min_amount'] = min_amount

                    if max_amount:
                        transactions_queryset = transactions_queryset.filter(amount__lte=max_amount)
                        filter_data['max_amount'] = max_amount


                    # Date filters
                    if min_date:
                        transactions_queryset = transactions_queryset.filter(date__gte=min_date)
                        filter_data['min_date'] = min_date

                    if max_date:
                        transactions_queryset = transactions_queryset.filter(date__lte=max_date)
                        filter_data['max_date'] = max_date

                    if currency_filter:
                        transactions_queryset = transactions_queryset.filter(currency=currency_filter)
                        filter_data['currency'] = currency_filter

                    # if chassis_number_search:
                    #     transactions_queryset = transactions_queryset.filter(chassis_number__icontains=chassis_number_search)
                    #     filter_data['chassis_number_search'] = chassis_number_search
                    #
                    # # Accident vehicle filter
                    # if accident_vehicle_filter != '':
                    #     accident_value = accident_vehicle_filter == 'true'
                    #     transactions_queryset = transactions_queryset.filter(accident_vehicle=accident_value)
                    #     filter_data['accident_vehicle'] = accident_vehicle_filter
                else:
                    transactions_queryset = transactions_queryset.exclude(status="inactive")

                # Apply sorting
                sort_field = request.GET.get('sort', '')
                sort_order = request.GET.get('order', 'asc')

                if sort_field:
                    # Map sort field names to actual model fields
                    sort_field_mapping = {
                        'status': 'status',
                        'category': 'category',
                        'subcategory': 'subcategory',
                        'internal_id': 'internal_id',
                        'vehicle': 'vehicle',
                        'method': 'method',
                        'min_amount': 'min_amount',
                        'max_amount': 'max_amount',
                        'min_date': 'min_date',
                        'max_date': 'max_date',
                        'currency': 'currency',
                        # Added mappings so frontend sort keys (amount, date, id) work
                        'amount': 'amount',
                        'date': 'date',
                        'id': 'internal_id',
                    }

                    actual_sort_field = sort_field_mapping.get(sort_field)
                    if actual_sort_field:
                        if sort_order == 'desc':
                            actual_sort_field = f'-{actual_sort_field}'
                        transactions_queryset = transactions_queryset.order_by(actual_sort_field)
                        filter_data['sort'] = sort_field
                        filter_data['order'] = sort_order
                    else:
                        # Default sorting by ID if invalid field
                        transactions_queryset = transactions_queryset.order_by('-internal_id')
                else:
                    # Default sorting by ID if no sort specified
                    transactions_queryset = transactions_queryset.order_by('-internal_id')

                # Paginate transactions - default 20 per page
                page = request.GET.get('page', 1)
                transactions_paginator = Paginator(transactions_queryset, 20)
                try:
                    transactions_page = transactions_paginator.page(page)
                except PageNotAnInteger:
                    transactions_page = transactions_paginator.page(1)
                except EmptyPage:
                    transactions_page = transactions_paginator.page(transactions_paginator.num_pages)

                # vehicles = []
                # for transaction in transactions_queryset:
                #     if transaction.vehicle and transaction.vehicle not in vehicles:
                #         vehicles.append(transaction.vehicle)
                method_choices = Transaction.METHOD_CHOICES

                method_choices = list(method_choices)
                existing_keys = {k for k, _ in method_choices}

                # append any distinct non-empty Transaction.method values missing from the choices
                for m in Transaction.objects.exclude(method__isnull=True).exclude(method__exact='').values_list(
                        'method', flat=True).distinct():
                    if m and m not in existing_keys:
                        label = str(m).replace('_', ' ').title()
                        method_choices.append((m, label))
                        existing_keys.add(m)

                return render(request, 'transactions.html', {
                     'net_total_revenue': net_total_revenue,
                    'net_total_expenses': net_total_expenses,
                    'net_difference': net_difference,

                    'tax_total_revenue': tax_total_revenue,
                    'tax_total_expenses': tax_total_expenses,
                    'tax_difference': tax_difference,

                    'gross_total_revenue': gross_total_revenue,
                    'gross_total_expenses': gross_total_expenses,
                    'gross_difference': gross_difference,





                     'user': user,
                     'first_render': True,
                     'transactions': transactions_page,
                     'paginator': transactions_paginator,
                     'page_obj': transactions_page,
                     'total_count' : transactions_queryset.count(),
                     'filter_data': filter_data,
                     'status_choices': Transaction.STATUS_CHOICES,
                     'method_choices': method_choices,
                     'category_choices': Transaction.CATEGORY_CHOICES,
                     'currency_choices': Transaction.CURRENCY_CHOICES,
                        'vehicles': Vehicle.objects.filter(
                            business=user.business,
                            id__in=Transaction.objects.filter(business=user.business, vehicle__isnull=False)
                            .values_list('vehicle_id', flat=True).distinct()
                        ).exclude(status="inactive"),
                     # 'subcategory_choices': Transaction.SUBCATEGORY_CHOICES,
                 })
            else:
                messages.error(request, "Forbidden: Dont have access to Transactions app, contact your manager or administrator to gain access.")
                return redirect('vehicles', business_name=request.user.business.name)
        else:
            messages.error(request, "Forbidden: You dont have access to requested business.")
            return redirect('vehicles', business_name=request.user.business.name)
    else:
        messages.error(request, "Unauthorized: You are not logged in, please log in.")
        return redirect(reverse('user-login'))

def add_new_transaction(request, business_name):
    if request.user.is_authenticated:
        if request.user.business.name == business_name:
            if request.user.transactions_access:

                # Legacy choices (keeping for backwards compatibility)
                category_choices = Transaction.CATEGORY_CHOICES
                currency_choices = Transaction.CURRENCY_CHOICES
                method_choices = Transaction.METHOD_CHOICES

                # FK-based choices from dynamic models
                business = request.user.business
                payment_method_choices = [(pm.id, pm.name) for pm in PaymentMethod.objects.filter(business=business, is_active=True)]
                currency_fk_choices = [(c.id, str(c)) for c in Currency.objects.filter(business=business, is_active=True)]
                category_fk_choices = [(cat.id, cat.name) for cat in Category.objects.filter(business=business, is_active=True)]

                category_subcategories = {}

                # If this is a POST request and manufacturer is selected, populate models
                if request.method == "POST":
                    selected_category = request.POST.get('category', '').strip()
                    if selected_category:
                        # Get the models for the selected manufacturer using your existing function
                        category_subcategories = get_subcategories_for_category(selected_category)

                method_choices = list(method_choices)
                existing_keys = {k for k, _ in method_choices}

                # append any distinct non-empty Transaction.method values missing from the choices
                for m in Transaction.objects.exclude(method__isnull=True).exclude(method__exact='').values_list(
                        'method', flat=True).distinct():
                    if m and m not in existing_keys:
                        label = str(m).replace('_', ' ').title()
                        method_choices.append((m, label))
                        existing_keys.add(m)

                # status_choices = Transaction.STATUS_CHOICES

                empty_mandatory_fields_errors = {}

                context = {
                    # Legacy choices (for backwards compatibility)
                    'currency_choices': currency_choices,
                    'method_choices': method_choices,
                    'category_choices': category_choices,
                    'category_subcategories': category_subcategories,
                    
                    # FK-based choices (for new Add New functionality)
                    'payment_method_choices': payment_method_choices,
                    'currency_fk_choices': currency_fk_choices,
                    'category_fk_choices': category_fk_choices,
                    
                    # 'status_choices': status_choices,
                    'vehicle_choices': [(vehicle.id, f"{vehicle} - {vehicle.internal_id}") for vehicle in
                                        request.user.business.business_vehicles.exclude(status="inactive").reverse()],

                    'empty_mandatory_fields_errors': empty_mandatory_fields_errors,

                    'user': request.user,

                    'first_render': True
                    # ... other context
                }
                if request.method == "POST":


                    # status = request.POST.get('status', '').strip()


                    amount = request.POST.get('amount', '').strip()
                    category = request.POST.get('category', '').strip()
                    subcategory = request.POST.get('subcategory', '').strip()
                    vehicle = request.POST.get('vehicle', '').strip()
                    date = request.POST.get('date', '').strip()
                    method = request.POST.get('method', '').strip()
                    tax = request.POST.get('tax', '').strip()
                    description = request.POST.get('description', '').strip()
                    from_or_to = request.POST.get('from_or_to', '').strip()
                    internal_comments = request.POST.get('internal_comments', '').strip()
                    currency = request.POST.get('currency', '').strip()

                    empty_mandatory_fields_errors = {}

                    mandatory_fields = {
                        # 'status': 'Status cannot be empty',
                        'amount': 'Amount cannot be empty',
                        # 'category': 'Category cannot be empty',
                        # 'subcategory': 'Subcategory type cannot be empty',
                        # 'vehicle': 'vehicle cannot be empty',
                        'method': 'Method cannot be empty',
                        # 'tax': 'Tax cannot be empty',
                        'from_or_to': 'From_or_to',
                        'currency': 'Currency cannot be empty',
                        'date': 'Date cannot be empty',
                    }




                    # Check for empty fields

                    empty_field_exists = False
                    for field_name, error_message in mandatory_fields.items():
                        field_value = locals().get(field_name, '')  # Get the variable value
                        if not field_value:
                            empty_field_exists = True
                            empty_mandatory_fields_errors[field_name] = error_message
                    if empty_field_exists:
                        messages.error(request, "Mandatory fields cannot be empty")

                    # Check if there are any errors
                    if empty_mandatory_fields_errors:
                        # Handle errors
                        context["empty_mandatory_fields_errors"] = empty_mandatory_fields_errors
                        context["first_render"] = False
                        return render(request, 'add_new_transaction.html', context)
                    else:

                        try:
                            if vehicle:
                                if tax:
                                    Transaction.objects.create(
                                        status="confirmed",
                                        category=category,
                                        subcategory=subcategory,
                                        vehicle=Vehicle.objects.get(id=vehicle),
                                        date=date,
                                        method=method,
                                        from_or_to=from_or_to,
                                        description=description,
                                        internal_comments=internal_comments,
                                        amount=amount,
                                        tax=tax,
                                        currency=currency,
                                        business=request.user.business,
                                    )
                                else:
                                    Transaction.objects.create(
                                        status="confirmed",
                                        category=category,
                                        subcategory=subcategory,
                                        vehicle=Vehicle.objects.get(id=vehicle),
                                        date=date,
                                        method=method,
                                        from_or_to=from_or_to,
                                        description=description,
                                        internal_comments=internal_comments,
                                        amount=amount,
                                        tax=0,
                                        currency=currency,
                                        business=request.user.business,
                                    )
                            else:
                                if tax:
                                    Transaction.objects.create(
                                        status="confirmed",
                                        category=category,
                                        subcategory=subcategory,
                                        date=date,
                                        method=method,
                                        from_or_to=from_or_to,
                                        description=description,
                                        internal_comments=internal_comments,
                                        amount=amount,
                                        tax=tax,
                                        currency=currency,
                                        business=request.user.business,
                                    )
                                else:
                                    Transaction.objects.create(
                                        status="confirmed",
                                        category=category,
                                        subcategory=subcategory,
                                        date=date,
                                        method=method,
                                        from_or_to=from_or_to,
                                        description=description,
                                        internal_comments=internal_comments,
                                        amount=amount,
                                        tax=0,
                                        currency=currency,
                                        business=request.user.business,
                                    )
                            messages.success(request, 'New transaction added successfully!')
                            return redirect('transactions', business_name=business_name)
                        except Exception as e:
                            # Handle any database constraint errors
                            if 'UNIQUE constraint failed' in str(e):
                                messages.error(request,
                                               'A transaction with similar details already exists. Please check the unique identifiers (chassis number, registration number, or license plate).')
                            else:
                                messages.error(request, f'Error adding transaction: {str(e)}')
                            context["first_render"] = False
                            return render(request, 'add_new_transaction.html', context)
                else:

                    return render(request, "add_new_transaction.html", context)
            else:
                messages.error(request, "Forbidden: Dont have access to Transactions app, contact your manager or administrator to gain access.")
                return redirect('vehicles', business_name=request.user.business.name)
        else:
            messages.error(request, "Forbidden: You dont have access to requested business.")
            return redirect('vehicles', business_name=request.user.business.name)
    else:
        messages.error(request, "Unauthorized: You are not logged in, please log in.")
        return redirect(reverse('user-login'))
def transaction_details(request, business_name, transaction_internal_id):
    """Display and handle transaction details editing"""
    if not request.user.is_authenticated:
        messages.error(request, "Unauthorized: You are not logged in, please log in.")
        return redirect(reverse('user-login'))
    
    if request.user.business.name != business_name:
        messages.error(request, "Forbidden: You dont have access to requested business.")
        return redirect('vehicles', business_name=request.user.business.name)
    
    if not request.user.transactions_access:
        messages.error(request, "Forbidden: Dont have access to Transactions app, contact your manager or administrator to gain access.")
        return redirect('vehicles', business_name=request.user.business.name)
    
    try:
        transaction_id = Transaction.objects.get(internal_id=transaction_internal_id, business=request.user.business).id
    except Transaction.DoesNotExist:
        messages.error(request, "Transaction not found.")
        return redirect('transactions', business_name=business_name)
    
    vehicle_transactions = None
    try:
        transaction = Transaction.objects.get(id=transaction_id, business=request.user.business)
        if transaction.vehicle:
            vehicle_transactions = transaction.vehicle.vehicle_transactions.all().order_by('-internal_id')

    except Vehicle.DoesNotExist:
        messages.error(request, "Transaction not found.")
        return redirect('transactions', business_name=business_name)

    # Compute previous/next transaction internal_ids (ordered oldest->newest by internal_id)
    prev_internal = None
    next_internal = None
    prev_inactive_internal = None
    next_inactive_internal = None
    try:
        from bisect import bisect_left

        # Helper to compute prev/next from a sorted list of ids
        def compute_prev_next(sorted_ids, cur):
            # Robust handling: empty list
            if not sorted_ids:
                return None, None

            # Ensure cur is an int (if possible)
            try:
                cur_val = int(cur)
            except Exception:
                # If current id is invalid, return None neighbors
                return None, None

            # If exact match exists, use index for deterministic neighbors
            if cur_val in sorted_ids:
                idx = sorted_ids.index(cur_val)
                prev_id = sorted_ids[idx - 1] if idx > 0 else None
                next_id = sorted_ids[idx + 1] if (idx + 1) < len(sorted_ids) else None
                return prev_id, next_id

            # Not found: use bisect to find insertion point and neighbors
            pos = bisect_left(sorted_ids, cur_val)
            prev_id = sorted_ids[pos - 1] if pos > 0 else None
            next_id = sorted_ids[pos] if pos < len(sorted_ids) else None
            return prev_id, next_id

        cur_id = transaction.internal_id if transaction.internal_id is not None else None

        # Primary: business-wide transactions excluding those whose linked vehicle is inactive
        primary_ids = list(Transaction.objects.filter(
            business=request.user.business,
        ).exclude(
            vehicle__status='inactive'
        ).exclude(
            internal_id__isnull=True
        ).order_by('internal_id').values_list('internal_id', flat=True))

        prev_internal, next_internal = compute_prev_next(primary_ids, cur_id)

        # Review-required-only list (transactions with status 'review_required')
        review_ids = list(Transaction.objects.filter(
            business=request.user.business,
            status='review_required'
        ).exclude(
            internal_id__isnull=True
        ).order_by('internal_id').values_list('internal_id', flat=True))

        prev_inactive_internal, next_inactive_internal = compute_prev_next(review_ids, cur_id)

    except Exception:
        prev_internal = None
        next_internal = None
        prev_inactive_internal = None
        next_inactive_internal = None

    subcategories = {}

    # If this is a POST request and manufacturer is selected, populate models
    if request.method == "POST":
        selected_category = request.POST.get('category', '').strip()
        if selected_category:
            subcategories = get_subcategories_for_category(selected_category)

    empty_mandatory_fields_errors = {}

    method_choices = Transaction.METHOD_CHOICES
    method_choices = list(method_choices)
    existing_keys = {k for k, _ in method_choices}

    # append any distinct non-empty Transaction.method values missing from the choices
    for m in Transaction.objects.exclude(method__isnull=True).exclude(method__exact='').values_list(
            'method', flat=True).distinct():
        if m and m not in existing_keys:
            label = str(m).replace('_', ' ').title()
            method_choices.append((m, label))
            existing_keys.add(m)

    context = {
        'transaction': transaction,
        'vehicle_transactions': vehicle_transactions,
        'method_choices': method_choices,
        'category_choices': Transaction.CATEGORY_CHOICES,
        'currency_choices': Transaction.CURRENCY_CHOICES,
        'empty_mandatory_fields_errors': empty_mandatory_fields_errors,
        'manufacturer_models': subcategories,
        'user': request.user,
        'first_render': True,
        'vehicle_choices': [(vehicle.id, f"{vehicle} - {vehicle.internal_id}") for vehicle in
                           request.user.business.business_vehicles.exclude(status="inactive").reverse()],
    }
    context['status_choices'] = Transaction.STATUS_CHOICES

    if request.method == "POST":
        amount = request.POST.get('amount', '').strip()
        status = request.POST.get('status', '').strip()
        category = request.POST.get('category', '').strip()
        subcategory = request.POST.get('subcategory', '').strip()
        vehicle_id = request.POST.get('vehicle', '').strip()
        if vehicle_id:
            vehicle = Vehicle.objects.get(id=vehicle_id)
        date = request.POST.get('date', '').strip()
        method = request.POST.get('method', '').strip()
        tax = request.POST.get('tax', '').strip()
        if not tax:
            tax = 0
        description = request.POST.get('description', '').strip()
        from_or_to = request.POST.get('from_or_to', '').strip()
        internal_comments = request.POST.get('internal_comments', '').strip()
        currency = request.POST.get('currency', '').strip()

        empty_mandatory_fields_errors = {}

        mandatory_fields = {
            'amount': 'Amount cannot be empty',
            'method': 'Method cannot be empty',
            'from_or_to': 'From_or_to',
            'currency': 'Currency cannot be empty',
        }

        empty_field_exists = False
        for field_name, error_message in mandatory_fields.items():
            field_value = locals().get(field_name, '')
            if not field_value:
                empty_field_exists = True
                empty_mandatory_fields_errors[field_name] = error_message
        if empty_field_exists:
            messages.error(request, "Mandatory fields cannot be empty")

        if empty_mandatory_fields_errors:
            context["empty_mandatory_fields_errors"] = empty_mandatory_fields_errors
            context["first_render"] = False
            return render(request, 'transaction_details.html', context)
        else:
            if status == transaction.status:
                transaction.status = "confirmed"
            else:
                if transaction.status == "confirmed":
                    transaction.status = "review_required"
                else:
                    transaction.status = "confirmed"

            transaction.amount = amount
            transaction.category = category
            transaction.subcategory = subcategory
            if vehicle_id:
                if vehicle:
                    transaction.vehicle = vehicle
            transaction.date = date
            transaction.method = method
            transaction.currency = currency
            transaction.tax = tax
            transaction.description = description
            transaction.internal_comments = internal_comments

            try:
                transaction.save()
                messages.success(request, "Transaction details updated successfully.")
                return redirect('transaction-details', business_name=business_name, transaction_internal_id=transaction_internal_id)
            except Exception as e:
                messages.error(request, f"Error updating Transaction: {str(e)}")
                context["empty_mandatory_fields_errors"] = {"general": "Database error occurred"}
                context["first_render"] = False
                return render(request, 'transaction_details.html', context)
    else:
        # GET request - populate manufacturer_models if manufacturer is already set
        if transaction.category:
            category_subcategories = get_subcategories_for_category(transaction.category)
            context["category_subcategory"] = category_subcategories

    # Add prev/next to context before returning
    context['prev_transaction_internal_id'] = prev_internal
    context['next_transaction_internal_id'] = next_internal
    context['prev_inactive_transaction_internal_id'] = prev_inactive_internal
    context['next_inactive_transaction_internal_id'] = next_inactive_internal
    return render(request, 'transaction_details.html', context)


def delete_transaction(request, business_name, transaction_internal_id):
    """Delete (deactivate) a transaction"""
    if request.user.is_authenticated:
        if request.user.business.name == business_name:
            if request.user.transactions_access:
                transaction_id = Transaction.objects.get(internal_id=transaction_internal_id, business=request.user.business).id
                if request.method == 'POST':
                    try:
                        transaction =Transaction.objects.get(id=transaction_id, business=request.user.business)
                        transaction.status = "inactive"
                        transaction.save()
                        messages.success(request,
                                         f"Transaction {transaction.internal_id} has been deleted (deactivated).")
                        return redirect('transactions', business_name=business_name)
                    except Transaction.DoesNotExist:
                        messages.error(request, "Transaction not found.")
                        return redirect('transactions', business_name=business_name)
                else:
                    messages.error(request, "Invalid request method.")
                    return redirect('transactions', business_name=business_name)
            else:
                messages.error(request, "Forbidden: Dont have access to Transactions app, contact your manager or administrator to gain access.")
                return redirect('vehicles', business_name=request.user.business.name)
        else:
            messages.error(request, "Forbidden: You dont have access to requested business.")
            return redirect('vehicles', business_name=request.user.business.name)
    else:
        messages.error(request, "Unauthorized: You are not logged in, please log in.")
        return redirect(reverse('user-login'))
def activate_transaction(request, business_name, transaction_internal_id):
    """Activate a transaction - check for unique constraint violations"""

    if request.user.is_authenticated:
        if request.user.business.name == business_name:
            if request.user.transactions_access:
                transaction_id = Transaction.objects.get(internal_id=transaction_internal_id, business=request.user.business).id
                if request.method == 'POST':
                    try:
                        transaction = Transaction.objects.get(id=transaction_id, business=request.user.business)

                        # Only allow activation of inactive vehicles
                        if transaction.status != "inactive":
                            messages.error(request, "Only inactive transactions can be activated.")
                            return redirect('transactions', business_name=business_name)



                        transaction.status = "review_required"
                        transaction.save()
                        messages.success(request,
                                         f"Transaction {transaction.internal_id} has been activated successfully.")
                        return redirect('transactions', business_name=business_name)

                    except Transaction.DoesNotExist:
                        messages.error(request, "Transaction not found.")
                        return redirect('transactions', business_name=business_name)
                else:
                    messages.error(request, "Invalid request method.")
                    return redirect('transactions', business_name=business_name)
            else:
                messages.error(request,"Forbidden: Dont have access to Transactions app, contact your manager or administrator to gain access.")
                return redirect('vehicles', business_name=request.user.business.name)
        else:
            messages.error(request, "Forbidden: You dont have access to requested business.")
            return redirect('vehicles', business_name=request.user.business.name)
    else:
        messages.error(request, "Unauthorized: You are not logged in, please log in.")
        return redirect(reverse('user-login'))
#######################################################
#################Sttings and management###################
def business_settings(request, business_name):
    if request.user.is_authenticated:
        if request.user.business.name == business_name:
            if request.user.is_manager:
                if request.method == 'POST':
                    form = request.POST.get('form_type')
                    if form == 'edit_business_details':
                        empty_mandatory_fields_errors = {}
                        business_name = request.POST.get('business_name').strip()
                        if not business_name:
                            empty_mandatory_fields_errors["business_name"] = "Business name cannot be empty"

                        if Business.objects.filter(name__iexact=business_name).exists() and request.user.business.name != business_name:
                            empty_mandatory_fields_errors["business_name"] = "Business name already exists"
                            messages.error(request, 'Entered business name is already taken, please choose another name.')
                            return render(request, "business_settings.html", {
                                "user": request.user,
                                "empty_mandatory_fields_errors": empty_mandatory_fields_errors,
                                "form_type": form,
                            })

                        error_branches = {}
                        branches_details =[]
                        one_active_branch = False
                        for branch in request.user.business.business_branches.all():
                            branch_name = request.POST.get(f'branch_name_{branch.id}').strip()
                            branch_address = request.POST.get(f'branch_address_{branch.id}').strip()
                            branch_is_active = request.POST.get(f'branch_is_active_{branch.id}')

                            if not branch_name:
                                empty_mandatory_fields_errors[f'branch_name_{branch.id}'] = "Branch field cannot be empty"
                                error_branches[branch.id] = "Branch field cannot be empty"

                            if branch_is_active == "on":
                                one_active_branch = True

                            branches_details.append((branch, branch_name, branch_address, branch_is_active))

                        if not one_active_branch and empty_mandatory_fields_errors:
                            messages.error(request, 'At least one branch should be active')
                            messages.error(request, 'Business details could not be updated, required fields cannot be empty')
                            return render(request, "business_settings.html", {
                                "user": request.user,
                                "empty_mandatory_fields_errors": empty_mandatory_fields_errors,
                                "form_type": form,
                                "error_branches": error_branches,
                            })
                        elif not one_active_branch:
                            messages.error(request, 'At least one branch should be active')
                            return render(request, "business_settings.html", {
                                "user": request.user,
                                "empty_mandatory_fields_errors": empty_mandatory_fields_errors,
                                "form_type": form,
                            })
                        elif empty_mandatory_fields_errors:
                            messages.error(request, 'Business details could not be updated, required fields cannot be empty')
                            return render(request, "business_settings.html", {
                                "user": request.user,
                                "empty_mandatory_fields_errors": empty_mandatory_fields_errors,
                                "form_type": form,
                                "error_branches": error_branches,
                            })
                        else:
                            for branch, branch_name, branch_address, branch_is_active in branches_details:
                                branch.name = branch_name
                                branch.address = branch_address
                                branch.is_active = branch_is_active == 'on'
                                branch.save()
                            
                            # Save business name
                            request.user.business.name = business_name
                            
                            # Save address fields (Category 1)
                            request.user.business.address_country = request.POST.get('address_country', '').strip() or None
                            request.user.business.address_city = request.POST.get('address_city', '').strip() or None
                            request.user.business.address_street = request.POST.get('address_street', '').strip() or None
                            request.user.business.address_street_number = request.POST.get('address_street_number', '').strip() or None
                            request.user.business.address_postal_code = request.POST.get('address_postal_code', '').strip() or None
                            
                            # Save contact fields (Category 2)
                            request.user.business.telephone_number = request.POST.get('telephone_number', '').strip() or None
                            request.user.business.fax_number = request.POST.get('fax_number', '').strip() or None
                            request.user.business.email = request.POST.get('email', '').strip() or None
                            
                            # Save bank fields (Category 3)
                            request.user.business.bank_name = request.POST.get('bank_name', '').strip() or None
                            request.user.business.bank_bic_swift = request.POST.get('bank_bic_swift', '').strip() or None
                            request.user.business.bank_iban = request.POST.get('bank_iban', '').strip() or None
                            
                            # Save company registration fields (Category 4)
                            request.user.business.managing_director = request.POST.get('managing_director', '').strip() or None
                            request.user.business.tax_id = request.POST.get('tax_id', '').strip() or None
                            request.user.business.eori_number = request.POST.get('eori_number', '').strip() or None
                            request.user.business.ust_id_nr = request.POST.get('ust_id_nr', '').strip() or None
                            request.user.business.headquarters_city = request.POST.get('headquarters_city', '').strip() or None
                            request.user.business.court_district = request.POST.get('court_district', '').strip() or None
                            request.user.business.court_registration_number = request.POST.get('court_registration_number', '').strip() or None
                            
                            # Handle logo upload (Category 5)
                            if 'business_logo' in request.FILES:
                                logo_file = request.FILES['business_logo']
                                # Validate file type
                                allowed_types = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
                                if logo_file.content_type in allowed_types:
                                    request.user.business.logo = logo_file
                            
                            request.user.business.save()
                            messages.success(request, 'Business details have been successfully updated.')
                            return render(request, "business_settings.html", {
                                "user": request.user,
                                "empty_mandatory_fields_errors": empty_mandatory_fields_errors,
                                "form_type": form,
                            })

                    elif form == 'add_new_branch':
                        empty_mandatory_fields_errors = {}
                        branch_name = request.POST.get('branch_name').strip()
                        branch_address = request.POST.get('branch_address').strip()
                        if branch_name:
                            Branch.objects.create(
                                name=branch_name,
                                address=branch_address,
                                business=request.user.business,
                                is_active=True
                            )
                            messages.success(request, 'New branch added successfully!')
                            return render(request, "business_settings.html", {
                                "user": request.user,
                                "empty_mandatory_fields_errors": empty_mandatory_fields_errors,
                                "form_type": form,
                            })
                        else:
                            empty_mandatory_fields_errors["branch_name"] = "Branch name cannot be empty"
                            messages.error(request, 'A new branch could not be added. Please fill in all required fields.')
                            return render(request, "business_settings.html", {
                                "user": request.user,
                                "empty_mandatory_fields_errors": empty_mandatory_fields_errors,
                                "form_type": form,
                            })
                    else:
                        return redirect('vehicles', business_name=business_name)

                else:
                    empty_mandatory_fields_errors = {}
                    return render(request, "business_settings.html", {
                        "user" : request.user,
                        "empty_mandatory_fields_errors": empty_mandatory_fields_errors,
                    })
            else:
                messages.error(request, "Forbidden: Dont have access to business_settings.")
                return redirect('vehicles', business_name=request.user.business.name)
        else:
            messages.error(request, "Forbidden: You dont have access to requested business.")
            return redirect('vehicles', business_name=request.user.business.name)
    else:
        messages.error(request, "Unauthorized: You are not logged in, please log in.")
        return redirect(reverse('user-login'))
def users_management(request, business_name):
    if request.user.is_authenticated:
        if request.user.business.name == business_name:
            if request.user.is_manager:
                employees = User.objects.filter(
                    is_manager=False,
                    business=request.user.business
                )
                if request.method == 'POST':
                    form = request.POST.get('form_type')
                    if form == 'edit_users_details':
                        empty_mandatory_fields_errors = {}
                        username = request.POST.get('username').strip()
                        if not username:
                            empty_mandatory_fields_errors["username"] = "Username name cannot be empty"

                        if User.objects.exclude(username__iexact=request.user.username).filter(username__iexact=username).exists():
                            empty_mandatory_fields_errors["username"] = "Username name already exists"
                            messages.error(request, 'Entered username for manager is already taken, please choose another name.')
                            return render(request, "users_management.html", {
                                "user": request.user,
                                "empty_mandatory_fields_errors": empty_mandatory_fields_errors,
                                "form_type": form,
                                "employees": employees,
                            })

                        error_employees = {}
                        employees_details =[]

                        for employee in employees:
                            employee_username = request.POST.get(f'employee_username_{employee.id}').strip()
                            employee_password = request.POST.get(f'employee_password_{employee.id}').strip()
                            employee_transactions_access = request.POST.get(f'employee_transactions_access_{employee.id}')
                            employee_is_active = request.POST.get(f'employee_is_active_{employee.id}')

                            if not employee_username:
                                empty_mandatory_fields_errors[f'employee_username_{employee.id}'] = "Username field cannot be empty"
                                error_employees[employee.id] = "Username field cannot be empty"

                            if User.objects.exclude(username__iexact=employee.username).filter(username__iexact=employee_username).exists():
                                empty_mandatory_fields_errors[f'employee_username_{employee.id}'] = "Username name already exists"
                                error_employees[employee.id] = "Username name already exists"
                                messages.error(request, 'Entered username for an employee is already taken, please choose another name.')
                                return render(request, "users_management.html", {
                                    "user": request.user,
                                    "empty_mandatory_fields_errors": empty_mandatory_fields_errors,
                                    "form_type": form,
                                    "employees": employees,
                                    "error_employees": error_employees,
                                })

                            # if not employee_password:
                            #     empty_mandatory_fields_errors[f'employee_password_{employee.id}'] = "Password field cannot be empty"
                            #     error_employees[employee.id] = "Password field cannot be empty"

                            employees_details.append((employee, employee_username, employee_password, employee_transactions_access, employee_is_active))


                        if empty_mandatory_fields_errors:
                            messages.error(request, 'Users details could not be updated, required fields cannot be empty')
                            return render(request, "users_management.html", {
                                "user": request.user,
                                "empty_mandatory_fields_errors": empty_mandatory_fields_errors,
                                "form_type": form,
                                "error_employees": error_employees,
                                "employees": employees,
                            })
                        else:
                            for employee, employee_username, employee_password, employee_transactions_access, employee_is_active in employees_details:
                                employee.name = employee_username
                                if employee_password:
                                    employee.set_password(employee_password)
                                employee.transactions_access = employee_transactions_access == 'on'
                                employee.is_active = employee_is_active == 'on'
                                employee.save()
                            request.user.username = username
                            try:
                                request.user.save()
                            except IntegrityError:
                                messages.error(request, 'Manager username already exists.')
                                empty_mandatory_fields_errors["username"] = "Username already exists"
                                return render(request, "users_management.html", {
                                    "user": request.user,
                                    "empty_mandatory_fields_errors": empty_mandatory_fields_errors,
                                    "form_type": form,
                                    "employees": employees,
                                })
                            messages.success(request, 'Users details have been successfully updated.')
                            return render(request, "users_management.html", {
                                "user": request.user,
                                "empty_mandatory_fields_errors": empty_mandatory_fields_errors,
                                "form_type": form,
                                "employees": employees,
                            })

                    elif form == 'add_new_employee':
                        empty_mandatory_fields_errors = {}
                        employee_username = request.POST.get('employee_username').strip()
                        employee_password = request.POST.get('employee_password').strip()



                        if employee_username and employee_password and not User.objects.filter(username__iexact=employee_username).exists():

                            User.objects.create_user(
                                username=employee_username,
                                password=employee_password,
                                business=request.user.business,
                                transactions_access=False,
                                is_active=True
                            )
                            messages.success(request, 'New employee have been added successfully!')
                            return render(request, "users_management.html", {
                                "user": request.user,
                                "empty_mandatory_fields_errors": empty_mandatory_fields_errors,
                                "form_type": form,
                                "employees": employees,
                            })
                        else:
                            if User.objects.filter(username__iexact=employee_username).exists():
                                messages.error(request, 'An employee with the same username already exists!')
                                empty_mandatory_fields_errors["employee_username"] = "username already exists"

                            if not employee_username:
                                empty_mandatory_fields_errors["employee_username"] = "username cannot be empty"
                            if not employee_password:
                                empty_mandatory_fields_errors["employee_password"] = "password cannot be empty"
                            if not employee_username or not employee_password:
                                messages.error(request, 'A new branch could not be added. Please fill in all required fields.')
                            return render(request, "users_management.html", {
                                "user": request.user,
                                "empty_mandatory_fields_errors": empty_mandatory_fields_errors,
                                "form_type": form,
                                "employees": employees,
                            })

                    if form == 'enter_password':
                        current_password_error = {}
                        action = request.POST.get('action')
                        password = request.POST.get('enter_password')
                        if not password:
                            current_password_error["enter_password"] = "Password field cannot be left empty"
                            messages.error(request, "Please fill in requires fields")
                            return render(request, "users_management.html", {
                                "user": request.user,
                                "current_password_error": current_password_error,
                                "form_type": form,
                                "employees": employees,
                            })

                        if not authenticate(username=request.user.username, password=password):
                            current_password_error["enter_password"] = "incorrect password"
                            messages.error(request, "Entered password is incorrect")
                            return render(request, "users_management.html", {
                                "user": request.user,
                                "current_password_error": current_password_error,
                                "form_type": form,
                                "employees": employees,
                            })
                        user = request.user
                        if action == 'change_manager_password':
                            if user and user.is_manager:
                                subject = "Password Reset"
                                url = render_to_string('emails/password_reset_email.html', {
                                    ##### get the current domain
                                    'domain': get_current_site(request).domain,
                                    ##### get the user id and encode it, then convert the byte code to base64 encoding for transmitting the binary data
                                    'uid': urlsafe_base64_encode(force_bytes(user.pk)),
                                    ##### generate a special user token
                                    'token': account_activation_token.make_token(user),
                                    ##### input the protocol used
                                    "protocol": "http",
                                })
                                ##### construct and email
                                plain_message = strip_tags(url)
                                email = EmailMultiAlternatives(subject, plain_message, to=[user.email])
                                email.attach_alternative(url, "text/html")
                                if email.send():
                                    messages.success(request, "A Link was sent by email. It will expire in 1 minute.")
                                    return render(request, "users_management.html", {
                                        "user": request.user,
                                        "current_password_error": current_password_error,
                                        "form_type": form,
                                        "employees": employees,
                                    })
                                else:
                                    messages.error(request, "email was not sent")
                                    return render(request, "users_management.html", {
                                        "user": request.user,
                                        "current_password_error": current_password_error,
                                        "form_type": form,
                                        "employees": employees,
                                    })
                            else:
                                messages.error(request, "User doesn't have permission to change password")
                                return render(request, "users_management.html", {
                                    "user": request.user,
                                    "current_password_error": current_password_error,
                                    "form_type": form,
                                    "employees": employees,
                                })
                        if action == 'change_manager_email':
                            if user and user.is_manager:
                                subject = "Change email"
                                url = render_to_string('emails/email_change_verification.html', {
                                    ##### get the current domain
                                    'domain': get_current_site(request).domain,
                                    ##### get the user id and encode it, then convert the byte code to base64 encoding for transmitting the binary data
                                    'uid': urlsafe_base64_encode(force_bytes(user.pk)),
                                    ##### generate a special user token
                                    'token': account_activation_token.make_token(user),
                                    ##### input the protocol used
                                    "protocol": "http",
                                })
                                ##### construct and email
                                plain_message = strip_tags(url)
                                email = EmailMultiAlternatives(subject, plain_message, to=[user.email])
                                email.attach_alternative(url, "text/html")
                                if email.send():
                                    messages.success(request, "A Link was sent by email. It will expire in 1 minute.")
                                    return render(request, "users_management.html", {
                                        "user": request.user,
                                        "current_password_error": current_password_error,
                                        "form_type": form,
                                        "employees": employees,
                                    })
                                else:
                                    messages.error(request, "email was not sent")
                                    return render(request, "users_management.html", {
                                        "user": request.user,
                                        "current_password_error": current_password_error,
                                        "form_type": form,
                                        "employees": employees,
                                    })
                            else:
                                messages.error(request, "User doesn't have permission to change email")
                                return render(request, "users_management.html", {
                                    "user": request.user,
                                    "current_password_error": current_password_error,
                                    "form_type": form,
                                    "employees": employees,
                                })
                        if action == 'change_manager_backup_email':
                            if user and user.is_manager:
                                subject = "Change backup email"
                                url = render_to_string('emails/backup_email_change_verification.html', {
                                    ##### get the current domain
                                    'domain': get_current_site(request).domain,
                                    ##### get the user id and encode it, then convert the byte code to base64 encoding for transmitting the binary data
                                    'uid': urlsafe_base64_encode(force_bytes(user.pk)),
                                    ##### generate a special user token
                                    'token': account_activation_token.make_token(user),
                                    ##### input the protocol used
                                    "protocol": "http",
                                })
                                ##### construct and email
                                plain_message = strip_tags(url)
                                email = EmailMultiAlternatives(subject, plain_message, to=[user.email])
                                email.attach_alternative(url, "text/html")
                                if email.send():
                                    messages.success(request, "A Link was sent by email. It will expire in 1 minute.")
                                    return render(request, "users_management.html", {
                                        "user": request.user,
                                        "current_password_error": current_password_error,
                                        "form_type": form,
                                        "employees": employees,
                                    })
                                else:
                                    messages.error(request, "email was not sent")
                                    return render(request, "users_management.html", {
                                        "user": request.user,
                                        "current_password_error": current_password_error,
                                        "form_type": form,
                                        "employees": employees,
                                    })
                            else:
                                messages.error(request, "User doesn't have permission to change email")
                                return render(request, "users_management.html", {
                                    "user": request.user,
                                    "current_password_error": current_password_error,
                                    "form_type": form,
                                    "employees": employees,
                                })

                    else:
                        return redirect('vehicles', business_name=business_name)

                else:
                    empty_mandatory_fields_errors = {}
                    return render(request, "users_management.html", {
                        "user" : request.user,
                        "empty_mandatory_fields_errors": empty_mandatory_fields_errors,
                        "employees": employees,
                    })
            else:
                messages.error(request,"Forbidden: Dont have access to users_management.")
                return redirect('vehicles', business_name=request.user.business.name)
        else:
            messages.error(request, "Forbidden: You dont have access to requested business.")
            return redirect('vehicles', business_name=request.user.business.name)
    else:
        messages.error(request, "Unauthorized: You are not logged in, please log in.")
        return redirect(reverse('user-login'))
 #######################################
################security#######################
# @ratelimit(key='ip', rate='5/m', method='POST')  # 5 attempts per minute per IP
def employee_login(request):
    if request.method == "POST":
        # Check if rate limit exceeded
        # if getattr(request, 'limited', False):
        #     messages.error(request, 'Too many login attempts. Try again in a minute.')
        #     return redirect('employee-login')


        username = request.POST.get('username')
        password = request.POST.get('password')

        user = authenticate(request, username=username, password=password)

        if user is not None and not user.is_manager:
            # login(request, user)
            # return redirect('vehicles', business_name=user.business.name)




            subject = "Employee user Authentication"
            url = render_to_string('emails/authentication_email.html', {
                'domain': get_current_site(request).domain,
                'uid': urlsafe_base64_encode(force_bytes(user.pk)),
                'token': account_activation_token.make_token(user),
                "protocol": "http",
            })
            email = EmailMultiAlternatives(subject, url, to=[user.business.business_users.filter(is_manager=True).first().email])
            plain_message = strip_tags(url)
            email.attach_alternative(url, "text/html")
            if email.send():
                messages.success(request, "A Link was sent by email to your manager. It will expire in 1 minute.")
                return redirect('manager-login')
            else:
                messages.error(request, "email was not sent")
                return redirect('manager-login')
        else:
            messages.error(request, 'No user exists with those credentials')
            return redirect('employee-login')
    else:
        return render(request, 'employee_login.html', {})
def manager_login(request):
    if request.method == "POST":

        username = request.POST['username'].lower()
        email = request.POST["email"].lower()
        password = request.POST["password"]

        if username:
            user = authenticate(request, username=username, password=password)
        elif email:
            user = User.objects.get(email=email)
            user = authenticate(username=user.username, password=password)
        else:
            user = authenticate(request, username=username, password=password)

        if user and user.is_manager:
            subject = "User Authentication"
            url = render_to_string('emails/authentication_email.html', {
                'domain': get_current_site(request).domain,
                'uid': urlsafe_base64_encode(force_bytes(user.pk)),
                'token': account_activation_token.make_token(user),
                "protocol": "http",
            })
            email = EmailMultiAlternatives(subject, url, to=[user.email])
            plain_message = strip_tags(url)
            email.attach_alternative(url, "text/html")
            if email.send():
                messages.success(request, "A Link was sent by email. It will expire in 1 minute.")
                return redirect('manager-login')
            else:
                messages.error(request, "email was not sent")
                return redirect('manager-login')

        else:
            messages.error(request, "Invalid credentials")
            return redirect('manager-login')
    else:
        return render(request, 'manager_login.html', {})
def user_login(request):
    return render(request, 'login.html', {})
def user_logout(request):
    if request.user.is_authenticated:
        logout(request)
        return redirect("user-login")
    else:
        return render(request, "404.html")  #######

def authenticate_user(request, uidb64, token):
    """
    #####
    When user clicks the authentication link sent by email:
        1- encoded user id is decoded and used to get the user object
        2- check if the token is valid
        3- login the user and load the login page with a success message
    """
    User = get_user_model()

    uid = force_str(urlsafe_base64_decode(uidb64))
    user = User.objects.get(pk=uid)

    if account_activation_token.check_token(user, token):
        login(request, user)
        return redirect('vehicles', business_name=user.business.name)
    else:
        messages.error(request, "expired link, login failed")
        return redirect('manager-login')

def reset_password(request):
    if request.method == "POST":

        username = request.POST['username'].lower()
        email = request.POST["email"].lower()
        password = request.POST["password"]

        if username and email:
            user = User.objects.filter(username=username, email=email, is_active=True, is_manager=True).first()
        elif username:
            user = User.objects.filter(username=username, is_active=True, is_manager=True).first()
        elif email:
            user = User.objects.filter(email=email, is_active=True, is_manager=True).first()
        else:
            messages.error(request, "Enter your username or email")
            return redirect('reset-password')

        """
        #####
        Reference to: Django_tutorials/15_Django-email-confirm at main · pythonlessons/Django_tutorials, 2022
        Django_tutorials/15_Django-email-confirm at main · pythonlessons/Django_tutorials, 2022
        """
        if user and user.is_manager:
            subject = "Password Reset"
            url = render_to_string('emails/password_reset_email.html', {
                ##### get the current domain
                'domain': get_current_site(request).domain,
                ##### get the user id and encode it, then convert the byte code to base64 encoding for transmitting the binary data
                'uid': urlsafe_base64_encode(force_bytes(user.pk)),
                ##### generate a special user token
                'token': account_activation_token.make_token(user),
                ##### input the protocol used
                "protocol": "http",
            })
            ##### construct and email
            plain_message = strip_tags(url)
            email = EmailMultiAlternatives(subject, plain_message, to=[user.email])
            email.attach_alternative(url, "text/html")
            if email.send():
                messages.success(request, "A Link was sent by email. It will expire in 1 minute.")
                return redirect('reset-password')
            else:
                messages.error(request, "email was not sent")
                return redirect('reset-password')
        else:
            messages.error(request, "Invalid credentials.")
            return redirect('reset-password')
    else:
        return render(request, 'reset_password.html', {})
def password_reset(request, uidb64, token):
    """
    #####
    When user clicks the activation link sent by email:
        1- encoded user id is decoded and used to get the user object
        2- check if the token is valid
        3- load a page where the user can input his new password
    """
    User = get_user_model()

    uid = force_str(urlsafe_base64_decode(uidb64))
    user = User.objects.get(pk=uid)

    if account_activation_token.check_token(user, token):
        id = force_str(urlsafe_base64_decode(uidb64))
        return render(request, 'new_password.html', {
            'user_id': id,
        })

    else:
        messages.error(request, "expired link, account password cannot be reset")
        return redirect('reset-password')
    # can only be accessed with token so secured
def new_password(request, user_id):

    if request.method == "POST":
        password = request.POST['password']
        confirmed_password = request.POST['confirmed-password']
        ##### get the id of the user that will change his password
        id = user_id

        """
        #####
        perform some checks to approve password strength
        """
        if password != confirmed_password:
            messages.error(request, "passwords are different")
            return render(request, "new_password.html", {
                "user_id": id,
            })  #######
        # if len(password) < 8:
        #     return render(request, "manager/new_password.html", {
        #         "message": "Password must be at least 8 characters.",
        #         "user_id": id,
        #         "suggested_password": None,
        #     })
        #
        # letter_exists = False
        # number_exists = False
        # special_character_exists = False
        #
        # if password:
        #     for i in password:
        #         if i in string.ascii_letters:
        #             letter_exists = True
        #         elif i in string.digits:
        #             number_exists = True
        #         elif i in string.punctuation:
        #             special_character_exists = True
        #
        #     if not letter_exists:
        #         return render(request, "manager/new_password.html", {
        #             "message": "Password should contain at least one letter",
        #             "user_id": id,
        #             "suggested_password": None,
        #         })
        #
        #     if not number_exists:
        #         return render(request, "manager/new_password.html", {
        #             "message": "Password should contain at least one number",
        #             "user_id": id,
        #             "suggested_password": None,
        #         })
        #
        #     if not special_character_exists:
        #         return render(request, "manager/new_password.html", {
        #             "message": "Password should contain at least one special character",
        #             "user_id": id,
        #             "suggested_password": None,
        #         })
        #
        # else:
        #     return render(request, "manager/new_password.html", {
        #         "message": "Password must not be empty",
        #         "user_id": id,
        #         "suggested_password": None,
        #     })

        """
        #####
        If all checks are passed then change the password and redirect to login page
        """
        user = User.objects.get(pk=id)
        user.set_password(password)
        user.save()
        messages.success(request, "Password successfully changed")
        return redirect('manager-login')

    elif request.user.is_authenticated:
        if request.user.is_superuser:
            return render(request, "admin_change_password.html", {
                "user_id": user_id,
            })

        else:
            messages.error(request, "Forbidden")
            return redirect('vehicles', business_name=request.user.business.name)
    else:
        messages.error(request, "Unauthorized: You are not logged in, please log in.")
        return redirect(reverse('user-login'))

def reset_email(request):
    """
    Handle email reset request:
    1. Verify current password
    2. Get new email address
    3. Send verification email to new address
    """
    if request.method == "POST":
        username = request.POST['username'].lower()
        current_password = request.POST['current_password']
        new_email = request.POST['new_email'].lower()
        backup_email = request.POST['backup_email'].lower()
        
        # Find user by username
        user = User.objects.filter(username=username, is_active=True, is_manager=True, backup_email=backup_email).first()
        
        if user:
            # Verify current password
            if user.check_password(current_password):
                # Check if new email is already in use
                if User.objects.filter(email=new_email).exclude(pk=user.pk).exists():
                    messages.error(request, "This email is already in use by another account.")
                    return redirect('reset-email')
                
                # Store the new email in session for verification
                request.session['pending_email_reset'] = {
                    'user_id': user.pk,
                    'new_email': new_email
                }
                
                # Send verification email to new address
                subject = "Backup email verification"
                url = render_to_string('emails/email_backup_verification.html', {
                    'domain': get_current_site(request).domain,
                    'uid': urlsafe_base64_encode(force_bytes(user.pk)),
                    'token': account_activation_token.make_token(user),
                    'protocol': "http",
                })
                
                plain_message = strip_tags(url)
                email = EmailMultiAlternatives(subject, plain_message, to=[backup_email])
                email.attach_alternative(url, "text/html")
                if email.send():
                    messages.success(request, "A verification link has been sent to your backup email address. It will expire in 1 minute.")
                    return redirect('reset-email')
                else:
                    messages.error(request, "Email could not be sent to backup email address. Please try again.")
                    return redirect('reset-email')
            else:
                messages.error(request, "Invalid current password.")
                return redirect('reset-email')
        else:
            messages.error(request, "Invalid username or backup email.")
            return redirect('reset-email')
    else:
        return render(request, 'reset_email.html', {})


def new_email_verification_and_email_changing(request, uidb64, token):
    User = get_user_model()

    try:
        uid = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.get(pk=uid)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        user = None

    if user and account_activation_token.check_token(user, token):
        pending_email_reset = request.session.get('pending_email_reset', {})
        if pending_email_reset.get('user_id') == user.pk:
            new_email = pending_email_reset.get('new_email')
        subject = "New email verification"
        url = render_to_string('emails/email_reset_verification.html', {
            'domain': get_current_site(request).domain,
            'uid': urlsafe_base64_encode(force_bytes(user.pk)),
            'token': account_activation_token.make_token(user),
            'protocol': "http",
        })

        plain_message = strip_tags(url)
        email = EmailMultiAlternatives(subject, plain_message, to=[new_email])
        email.attach_alternative(url, "text/html")
        if email.send():
            messages.success(request,"A verification link has been sent to your New email address. It will expire in 1 minute.")
            return redirect('reset-email')
        else:
            messages.error(request, "Email could not be sent to new email address. Please try again.")
            return redirect('reset-email')
    else:
        messages.error(request, "Invalid or expired verification link.")
        return redirect('reset-email')

def verify_email_reset(request, uidb64, token):
    """
    Handle email reset verification:
    1. Verify token
    2. Update user email
    3. Logout user (since credentials changed)
    4. Redirect to login
    """
    User = get_user_model()
    
    try:
        uid = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.get(pk=uid)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        user = None
    
    if user and account_activation_token.check_token(user, token):
        # Get the new email from session
        pending_email_reset = request.session.get('pending_email_reset', {})
        
        if pending_email_reset.get('user_id') == user.pk:
            new_email = pending_email_reset.get('new_email')
            
            if new_email:
                # Update user email
                user.email = new_email
                user.save()
                
                # Clear the session data
                del request.session['pending_email_reset']
                
                # Logout the user since their credentials have changed
                logout(request)
                
                messages.success(request, "Email successfully updated. Please log in with your new email address.")
                return redirect('manager-login')
            else:
                messages.error(request, "Invalid verification data. Please try again.")
                return redirect('reset-email')
        else:
            messages.error(request, "Invalid verification session. Please try again.")
            return redirect('reset-email')
    else:
        messages.error(request, "Invalid or expired verification link.")
        return redirect('reset-email')


def verify_email_address(request, user_id):
    if request.method == "POST":
        new_email = request.POST['new_email']

        id = user_id


        user = User.objects.get(pk=id)
        if user and user.is_manager:
            subject = "New email verification"
            url = render_to_string('emails/verify_email.html', {
                ##### get the current domain
                'domain': get_current_site(request).domain,
                ##### get the user id and encode it, then convert the byte code to base64 encoding for transmitting the binary data
                'uid': urlsafe_base64_encode(force_bytes(user.pk)),
                'uemail': urlsafe_base64_encode(force_bytes(new_email)),
                ##### generate a special user token
                'token': account_activation_token.make_token(user),
                ##### input the protocol used
                "protocol": "http",
            })
            ##### construct and email
            plain_message = strip_tags(url)
            email = EmailMultiAlternatives(subject, plain_message, to=[new_email])
            email.attach_alternative(url, "text/html")
            if email.send():
                messages.success(request, "A Link was sent by email. It will expire in 1 minute.")
                return redirect('manager-login')
            else:
                messages.error(request, "email was not sent")
                return redirect('manager-login')
        else:
            messages.error(request, "Invalid credentials.")
            return redirect('reset-password')
def verify_backup_email_address(request, user_id):
    if request.method == "POST":
        new_backup_email = request.POST['new_backup_email']

        id = user_id


        user = User.objects.get(pk=id)
        if user and user.is_manager:
            subject = "New backup email verification"
            url = render_to_string('emails/verify_backup_email.html', {
                ##### get the current domain
                'domain': get_current_site(request).domain,
                ##### get the user id and encode it, then convert the byte code to base64 encoding for transmitting the binary data
                'uid': urlsafe_base64_encode(force_bytes(user.pk)),
                'uemail': urlsafe_base64_encode(force_bytes(new_backup_email)),
                ##### generate a special user token
                'token': account_activation_token.make_token(user),
                ##### input the protocol used
                "protocol": "http",
            })
            ##### construct and email
            plain_message = strip_tags(url)
            email = EmailMultiAlternatives(subject, plain_message, to=[new_backup_email])
            email.attach_alternative(url, "text/html")
            if email.send():
                messages.success(request, "A Link was sent by email. It will expire in 1 minute.")
                return redirect('manager-login')
            else:
                messages.error(request, "email was not sent")
                return redirect('manager-login')
        else:
            messages.error(request, "Invalid credentials.")
            return redirect('reset-password')
# can only be accessed with token so secured
def change_email(request, uidb64, token):

    User = get_user_model()

    uid = force_str(urlsafe_base64_decode(uidb64))
    user = User.objects.get(pk=uid)

    if account_activation_token.check_token(user, token):
        id = force_str(urlsafe_base64_decode(uidb64))

        return render(request, 'new_email_address.html', {
            'user_id': id,
        })



    else:
        messages.error(request, "expired link, account password cannot be reset")
        return redirect('manager-login')
def change_backup_email(request, uidb64, token):
    User = get_user_model()

    uid = force_str(urlsafe_base64_decode(uidb64))
    user = User.objects.get(pk=uid)

    if account_activation_token.check_token(user, token):
        id = force_str(urlsafe_base64_decode(uidb64))

        return render(request, 'new_backup_email_address.html', {
            'user_id': id,
        })
def change_email_address(request, uidb64, uemail64, token):

    User = get_user_model()

    uid = force_str(urlsafe_base64_decode(uidb64))
    uemail = force_str(urlsafe_base64_decode(uemail64))
    user = User.objects.get(pk=uid)

    if account_activation_token.check_token(user, token):
        user.email = uemail
        user.save()
        messages.success(request, "Email successfully changed")
        return redirect('manager-login')
    else:
        messages.error(request, "expired link, account password cannot be reset")
        return redirect('manager-login')
def change_backup_email_address(request, uidb64, uemail64, token):

    User = get_user_model()

    uid = force_str(urlsafe_base64_decode(uidb64))
    uemail = force_str(urlsafe_base64_decode(uemail64))
    user = User.objects.get(pk=uid)

    if account_activation_token.check_token(user, token):
        user.backup_email = uemail
        user.save()
        messages.success(request, "Backup email successfully changed")
        return redirect('users-management', business_name = user.business.name)
    else:
        messages.error(request, "expired link, account backup email cannot be reset")
        return redirect('users-management', business_name = user.business.name)
################################################################

def add_legal_entity(request, business_name):
    """Add a new legal entity to the business"""
    if request.user.is_authenticated and request.user.business.name == business_name:
        if request.method == 'POST':
            # New required fields (front-end now sends these)
            name = request.POST.get('name', '').strip()
            # Address fields (required per user request)
            address_street = request.POST.get('address_street', '').strip()
            address_street_number = request.POST.get('address_street_number', '').strip()
            address_postal_code = request.POST.get('address_postal_code', '').strip()
            address_city = request.POST.get('address_city', '').strip()
            address_country = request.POST.get('address_country', '').strip()

            email = request.POST.get('email', '').strip()
            phone_number = request.POST.get('phone_number', '').strip()
            entity_type = request.POST.get('type', 'individual').strip()
            
            # Tax Identification Number - required for companies
            tax_identification_number = request.POST.get('tax_identification_number', '').strip()

            # Validate required fields
            missing = []
            if not name:
                missing.append('name')
            if not address_street:
                missing.append('address_street')
            if not address_street_number:
                missing.append('address_street_number')
            if not address_postal_code:
                missing.append('address_postal_code')
            if not address_city:
                missing.append('address_city')
            if not address_country:
                missing.append('address_country')
            
            # Tax ID is required for companies
            if entity_type == 'company' and not tax_identification_number:
                missing.append('tax_identification_number')

            if missing:
                messages.error(request, 'Required fields missing: ' + ', '.join(missing))
                return JsonResponse({'success': False, 'message': 'Required fields missing: ' + ', '.join(missing)})

            # Convert street number to integer if possible
            try:
                street_number_int = int(address_street_number)
            except Exception:
                messages.error(request, 'Street number must be a number')
                return JsonResponse({'success': False, 'message': 'Street number must be a number'})

            try:
                legal_entity = LegalEntity.objects.create(
                    name=name,
                    address_street=address_street or None,
                    address_street_number=street_number_int,
                    address_postal_code=address_postal_code or None,
                    address_city=address_city or None,
                    address_country=address_country or None,
                    email=email or None,
                    phone_number=phone_number or None,
                    type=entity_type,
                    tax_identification_number=tax_identification_number or None,
                    business=request.user.business
                )
                messages.success(request, f'Legal entity "{legal_entity}" added successfully!')
                return JsonResponse({'success': True, 'message': f'Legal entity "{legal_entity}" added successfully!', 'id': legal_entity.id, 'name': str(legal_entity)})
            except Exception as e:
                messages.error(request, f'Error adding legal entity: {str(e)}')
                return JsonResponse({'success': False, 'message': f'Error adding legal entity: {str(e)}'})
        else:
            return JsonResponse({'success': False, 'message': 'Invalid request method'})
    else:
        return JsonResponse({'success': False, 'message': 'Unauthorized'})

def get_subcategories(request, business_name):
    """AJAX endpoint to get subcategories for a specific category (uses business_name for access control).
    
    Supports both:
    1. New FK-based Category/Subcategory models (by category_id)
    2. Legacy hardcoded CATEGORIES_SUBCATEGORIES_CHOICES (by category value)
    """
    # Ensure the user is authenticated and belongs to the requested business
    if request.user.is_authenticated:
        if hasattr(request.user, 'business') and request.user.business.name == business_name:
            category_param = request.GET.get('category')
            category_id = request.GET.get('category_id')
            
            if category_id:
                # New FK-based lookup by category_id
                try:
                    category = Category.objects.get(id=category_id, business=request.user.business)
                    subcategories = Subcategory.objects.filter(
                        category=category, 
                        business=request.user.business, 
                        is_active=True
                    ).values_list('name', flat=True)
                    return JsonResponse({'subcategories': list(subcategories)})
                except Category.DoesNotExist:
                    return JsonResponse({'subcategories': []})
            elif category_param:
                # Legacy lookup by category value (for backwards compatibility)
                # First check if there's a Category FK with this name
                try:
                    category = Category.objects.get(name__iexact=category_param, business=request.user.business, is_active=True)
                    subcategories = Subcategory.objects.filter(
                        category=category, 
                        business=request.user.business, 
                        is_active=True
                    ).values_list('name', flat=True)
                    if subcategories.exists():
                        return JsonResponse({'subcategories': list(subcategories)})
                except Category.DoesNotExist:
                    pass
                
                # Fall back to hardcoded mapping
                subcats = get_subcategories_for_category(category_param)
                subcategories_list = [s for s, _ in subcats]
                return JsonResponse({'subcategories': subcategories_list})
            return JsonResponse({'subcategories': []})
        else:
            # Forbidden access for wrong business
            return JsonResponse({'subcategories': []}, status=403)
    else:
        # Not authenticated
        return JsonResponse({'subcategories': []})

from django.views.decorators.http import require_POST
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404
from django.utils.translation import gettext as _

@login_required
@require_POST
def change_vehicle_status(request, business_name, vehicle_internal_id):
    """Change a vehicle's status.

    Expects POST data:
    - status: the new status value (str)
    - next: optional URL to redirect to after success

    Security/validation:
    - user must belong to the business in the URL
    - status must be a known allowed status
    - setting to 'sold' requires mandatory sale fields to be present on the vehicle

    Returns a redirect to `next` (or vehicle edit/details page if not provided).
    """
    user = request.user
    # Basic ownership/permission check
    if not hasattr(user, 'business') or user.business.name != business_name:
        messages.error(request, _("You don't have permission to change this vehicle."))
        return redirect('vehicles', business_name=getattr(user.business, 'name', ''))

    vehicle = get_object_or_404(Vehicle, internal_id=vehicle_internal_id, business=user.business)

    new_status = request.POST.get('status')
    # default to the vehicle edit/details page for this vehicle
    next_url = request.POST.get('next') or reverse('vehicle-details', args=[user.business.name, vehicle_internal_id])

    # Allowed statuses (extend if your app uses others)
    ALLOWED_STATUSES = {'purchased', 'ready_for_sale', 'reserved', 'sold', 'inactive'}

    if new_status not in ALLOWED_STATUSES:
        messages.error(request, _("Invalid status value."))
        return redirect(next_url)

    # If setting to sold, ensure mandatory sale fields exist
    if new_status == 'sold':
        if not (vehicle.sale_price and (vehicle.sale_price_taxes is not None) and vehicle.sale_date and vehicle.sale_delivery_collection_date and vehicle.sale_payment_method and vehicle.buyer):
            messages.error(request, _("Complete all sale details before marking the vehicle as sold."))
            return redirect(next_url)

    # Perform update
    vehicle.status = new_status
    vehicle.save()

    messages.success(request, _("Vehicle status updated to %(status)s") % {'status': new_status})
    return redirect(next_url)

def get_manufacturer_models(request):
    """Return manufacturer_models for a specific manufacturer via AJAX"""
    manufacturer = request.GET.get('manufacturer')
    if manufacturer:
        # Normalize manufacturer to helper key format
        key = str(manufacturer).strip().lower()

        # Reuse helper which builds the static mapping and augments it from DB
        model_tuples = get_manufacturer_models_for_manufacturer(key)
        manufacturer_models = [m[0] for m in model_tuples]
        return JsonResponse({'manufacturer_models': manufacturer_models})

    return JsonResponse({'manufacturer_models': []})


################################################################
# Legal Entity Management Views
################################################################

def legal_entities(request, business_name):
    """List all legal entities for the business"""
    if request.user.is_authenticated:
        if request.user.business.name == business_name:
            # Access control: managers always have access, others need permission
            if request.user.is_manager or request.user.legal_entities_access:
                user = request.user
                
                # Get all legal entities for this business
                legal_entities_queryset = LegalEntity.objects.filter(business=user.business)
                
                # Apply filters from GET params
                type_filter = request.GET.get('type')
                status_filter = request.GET.get('status')
                search = request.GET.get('search', '').strip()
                
                if type_filter:
                    legal_entities_queryset = legal_entities_queryset.filter(type=type_filter)
                if status_filter:
                    legal_entities_queryset = legal_entities_queryset.filter(status=status_filter)
                if search:
                    legal_entities_queryset = legal_entities_queryset.filter(name__icontains=search)
                
                return render(request, 'legal_entities.html', {
                    'user': user,
                    'legal_entities': legal_entities_queryset,
                    'total_count': legal_entities_queryset.count(),
                    'type_choices': LegalEntity.TYPE_CHOICES,
                    'status_choices': LegalEntity.STATE_CHOICES,
                    'filter_type': type_filter,
                    'filter_status': status_filter,
                    'search': search,
                })
            else:
                messages.error(request, 'You do not have permission to view legal entities.')
                return redirect('vehicles', business_name=business_name)
        else:
            return redirect('vehicles', business_name=request.user.business.name)
    else:
        return redirect('user-login')


def add_new_legal_entity(request, business_name):
    """Add a new legal entity via form page"""
    if request.user.is_authenticated:
        if request.user.business.name == business_name:
            if request.user.is_manager or request.user.legal_entities_access:
                user = request.user
                empty_mandatory_fields_errors = {}
                
                if request.method == 'POST':
                    name = request.POST.get('name', '').strip()
                    entity_type = request.POST.get('type', 'individual').strip()
                    tax_identification_number = request.POST.get('tax_identification_number', '').strip()
                    address_street = request.POST.get('address_street', '').strip()
                    address_street_number = request.POST.get('address_street_number', '').strip()
                    address_postal_code = request.POST.get('address_postal_code', '').strip()
                    address_city = request.POST.get('address_city', '').strip()
                    address_country = request.POST.get('address_country', '').strip()
                    email = request.POST.get('email', '').strip()
                    phone_number = request.POST.get('phone_number', '').strip()
                    
                    # Validate required fields
                    if not name:
                        empty_mandatory_fields_errors['name'] = 'Name is required'
                    if not address_street:
                        empty_mandatory_fields_errors['address_street'] = 'Street is required'
                    if not address_street_number:
                        empty_mandatory_fields_errors['address_street_number'] = 'Street number is required'
                    if not address_postal_code:
                        empty_mandatory_fields_errors['address_postal_code'] = 'Postal code is required'
                    if not address_city:
                        empty_mandatory_fields_errors['address_city'] = 'City is required'
                    if not address_country:
                        empty_mandatory_fields_errors['address_country'] = 'Country is required'
                    if entity_type == 'company' and not tax_identification_number:
                        empty_mandatory_fields_errors['tax_identification_number'] = 'Tax ID is required for companies'
                    
                    if empty_mandatory_fields_errors:
                        messages.error(request, 'Please fill in all required fields.')
                        return render(request, 'add_new_legal_entity.html', {
                            'user': user,
                            'empty_mandatory_fields_errors': empty_mandatory_fields_errors,
                            'type_choices': LegalEntity.TYPE_CHOICES,
                        })
                    
                    try:
                        street_number_int = int(address_street_number)
                    except ValueError:
                        empty_mandatory_fields_errors['address_street_number'] = 'Street number must be a number'
                        messages.error(request, 'Street number must be a number.')
                        return render(request, 'add_new_legal_entity.html', {
                            'user': user,
                            'empty_mandatory_fields_errors': empty_mandatory_fields_errors,
                            'type_choices': LegalEntity.TYPE_CHOICES,
                        })
                    
                    try:
                        legal_entity = LegalEntity.objects.create(
                            name=name,
                            type=entity_type,
                            tax_identification_number=tax_identification_number or None,
                            address_street=address_street,
                            address_street_number=street_number_int,
                            address_postal_code=address_postal_code,
                            address_city=address_city,
                            address_country=address_country,
                            email=email or None,
                            phone_number=phone_number or None,
                            business=user.business,
                        )
                        messages.success(request, f'Legal entity "{legal_entity.name}" created successfully!')
                        return redirect('legal-entity-details', business_name=business_name, legal_entity_internal_id=legal_entity.internal_id)
                    except Exception as e:
                        messages.error(request, f'Error creating legal entity: {str(e)}')
                        return render(request, 'add_new_legal_entity.html', {
                            'user': user,
                            'empty_mandatory_fields_errors': empty_mandatory_fields_errors,
                            'type_choices': LegalEntity.TYPE_CHOICES,
                        })
                
                # GET request - show empty form
                return render(request, 'add_new_legal_entity.html', {
                    'user': user,
                    'empty_mandatory_fields_errors': {},
                    'type_choices': LegalEntity.TYPE_CHOICES,
                })
            else:
                messages.error(request, 'You do not have permission to add legal entities.')
                return redirect('legal-entities', business_name=business_name)
        else:
            return redirect('vehicles', business_name=request.user.business.name)
    else:
        return redirect('user-login')


def legal_entity_details(request, business_name, legal_entity_internal_id):
    """View and edit a legal entity"""
    if request.user.is_authenticated:
        if request.user.business.name == business_name:
            if request.user.is_manager or request.user.legal_entities_access:
                user = request.user
                
                try:
                    legal_entity = LegalEntity.objects.get(
                        business=user.business,
                        internal_id=legal_entity_internal_id
                    )
                except LegalEntity.DoesNotExist:
                    messages.error(request, 'Legal entity not found.')
                    return redirect('legal-entities', business_name=business_name)
                
                empty_mandatory_fields_errors = {}
                
                if request.method == 'POST':
                    name = request.POST.get('name', '').strip()
                    entity_type = request.POST.get('type', 'individual').strip()
                    tax_identification_number = request.POST.get('tax_identification_number', '').strip()
                    address_street = request.POST.get('address_street', '').strip()
                    address_street_number = request.POST.get('address_street_number', '').strip()
                    address_postal_code = request.POST.get('address_postal_code', '').strip()
                    address_city = request.POST.get('address_city', '').strip()
                    address_country = request.POST.get('address_country', '').strip()
                    email = request.POST.get('email', '').strip()
                    phone_number = request.POST.get('phone_number', '').strip()
                    
                    # Validate required fields
                    if not name:
                        empty_mandatory_fields_errors['name'] = 'Name is required'
                    if not address_street:
                        empty_mandatory_fields_errors['address_street'] = 'Street is required'
                    if not address_street_number:
                        empty_mandatory_fields_errors['address_street_number'] = 'Street number is required'
                    if not address_postal_code:
                        empty_mandatory_fields_errors['address_postal_code'] = 'Postal code is required'
                    if not address_city:
                        empty_mandatory_fields_errors['address_city'] = 'City is required'
                    if not address_country:
                        empty_mandatory_fields_errors['address_country'] = 'Country is required'
                    if entity_type == 'company' and not tax_identification_number:
                        empty_mandatory_fields_errors['tax_identification_number'] = 'Tax ID is required for companies'
                    
                    if empty_mandatory_fields_errors:
                        messages.error(request, 'Please fill in all required fields.')
                        return render(request, 'legal_entity_details.html', {
                            'user': user,
                            'legal_entity': legal_entity,
                            'empty_mandatory_fields_errors': empty_mandatory_fields_errors,
                            'type_choices': LegalEntity.TYPE_CHOICES,
                        })
                    
                    try:
                        street_number_int = int(address_street_number)
                    except ValueError:
                        empty_mandatory_fields_errors['address_street_number'] = 'Street number must be a number'
                        messages.error(request, 'Street number must be a number.')
                        return render(request, 'legal_entity_details.html', {
                            'user': user,
                            'legal_entity': legal_entity,
                            'empty_mandatory_fields_errors': empty_mandatory_fields_errors,
                            'type_choices': LegalEntity.TYPE_CHOICES,
                        })
                    
                    # Update the legal entity
                    legal_entity.name = name
                    legal_entity.type = entity_type
                    legal_entity.tax_identification_number = tax_identification_number or None
                    legal_entity.address_street = address_street
                    legal_entity.address_street_number = street_number_int
                    legal_entity.address_postal_code = address_postal_code
                    legal_entity.address_city = address_city
                    legal_entity.address_country = address_country
                    legal_entity.email = email or None
                    legal_entity.phone_number = phone_number or None
                    legal_entity.save()
                    
                    messages.success(request, f'Legal entity "{legal_entity.name}" updated successfully!')
                    return render(request, 'legal_entity_details.html', {
                        'user': user,
                        'legal_entity': legal_entity,
                        'empty_mandatory_fields_errors': {},
                        'type_choices': LegalEntity.TYPE_CHOICES,
                    })
                
                # GET request - show form with existing data
                return render(request, 'legal_entity_details.html', {
                    'user': user,
                    'legal_entity': legal_entity,
                    'empty_mandatory_fields_errors': {},
                    'type_choices': LegalEntity.TYPE_CHOICES,
                })
            else:
                messages.error(request, 'You do not have permission to view legal entities.')
                return redirect('legal-entities', business_name=business_name)
        else:
            return redirect('vehicles', business_name=request.user.business.name)
    else:
        return redirect('user-login')


def delete_legal_entity(request, business_name, legal_entity_internal_id):
    """Soft delete a legal entity (set status to inactive)"""
    if request.user.is_authenticated:
        if request.user.business.name == business_name:
            if request.user.is_manager or request.user.legal_entities_access:
                try:
                    legal_entity = LegalEntity.objects.get(
                        business=request.user.business,
                        internal_id=legal_entity_internal_id
                    )
                    legal_entity.status = 'inactive'
                    legal_entity.save()
                    messages.success(request, f'Legal entity "{legal_entity.name}" has been deactivated.')
                except LegalEntity.DoesNotExist:
                    messages.error(request, 'Legal entity not found.')
                return redirect('legal-entities', business_name=business_name)
            else:
                messages.error(request, 'You do not have permission to delete legal entities.')
                return redirect('legal-entities', business_name=business_name)
        else:
            return redirect('vehicles', business_name=request.user.business.name)
    else:
        return redirect('user-login')


def activate_legal_entity(request, business_name, legal_entity_internal_id):
    """Activate a legal entity (set status to active)"""
    if request.user.is_authenticated:
        if request.user.business.name == business_name:
            if request.user.is_manager or request.user.legal_entities_access:
                try:
                    legal_entity = LegalEntity.objects.get(
                        business=request.user.business,
                        internal_id=legal_entity_internal_id
                    )
                    legal_entity.status = 'active'
                    legal_entity.save()
                    messages.success(request, f'Legal entity "{legal_entity.name}" has been activated.')
                except LegalEntity.DoesNotExist:
                    messages.error(request, 'Legal entity not found.')
                return redirect('legal-entity-details', business_name=business_name, legal_entity_internal_id=legal_entity_internal_id)
            else:
                messages.error(request, 'You do not have permission to activate legal entities.')
                return redirect('legal-entities', business_name=business_name)
        else:
            return redirect('vehicles', business_name=request.user.business.name)
    else:
        return redirect('user-login')


################################################################
# Dynamic Choice Management Views
################################################################

def add_dynamic_choice(request, business_name):
    """AJAX endpoint for creating new choice options dynamically"""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'message': 'Method not allowed'}, status=405)
    
    if not request.user.is_authenticated:
        return JsonResponse({'success': False, 'message': 'Authentication required'}, status=401)
    
    if request.user.business.name != business_name:
        return JsonResponse({'success': False, 'message': 'Unauthorized'}, status=403)
    
    choice_type = request.POST.get('choice_type', '').strip()
    name = request.POST.get('name', '').strip()
    manufacturer_id = request.POST.get('manufacturer_id', '').strip()
    
    if not choice_type:
        return JsonResponse({'success': False, 'message': 'Choice type is required'})
    
    if not name:
        return JsonResponse({'success': False, 'message': 'Name is required'})
    
    # Special handling for manufacturer_model which requires manufacturer_id
    if choice_type == 'manufacturer_model':
        if not manufacturer_id:
            return JsonResponse({'success': False, 'message': 'Manufacturer is required for adding a model'})
        
        try:
            manufacturer = Manufacturer.objects.get(
                id=manufacturer_id,
                business=request.user.business,
                is_active=True
            )
        except Manufacturer.DoesNotExist:
            return JsonResponse({'success': False, 'message': 'Invalid manufacturer'})
        
        # Case-insensitive duplicate check for this manufacturer
        existing = ManufacturerModel.objects.filter(
            business=request.user.business,
            manufacturer=manufacturer,
            name__iexact=name
        ).first()
        
        if existing:
            return JsonResponse({
                'success': True,
                'id': existing.id,
                'name': existing.name,
                'is_existing': True,
                'message': 'Model already exists'
            })
        
        try:
            new_model = ManufacturerModel.objects.create(
                name=name,
                manufacturer=manufacturer,
                business=request.user.business,
                is_active=True
            )
            return JsonResponse({
                'success': True,
                'id': new_model.id,
                'name': new_model.name,
                'is_existing': False,
                'message': 'Model created successfully'
            })
        except Exception as e:
            return JsonResponse({'success': False, 'message': str(e)})
    
    # Map choice_type to model class for standard choices
    model_map = {
        'payment_method': PaymentMethod,
        'vehicle_type': VehicleType,
        'body_type': BodyType,
        'manufacturer': Manufacturer,
        'color': Color,
        'fuel_type': FuelType,
        'damage_type': DamageType,
        'doors': DoorsChoice,
        'tax_percentage': TaxPercentage,
        'category': Category,
        'subcategory': Subcategory,
        'currency': Currency,
    }
    
    model_class = model_map.get(choice_type)
    if not model_class:
        return JsonResponse({'success': False, 'message': f'Invalid choice type: {choice_type}'})
    
    # Case-insensitive duplicate check
    existing = model_class.objects.filter(
        business=request.user.business,
        name__iexact=name
    ).first()
    
    if existing:
        # If inactive, reactivate it
        if hasattr(existing, 'is_active') and not existing.is_active:
            existing.is_active = True
            existing.save()
            display_name = str(existing)  # Use __str__ which includes percentage for tax
            return JsonResponse({
                'success': True,
                'id': existing.id,
                'name': display_name,
                'is_existing': True,
                'was_reactivated': True,
                'message': 'Choice reactivated'
            })
        # Already active, just return it
        display_name = str(existing)
        return JsonResponse({
            'success': True,
            'id': existing.id,
            'name': display_name,
            'is_existing': True,
            'message': 'Choice already exists'
        })
    
    try:
        # Handle tax_percentage specially - needs percentage field
        if choice_type == 'tax_percentage':
            percentage = request.POST.get('percentage', '').strip()
            try:
                percentage_value = Decimal(percentage) if percentage else Decimal('0')
            except:
                percentage_value = Decimal('0')
            
            new_choice = model_class.objects.create(
                name=name,
                percentage=percentage_value,
                business=request.user.business,
                is_active=True,
                is_no_tax=(percentage_value == Decimal('0'))
            )
        elif choice_type == 'manufacturer_model':
            # Handle manufacturer_model - needs manufacturer FK
            manufacturer_id = request.POST.get('manufacturer_id', '').strip()
            if not manufacturer_id:
                return JsonResponse({'success': False, 'message': 'manufacturer_id is required for manufacturer_model'})
            
            try:
                manufacturer = Manufacturer.objects.get(id=manufacturer_id, business=request.user.business)
            except Manufacturer.DoesNotExist:
                return JsonResponse({'success': False, 'message': 'Manufacturer not found'})
            
            new_choice = model_class.objects.create(
                name=name,
                manufacturer=manufacturer,
                business=request.user.business,
                is_active=True
            )
        elif choice_type == 'subcategory':
            # Handle subcategory - needs category FK
            category_id = request.POST.get('category_id', '').strip()
            if not category_id:
                return JsonResponse({'success': False, 'message': 'category_id is required for subcategory'})
            
            try:
                category = Category.objects.get(id=category_id, business=request.user.business)
            except Category.DoesNotExist:
                return JsonResponse({'success': False, 'message': 'Category not found'})
            
            new_choice = model_class.objects.create(
                name=name,
                category=category,
                business=request.user.business,
                is_active=True
            )
        elif choice_type == 'currency':
            # Handle currency - needs code field
            code = request.POST.get('code', '').strip().upper()
            if not code:
                return JsonResponse({'success': False, 'message': 'Currency code is required'})
            
            new_choice = model_class.objects.create(
                name=name,
                code=code,
                business=request.user.business,
                is_active=True
            )
        else:
            new_choice = model_class.objects.create(
                name=name,
                business=request.user.business,
                is_active=True
            )
        
        display_name = str(new_choice)  # Use __str__ for formatted name
        return JsonResponse({
            'success': True,
            'id': new_choice.id,
            'name': display_name,
            'is_existing': False,
            'message': 'Choice created successfully'
        })
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)})



def deactivate_choice(request, business_name):
    """AJAX endpoint for deactivating (soft-deleting) a choice option"""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'message': 'Method not allowed'}, status=405)
    
    if not request.user.is_authenticated:
        return JsonResponse({'success': False, 'message': 'Authentication required'}, status=401)
    
    if request.user.business.name != business_name:
        return JsonResponse({'success': False, 'message': 'Unauthorized'}, status=403)
    
    choice_type = request.POST.get('choice_type', '').strip()
    choice_id = request.POST.get('choice_id', '').strip()
    
    if not choice_type or not choice_id:
        return JsonResponse({'success': False, 'message': 'choice_type and choice_id are required'})
    
    model_map = {
        'payment_method': PaymentMethod,
        'vehicle_type': VehicleType,
        'body_type': BodyType,
        'manufacturer': Manufacturer,
        'manufacturer_model': ManufacturerModel,
        'color': Color,
        'fuel_type': FuelType,
        'damage_type': DamageType,
        'doors': DoorsChoice,
        'tax_percentage': TaxPercentage,
        'category': Category,
        'subcategory': Subcategory,
        'currency': Currency,
    }
    
    model_class = model_map.get(choice_type)
    if not model_class:
        return JsonResponse({'success': False, 'message': f'Invalid choice type: {choice_type}'})
    
    try:
        choice = model_class.objects.get(id=choice_id, business=request.user.business)
        
        # Prevent deactivation of protected No Tax option
        if choice_type == 'tax_percentage' and hasattr(choice, 'is_no_tax') and choice.is_no_tax:
            return JsonResponse({'success': False, 'message': 'Cannot deactivate the No Tax option'})
        
        choice.is_active = False
        choice.save()
        
        return JsonResponse({'success': True, 'id': choice.id, 'message': 'Choice deactivated successfully'})
    except model_class.DoesNotExist:
        return JsonResponse({'success': False, 'message': 'Choice not found'})
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)})


def manage_choices(request, business_name):
    """Page for managing all choice options (add, deactivate, reactivate)"""
    if not request.user.is_authenticated:
        return redirect('user-login')
    
    if request.user.business.name != business_name:
        raise Http404()
    
    # Only managers can access this page
    if not request.user.is_manager:
        messages.error(request, 'Access denied. Manager privileges required.')
        return redirect('vehicles', business_name=business_name)
    
    business = request.user.business
    
    # Gather all choice types with active/inactive counts
    choice_types = {
        'manufacturer': {
            'name': 'Manufacturers',
            'active': list(Manufacturer.objects.filter(business=business, is_active=True).values('id', 'name')),
            'inactive': list(Manufacturer.objects.filter(business=business, is_active=False).values('id', 'name')),
        },
        'vehicle_type': {
            'name': 'Vehicle Types',
            'active': list(VehicleType.objects.filter(business=business, is_active=True).values('id', 'name')),
            'inactive': list(VehicleType.objects.filter(business=business, is_active=False).values('id', 'name')),
        },
        'body_type': {
            'name': 'Body Types',
            'active': list(BodyType.objects.filter(business=business, is_active=True).values('id', 'name')),
            'inactive': list(BodyType.objects.filter(business=business, is_active=False).values('id', 'name')),
        },
        'color': {
            'name': 'Colors',
            'active': list(Color.objects.filter(business=business, is_active=True).values('id', 'name')),
            'inactive': list(Color.objects.filter(business=business, is_active=False).values('id', 'name')),
        },
        'fuel_type': {
            'name': 'Fuel Types',
            'active': list(FuelType.objects.filter(business=business, is_active=True).values('id', 'name')),
            'inactive': list(FuelType.objects.filter(business=business, is_active=False).values('id', 'name')),
        },
        'damage_type': {
            'name': 'Damage Types',
            'active': list(DamageType.objects.filter(business=business, is_active=True).values('id', 'name')),
            'inactive': list(DamageType.objects.filter(business=business, is_active=False).values('id', 'name')),
        },
        'doors': {
            'name': 'Door Options',
            'active': list(DoorsChoice.objects.filter(business=business, is_active=True).values('id', 'name')),
            'inactive': list(DoorsChoice.objects.filter(business=business, is_active=False).values('id', 'name')),
        },
        'payment_method': {
            'name': 'Payment Methods',
            'active': list(PaymentMethod.objects.filter(business=business, is_active=True).values('id', 'name')),
            'inactive': list(PaymentMethod.objects.filter(business=business, is_active=False).values('id', 'name')),
        },
        'tax_percentage': {
            'name': 'Tax Percentages',
            'active': [{'id': t.id, 'name': str(t), 'is_protected': t.is_no_tax} for t in TaxPercentage.objects.filter(business=business, is_active=True)],
            'inactive': [{'id': t.id, 'name': str(t), 'is_protected': t.is_no_tax} for t in TaxPercentage.objects.filter(business=business, is_active=False)],
        },
        'currency': {
            'name': 'Currencies',
            'active': [{'id': c.id, 'name': str(c)} for c in Currency.objects.filter(business=business, is_active=True)],
            'inactive': [{'id': c.id, 'name': str(c)} for c in Currency.objects.filter(business=business, is_active=False)],
        },
        'category': {
            'name': 'Categories',
            'active': list(Category.objects.filter(business=business, is_active=True).values('id', 'name')),
            'inactive': list(Category.objects.filter(business=business, is_active=False).values('id', 'name')),
        },
    }
    
    # Get manufacturers with their models for parent-child management
    manufacturers_with_models = []
    for manu in Manufacturer.objects.filter(business=business, is_active=True).order_by('name'):
        models_active = list(ManufacturerModel.objects.filter(manufacturer=manu, is_active=True).values('id', 'name'))
        models_inactive = list(ManufacturerModel.objects.filter(manufacturer=manu, is_active=False).values('id', 'name'))
        manufacturers_with_models.append({
            'id': manu.id,
            'name': manu.name,
            'models_active': models_active,
            'models_inactive': models_inactive,
        })
    
    # Get categories with their subcategories for parent-child management
    categories_with_subcategories = []
    for cat in Category.objects.filter(business=business, is_active=True).order_by('name'):
        subs_active = list(Subcategory.objects.filter(category=cat, is_active=True).values('id', 'name'))
        subs_inactive = list(Subcategory.objects.filter(category=cat, is_active=False).values('id', 'name'))
        categories_with_subcategories.append({
            'id': cat.id,
            'name': cat.name,
            'subs_active': subs_active,
            'subs_inactive': subs_inactive,
        })
    
    context = {
        'choice_types': choice_types,
        'manufacturers_with_models': manufacturers_with_models,
        'categories_with_subcategories': categories_with_subcategories,
        'page_title': 'Manage Choices',
    }
    
    return render(request, 'manage_choices.html', context)


def reactivate_choice(request, business_name):
    """AJAX endpoint for reactivating a deactivated choice option"""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'message': 'Method not allowed'}, status=405)
    
    if not request.user.is_authenticated:
        return JsonResponse({'success': False, 'message': 'Authentication required'}, status=401)
    
    if request.user.business.name != business_name:
        return JsonResponse({'success': False, 'message': 'Unauthorized'}, status=403)
    
    choice_type = request.POST.get('choice_type', '').strip()
    choice_id = request.POST.get('choice_id', '').strip()
    
    if not choice_type or not choice_id:
        return JsonResponse({'success': False, 'message': 'choice_type and choice_id are required'})
    
    model_map = {
        'payment_method': PaymentMethod,
        'vehicle_type': VehicleType,
        'body_type': BodyType,
        'manufacturer': Manufacturer,
        'manufacturer_model': ManufacturerModel,
        'color': Color,
        'fuel_type': FuelType,
        'damage_type': DamageType,
        'doors': DoorsChoice,
        'tax_percentage': TaxPercentage,
        'category': Category,
        'subcategory': Subcategory,
        'currency': Currency,
    }
    
    model_class = model_map.get(choice_type)
    if not model_class:
        return JsonResponse({'success': False, 'message': f'Invalid choice type: {choice_type}'})
    
    try:
        choice = model_class.objects.get(id=choice_id, business=request.user.business)
        choice.is_active = True
        choice.save()
        
        return JsonResponse({'success': True, 'id': choice.id, 'name': str(choice), 'message': 'Choice reactivated successfully'})
    except model_class.DoesNotExist:
        return JsonResponse({'success': False, 'message': 'Choice not found'})
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)})


