"""
ACAR Dealership OS - Choices Seeder Service
===========================================
Populates all baseline and standard choices for a dealership business:
  Tier 1: mobile.de Marketplace Choices (Makes, Models, Body Types, Colors, Fuel Types, Doors, Vehicle Types)
          Protected and mapped to official mobile.de codes.
  Tier 2: ACAR-Internal Choices (Countries, Cities, Payment Methods, Tax Percentages,
          Damage Types, Categories, Subcategories, Key Numbers)
          Defaults customizable by dealership management.

Safety:
  - Idempotent: Safe to run multiple times without duplicating or corrupting existing data.
  - Non-destructive: Never deletes existing custom choices added by dealers.
  - Upgrading: Existing choices matching standard names are upgraded with official
    mobile.de codes, vehicle classes, and protected status.
"""

import os
import json
import logging
from decimal import Decimal
from django.conf import settings
from django.db import transaction

from manager.models import (
    Business, Make, VehicleModel, BodyType, Color, FuelType, DoorsChoice,
    Country, City, PaymentMethod, TaxPercentage, VehicleType, DamageType,
    Category, Subcategory, KeyNumber
)
from manager.services.mobile_de_service import (
    OFFICIAL_MOBILE_DE_CLASSES,
    OFFICIAL_MOBILE_DE_FUELS,
    OFFICIAL_MOBILE_DE_BODIES,
    OFFICIAL_MOBILE_DE_COLORS,
    OFFICIAL_MOBILE_DE_DOORS,
    KNOWN_MAKE_CLASSES,
    seed_official_mobile_de_choices,
)

logger = logging.getLogger(__name__)

# Fallback base makes if JSON catalog is not found
OFFICIAL_MOBILE_DE_MAKES = [
    {"name": "Abarth", "code": "ABARTH"},
    {"name": "Aiways", "code": "AIWAYS"},
    {"name": "Alfa Romeo", "code": "ALFA_ROMEO"},
    {"name": "Alpine", "code": "ALPINE"},
    {"name": "Aston Martin", "code": "ASTON_MARTIN"},
    {"name": "Audi", "code": "AUDI"},
    {"name": "Bentley", "code": "BENTLEY"},
    {"name": "BMW", "code": "BMW"},
    {"name": "Bugatti", "code": "BUGATTI"},
    {"name": "BYD", "code": "BYD"},
    {"name": "Cadillac", "code": "CADILLAC"},
    {"name": "Chevrolet", "code": "CHEVROLET"},
    {"name": "Chrysler", "code": "CHRYSLER"},
    {"name": "Citroën", "code": "CITROEN"},
    {"name": "Cupra", "code": "CUPRA"},
    {"name": "Dacia", "code": "DACIA"},
    {"name": "Daewoo", "code": "DAEWOO"},
    {"name": "Daihatsu", "code": "DAIHATSU"},
    {"name": "Dodge", "code": "DODGE"},
    {"name": "DS Automobiles", "code": "DS"},
    {"name": "Ferrari", "code": "FERRARI"},
    {"name": "Fiat", "code": "FIAT"},
    {"name": "Ford", "code": "FORD"},
    {"name": "Genesis", "code": "GENESIS"},
    {"name": "GMC", "code": "GMC"},
    {"name": "Honda", "code": "HONDA"},
    {"name": "Hummer", "code": "HUMMER"},
    {"name": "Hyundai", "code": "HYUNDAI"},
    {"name": "Infiniti", "code": "INFINITI"},
    {"name": "Isuzu", "code": "ISUZU"},
    {"name": "Iveco", "code": "IVECO"},
    {"name": "Jaguar", "code": "JAGUAR"},
    {"name": "Jeep", "code": "JEEP"},
    {"name": "Kia", "code": "KIA"},
    {"name": "Lada", "code": "LADA"},
    {"name": "Lamborghini", "code": "LAMBORGHINI"},
    {"name": "Lancia", "code": "LANCIA"},
    {"name": "Land Rover", "code": "LAND_ROVER"},
    {"name": "Lexus", "code": "LEXUS"},
    {"name": "Lotus", "code": "LOTUS"},
    {"name": "Lynk & Co", "code": "LYNK_CO"},
    {"name": "Maserati", "code": "MASERATI"},
    {"name": "Maxus", "code": "MAXUS"},
    {"name": "Maybach", "code": "MAYBACH"},
    {"name": "Mazda", "code": "MAZDA"},
    {"name": "McLaren", "code": "MCLAREN"},
    {"name": "Mercedes-Benz", "code": "MERCEDES_BENZ"},
    {"name": "MG", "code": "MG"},
    {"name": "Mini", "code": "MINI"},
    {"name": "Mitsubishi", "code": "MITSUBISHI"},
    {"name": "Morgan", "code": "MORGAN"},
    {"name": "NIO", "code": "NIO"},
    {"name": "Nissan", "code": "NISSAN"},
    {"name": "Opel", "code": "OPEL"},
    {"name": "ORA", "code": "GWM_ORA"},
    {"name": "Peugeot", "code": "PEUGEOT"},
    {"name": "Polestar", "code": "POLESTAR"},
    {"name": "Pontiac", "code": "PONTIAC"},
    {"name": "Porsche", "code": "PORSCHE"},
    {"name": "Renault", "code": "RENAULT"},
    {"name": "Rolls-Royce", "code": "ROLLS_ROYCE"},
    {"name": "Rover", "code": "ROVER"},
    {"name": "Saab", "code": "SAAB"},
    {"name": "SEAT", "code": "SEAT"},
    {"name": "Skoda", "code": "SKODA"},
    {"name": "Smart", "code": "SMART"},
    {"name": "SsangYong", "code": "SSANGYONG"},
    {"name": "Subaru", "code": "SUBARU"},
    {"name": "Suzuki", "code": "SUZUKI"},
    {"name": "Tesla", "code": "TESLA"},
    {"name": "Toyota", "code": "TOYOTA"},
    {"name": "Triumph", "code": "TRIUMPH"},
    {"name": "TVR", "code": "TVR"},
    {"name": "Volkswagen", "code": "VOLKSWAGEN"},
    {"name": "Volvo", "code": "VOLVO"},
    {"name": "Wey", "code": "GWM_WEY"},
    {"name": "Wiesmann", "code": "WIESMANN"},
    {"name": "XPeng", "code": "XPENG"},
    {"name": "Sonstige", "code": "Sonstige"},
]

OFFICIAL_MODELS_BY_MAKE = {
    "BMW": [
        "1 Series", "116", "118", "120", "125", "128ti", "M135i", "M140i",
        "2 Series", "218", "220", "225", "230", "M235i", "M240i", "M2",
        "3 Series", "316", "318", "320", "325", "328", "330", "335", "340", "M340i", "M3",
        "4 Series", "420", "425", "428", "430", "435", "440", "M440i", "M4",
        "5 Series", "520", "523", "525", "528", "530", "535", "540", "545", "550", "M550i", "M5",
        "6 Series", "630", "640", "650", "M6",
        "7 Series", "730", "740", "745", "750", "760", "M760Li",
        "8 Series", "840", "850", "M850i", "M8",
        "X1", "X2", "X3", "X3 M", "X4", "X4 M", "X5", "X5 M", "X6", "X6 M", "X7", "XM",
        "Z3", "Z4", "Z4 M",
        "i3", "i4", "i7", "i8", "iX", "iX1", "iX2", "iX3",
    ],
    "Mercedes-Benz": [
        "A-Class", "A 160", "A 180", "A 200", "A 220", "A 250", "A 35 AMG", "A 45 AMG",
        "B-Class", "B 160", "B 180", "B 200", "B 220", "B 250",
        "C-Class", "C 180", "C 200", "C 220", "C 250", "C 300", "C 350", "C 400", "C 43 AMG", "C 63 AMG",
        "CLA", "CLA 180", "CLA 200", "CLA 220", "CLA 250", "CLA 35 AMG", "CLA 45 AMG",
        "CLS", "CLS 220", "CLS 250", "CLS 300", "CLS 350", "CLS 400", "CLS 450", "CLS 53 AMG", "CLS 63 AMG",
        "E-Class", "E 200", "E 220", "E 250", "E 300", "E 350", "E 400", "E 450", "E 500", "E 53 AMG", "E 63 AMG",
        "S-Class", "S 320", "S 350", "S 400", "S 450", "S 500", "S 560", "S 580", "S 600", "S 63 AMG", "S 65 AMG",
        "GLA", "GLA 180", "GLA 200", "GLA 220", "GLA 250", "GLA 35 AMG", "GLA 45 AMG",
        "GLB", "GLB 180", "GLB 200", "GLB 220", "GLB 250", "GLB 35 AMG",
        "GLC", "GLC 200", "GLC 220", "GLC 250", "GLC 300", "GLC 43 AMG", "GLC 63 AMG",
        "GLE", "GLE 300", "GLE 350", "GLE 400", "GLE 450", "GLE 500", "GLE 53 AMG", "GLE 63 AMG",
        "GLS", "GLS 350", "GLS 400", "GLS 450", "GLS 500", "GLS 580", "GLS 63 AMG",
        "G-Class", "G 350", "G 400", "G 500", "G 63 AMG",
        "EQA", "EQB", "EQC", "EQE", "EQS",
        "SL", "SLC", "SLK", "AMG GT", "Vito", "V-Class", "Sprinter",
    ],
    "Audi": [
        "A1", "A3", "S3", "RS3", "A4", "A4 Allroad", "S4", "RS4",
        "A5", "S5", "RS5", "A6", "A6 Allroad", "S6", "RS6",
        "A7", "S7", "RS7", "A8", "S8",
        "Q2", "SQ2", "Q3", "RS Q3", "Q4 e-tron", "Q5", "SQ5", "Q7", "SQ7", "Q8", "SQ8", "RS Q8",
        "TT", "TT RS", "R8",
        "e-tron", "e-tron GT", "RS e-tron GT", "Q8 e-tron",
    ],
    "Volkswagen": [
        "up!", "e-up!", "Polo", "Golf", "Golf GTI", "Golf R", "Golf Variant", "Golf Plus", "Golf Sportsvan",
        "ID.3", "ID.4", "ID.5", "ID.7", "ID. Buzz",
        "T-Cross", "Taigo", "T-Roc", "T-Roc Cabriolet", "Tiguan", "Tiguan Allspace", "Touareg",
        "Passat", "Passat Variant", "Passat Alltrack", "Arteon", "Arteon Shooting Brake",
        "Touran", "Sharan", "Caddy", "Multivan", "Transporter", "Caravelle", "California", "Crafter", "Amarok",
    ],
    "Porsche": [
        "911", "911 Carrera", "911 Turbo", "911 GT3", "911 GT3 RS", "911 Targa",
        "718 Boxster", "718 Cayman", "718 Cayman GT4", "718 Spyder",
        "Panamera", "Panamera Sport Turismo",
        "Macan", "Macan S", "Macan GTS", "Macan Turbo", "Macan Electric",
        "Cayenne", "Cayenne Coupe", "Cayenne S", "Cayenne GTS", "Cayenne Turbo",
        "Taycan", "Taycan Cross Turismo", "Taycan Sport Turismo",
    ],
    "Sonstige": [
        "Sonstige",
    ],
}

ALL_WORLD_COUNTRIES = [
    # DACH & Direct Neighbors (Priority)
    "Deutschland", "Österreich", "Schweiz", "Niederlande", "Belgien", "Luxemburg",
    "Frankreich", "Italien", "Polen", "Tschechien", "Dänemark", "Liechtenstein",
    # Rest of Europe
    "Albanien", "Andorra", "Belarus", "Bosnien und Herzegowina", "Bulgarien", "Estland",
    "Finnland", "Griechenland", "Irland", "Island", "Kosovo", "Kroatien", "Lettland", "Litauen",
    "Malta", "Moldawien", "Monaco", "Montenegro", "Nordmazedonien", "Norwegen", "Portugal",
    "Rumänien", "Russland", "San Marino", "Schweden", "Serbien", "Slowakei", "Slowenien",
    "Spanien", "Türkei", "Ukraine", "Ungarn", "Vatikanstadt", "Vereinigtes Königreich", "Zypern",
    # Americas
    "Antigua und Barbuda", "Argentinien", "Bahamas", "Barbados", "Belize", "Bolivien", "Brasilien", "Chile",
    "Costa Rica", "Dominica", "Dominikanische Republik", "Ecuador", "El Salvador", "Grenada",
    "Guatemala", "Guyana", "Haiti", "Honduras", "Jamaika", "Kanada", "Kolumbien", "Kuba",
    "Mexiko", "Nicaragua", "Panama", "Paraguay", "Peru", "St. Kitts und Nevis", "St. Lucia",
    "St. Vincent und die Grenadinen", "Suriname", "Trinidad und Tobago",
    "Uruguay", "Venezuela", "Vereinigte Staaten von Amerika",
    # Asia & Middle East
    "Afghanistan", "Armenien", "Aserbaidschan", "Bahrain", "Bangladesch", "Bhutan",
    "Brunei", "China", "Georgien", "Indien", "Indonesien", "Irak", "Iran", "Israel",
    "Japan", "Jemen", "Jordanien", "Kambodscha", "Kasachstan", "Katar", "Kirgisistan",
    "Kuwait", "Laos", "Libanon", "Malaysia", "Malediven", "Mongolei", "Myanmar", "Nepal",
    "Nordkorea", "Oman", "Pakistan", "Palästina", "Philippinen", "Saudi-Arabien", "Singapur", "Sri Lanka",
    "Südkorea", "Syrien", "Tadschikistan", "Taiwan", "Thailand", "Turkmenistan", "Usbekistan",
    "Vereinigte Arabische Emirate", "Vietnam",
    # Africa
    "Ägypten", "Algerien", "Angola", "Äquatorialguinea", "Äthiopien", "Benin", "Botswana",
    "Burkina Faso", "Burundi", "Dschibuti", "Elfenbeinküste", "Eritrea", "Eswatini", "Gabun",
    "Gambia", "Ghana", "Guinea", "Guinea-Bissau", "Kamerun", "Kap Verde", "Kenia", "Komoren",
    "Kongo (Dem. Rep.)", "Kongo (Rep.)", "Lesotho", "Liberia", "Libyen", "Madagaskar", "Malawi",
    "Mali", "Marokko", "Mauretanien", "Mauritius", "Mosambik", "Namibia", "Niger", "Nigeria",
    "Ruanda", "Sambia", "São Tomé und Príncipe", "Senegal", "Seychellen", "Sierra Leone",
    "Simbabwe", "Somalia", "Südafrika", "Sudan", "Südsudan", "Tansania", "Togo", "Tschad",
    "Tunesien", "Uganda", "Zentralafrikanische Republik",
    # Oceania
    "Australien", "Fidschi", "Kiribati", "Marshallinseln", "Mikronesien", "Nauru",
    "Neuseeland", "Palau", "Papua-Neuguinea", "Salomonen", "Samoa", "Tonga", "Tuvalu", "Vanuatu"
]

CITIES_BY_COUNTRY = {
    "Deutschland": [
        "Berlin", "Hamburg", "München", "Köln", "Frankfurt am Main", "Stuttgart", "Düsseldorf",
        "Leipzig", "Dortmund", "Essen", "Bremen", "Dresden", "Hannover", "Nürnberg", "Duisburg",
        "Bochum", "Wuppertal", "Bielefeld", "Bonn", "Münster", "Karlsruhe", "Mannheim", "Augsburg",
        "Wiesbaden", "Gelsenkirchen", "Mönchengladbach", "Braunschweig", "Chemnitz", "Kiel", "Aachen",
        "Halle (Saale)", "Magdeburg", "Freiburg im Breisgau", "Krefeld", "Lübeck", "Oberhausen",
        "Erfurt", "Mainz", "Rostock", "Kassel", "Hagen", "Hamm", "Saarbrücken", "Mülheim an der Ruhr",
        "Potsdam", "Ludwigshafen am Rhein", "Oldenburg", "Leverkusen", "Osnabrück", "Solingen",
        "Heidelberg", "Herne", "Neuss", "Darmstadt", "Paderborn", "Regensburg", "Ingolstadt",
        "Würzburg", "Fürth", "Wolfsburg", "Offenbach am Main", "Ulm", "Heilbronn", "Pforzheim",
        "Göttingen", "Bottrop", "Trier", "Recklinghausen", "Reutlingen", "Bremerhaven", "Koblenz",
        "Bergisch Gladbach", "Jena", "Remscheid", "Erlangen", "Moers", "Siegen", "Hildesheim", "Salzgitter"
    ],
    "Österreich": [
        "Wien", "Graz", "Linz", "Salzburg", "Innsbruck", "Klagenfurt", "Villach", "Wels", "St. Pölten", "Dornbirn"
    ],
    "Schweiz": [
        "Zürich", "Genf", "Basel", "Bern", "Lausanne", "Winterthur", "Luzern", "St. Gallen", "Lugano", "Biel/Bienne"
    ],
}

PAYMENT_METHODS = [
    {"name": "Barzahlung", "applies_to_buy": True, "applies_to_sale": True, "applies_to_transactions": True},
    {"name": "Überweisung", "applies_to_buy": True, "applies_to_sale": True, "applies_to_transactions": True},
    {"name": "EC-Karte", "applies_to_buy": True, "applies_to_sale": True, "applies_to_transactions": True},
    {"name": "Sparkasse", "applies_to_buy": False, "applies_to_sale": False, "applies_to_transactions": True},
    {"name": "Volksbank", "applies_to_buy": False, "applies_to_sale": False, "applies_to_transactions": True},
    {"name": "Finanzierung", "applies_to_buy": False, "applies_to_sale": True, "applies_to_transactions": False},
    {"name": "Leasing", "applies_to_buy": False, "applies_to_sale": True, "applies_to_transactions": False},
]

TAX_PERCENTAGES = [
    {"name": "19% MwSt.", "percentage": Decimal("19.00"), "is_no_tax": False},
    {"name": "0% Steuerfrei", "percentage": Decimal("0.00"), "is_no_tax": True},
]

DAMAGE_TYPES = [
    "Unfallfrei", "Unfallfahrzeug", "Reparierter Vorschaden", "Nicht fahrbereit"
]

CATEGORIES_WITH_SUBCATEGORIES = {
    "Fahrzeugkosten": [
        "Ankaufskosten", "Fahrzeugaufbereitung", "Reparatur / Instandsetzung",
        "Überführung / Transport", "Zulassung / Abmeldung", "TÜV / AU Gebühren"
    ],
    "Reparatur & Wartung": [
        "Ersatzteile", "Werkstattleistungen", "Reifen & Räder", "Lackierung / Smart Repair", "Inspektion & Service"
    ],
    "Betriebsausgaben": [
        "Miete & Pacht", "Strom, Gas & Wasser", "Bürobedarf & IT", "Telefon & Internet",
        "Marketing, Werbung & Inserate", "Beratung & Buchhaltung", "Reisekosten"
    ],
    "Versicherung & Steuern": [
        "Kfz-Haftpflicht", "Kfz-Kasko", "Betriebshaftpflicht", "Kfz-Steuer", "Gewerbesteuer"
    ],
    "Personal": [
        "Gehälter & Löhne", "Provisionen", "Sozialabgaben", "Weiterbildung"
    ],
    "Sonstiges": [
        "Sonstige Betriebsausgaben", "Sonstige Einnahmen", "Zinserträge / Zinsaufwand"
    ],
}


def seed_choices_for_business(business: Business) -> dict:
    """
    Populates all choices for a given Business.
    Safe, idempotent, and non-destructive.
    """
    stats = {}
    base_dir = getattr(settings, 'BASE_DIR', '')

    logger.info("Seeding Choices for Business [%s] '%s'", business.id, business.name)

    # 1. Tier 1: mobile.de Baseline (Fuels, Bodies, Colors, Doors, Classes) in German
    seed_official_mobile_de_choices(business)
    stats['FuelTypes'] = FuelType.objects.filter(business=business).count()
    stats['BodyTypes'] = BodyType.objects.filter(business=business).count()
    stats['Colors'] = Color.objects.filter(business=business).count()
    stats['Doors'] = DoorsChoice.objects.filter(business=business).count()
    stats['VehicleTypes'] = VehicleType.objects.filter(business=business).count()

    # 2. Makes & Models (Tier 1 - Comprehensive mobile.de catalog)
    catalog_path = os.path.join(base_dir, "scripts", "data", "mobile_de_car_catalog.json")
    if os.path.exists(catalog_path):
        with open(catalog_path, encoding="utf-8") as f:
            catalog = json.load(f)
    else:
        catalog = [
            {"make": m["name"], "code": m["code"], "models": OFFICIAL_MODELS_BY_MAKE.get(m["name"], [])}
            for m in OFFICIAL_MOBILE_DE_MAKES
        ]

    existing_makes = {m.name.lower(): m for m in Make.objects.filter(business=business)}
    makes_to_create = []
    make_obj_map = {}

    for item in catalog:
        m_name = item["make"]
        m_code = item.get("code") or m_name.upper().replace(" ", "_")
        lower_name = m_name.lower()
        m_classes = item.get("vehicle_classes") or item.get("classes") or KNOWN_MAKE_CLASSES.get(lower_name, ["Car"])
        if lower_name in existing_makes:
            m_obj = existing_makes[lower_name]
            updated = False
            if m_obj.mobile_de_mapping != m_code:
                m_obj.mobile_de_mapping = m_code
                updated = True
            if not m_obj.is_protected:
                m_obj.is_protected = True
                updated = True
            if not m_obj.is_active:
                m_obj.is_active = True
                updated = True
            if m_obj.vehicle_classes != m_classes:
                m_obj.vehicle_classes = m_classes
                updated = True
            if updated:
                m_obj.save(update_fields=['mobile_de_mapping', 'is_protected', 'is_active', 'vehicle_classes'])
            make_obj_map[lower_name] = m_obj
        else:
            m_obj = Make(
                business=business,
                name=m_name,
                mobile_de_mapping=m_code,
                vehicle_classes=m_classes,
                is_protected=True,
                is_active=True
            )
            makes_to_create.append(m_obj)

    if makes_to_create:
        Make.objects.bulk_create(makes_to_create)
        for m in Make.objects.filter(business=business):
            make_obj_map[m.name.lower()] = m
    else:
        for lower_name, m in existing_makes.items():
            make_obj_map[lower_name] = m

    stats['Makes'] = len(make_obj_map)

    # 3. Models per Make (Tier 1)
    existing_models = {(vm.make_id, vm.name.lower()): vm for vm in VehicleModel.objects.filter(business=business)}
    models_to_create = []
    models_to_update = []

    for item in catalog:
        m_name = item["make"]
        m_obj = make_obj_map.get(m_name.lower())
        if not m_obj:
            continue

        for mod_name in item.get("models", []):
            mod_lower = mod_name.lower()
            key = (m_obj.id, mod_lower)
            if key in existing_models:
                vm_obj = existing_models[key]
                updated = False
                if vm_obj.mobile_de_mapping != mod_name:
                    vm_obj.mobile_de_mapping = mod_name
                    updated = True
                if not vm_obj.is_protected:
                    vm_obj.is_protected = True
                    updated = True
                if not vm_obj.is_active:
                    vm_obj.is_active = True
                    updated = True
                if updated:
                    models_to_update.append(vm_obj)
            else:
                models_to_create.append(VehicleModel(
                    business=business,
                    make=m_obj,
                    name=mod_name,
                    mobile_de_mapping=mod_name,
                    is_protected=True,
                    is_active=True
                ))

    if models_to_create:
        VehicleModel.objects.bulk_create(models_to_create, batch_size=999)
    if models_to_update:
        VehicleModel.objects.bulk_update(models_to_update, ['mobile_de_mapping', 'is_protected', 'is_active'], batch_size=999)

    stats['VehicleModels'] = VehicleModel.objects.filter(business=business).count()

    # 4. Countries (Tier 2 - All World Countries)
    cities_catalog_path = os.path.join(base_dir, "scripts", "data", "world_cities_catalog.json")
    if os.path.exists(cities_catalog_path):
        with open(cities_catalog_path, encoding="utf-8") as f:
            cities_data = json.load(f)
    else:
        cities_data = CITIES_BY_COUNTRY

    all_countries_to_seed = list(dict.fromkeys(ALL_WORLD_COUNTRIES + list(cities_data.keys())))
    existing_countries = {c.name.lower(): c for c in Country.objects.filter(business=business)}
    countries_to_create = []
    country_obj_map = {}

    for c_name in all_countries_to_seed:
        c_lower = c_name.lower()
        if c_lower in existing_countries:
            country_obj_map[c_lower] = existing_countries[c_lower]
        else:
            countries_to_create.append(Country(business=business, name=c_name, is_active=True))

    if countries_to_create:
        Country.objects.bulk_create(countries_to_create, ignore_conflicts=True)
        for c in Country.objects.filter(business=business):
            country_obj_map[c.name.lower()] = c
    else:
        for c_name in all_countries_to_seed:
            if c_name.lower() in existing_countries:
                country_obj_map[c_name.lower()] = existing_countries[c_name.lower()]

    stats['Countries'] = Country.objects.filter(business=business).count()

    # 5. Cities (Tier 2 - All Cities per Country)
    existing_cities = {(c.country_id, c.name.lower()) for c in City.objects.filter(business=business)}
    cities_to_create = []

    for c_name, city_list in cities_data.items():
        c_obj = country_obj_map.get(c_name.lower())
        if not c_obj:
            continue
        for city_name in city_list:
            city_key = (c_obj.id, city_name.lower())
            if city_key not in existing_cities:
                cities_to_create.append(City(business=business, country=c_obj, name=city_name, is_active=True))
                existing_cities.add(city_key)

    if cities_to_create:
        City.objects.bulk_create(cities_to_create, batch_size=500, ignore_conflicts=True)

    stats['Cities'] = City.objects.filter(business=business).count()

    # 6. Payment Methods (Tier 2)
    pm_count = 0
    for pm in PAYMENT_METHODS:
        existing_pm = PaymentMethod.objects.filter(business=business, name__iexact=pm['name']).first()
        if existing_pm:
            existing_pm.name = pm['name']
            existing_pm.applies_to_buy = pm['applies_to_buy']
            existing_pm.applies_to_sale = pm['applies_to_sale']
            existing_pm.applies_to_transactions = pm['applies_to_transactions']
            existing_pm.is_active = True
            existing_pm.save()
        else:
            PaymentMethod.objects.create(
                business=business,
                name=pm['name'],
                applies_to_buy=pm['applies_to_buy'],
                applies_to_sale=pm['applies_to_sale'],
                applies_to_transactions=pm['applies_to_transactions'],
                is_active=True
            )
        pm_count += 1
    stats['PaymentMethods'] = pm_count

    # 7. Tax Percentages (Tier 2)
    tax_count = 0
    for tp in TAX_PERCENTAGES:
        TaxPercentage.objects.update_or_create(
            business=business,
            name=tp['name'],
            defaults={
                'percentage': tp['percentage'],
                'is_no_tax': tp['is_no_tax'],
                'is_active': True,
            }
        )
        tax_count += 1
    stats['TaxPercentages'] = tax_count

    # 8. Damage Types (Tier 2)
    dt_count = 0
    for dt_name in DAMAGE_TYPES:
        DamageType.objects.get_or_create(
            business=business,
            name=dt_name,
            defaults={'is_active': True}
        )
        dt_count += 1
    stats['DamageTypes'] = dt_count

    # 9. Categories & Subcategories (Tier 2)
    cat_count = 0
    sub_count = 0
    for cat_name, sub_list in CATEGORIES_WITH_SUBCATEGORIES.items():
        cat_obj, _ = Category.objects.get_or_create(
            business=business,
            name=cat_name,
            defaults={'is_active': True}
        )
        cat_count += 1
        for sub_name in sub_list:
            Subcategory.objects.get_or_create(
                business=business,
                category=cat_obj,
                name=sub_name,
                defaults={'is_active': True}
            )
            sub_count += 1
    stats['Categories'] = cat_count
    stats['Subcategories'] = sub_count

    # 10. Key Numbers 1..30 (Tier 2)
    key_count = 0
    for num in range(1, 31):
        KeyNumber.objects.get_or_create(
            business=business,
            number=num,
            defaults={'is_active': True}
        )
        key_count += 1
    stats['KeyNumbers'] = key_count

    return stats
