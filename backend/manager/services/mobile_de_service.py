"""
mobile.de Marketplace Service
Handles communication with the official mobile.de REST API (Seller-API, Insights-API, Reference Data)
and provides an offline schema-validating Developer Simulator.
"""

import base64
import json
import logging
import os
import random
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import requests
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

# Official vehicle class mapping from ACAR VehicleType names to mobile.de class enums
CLASS_MAP = {
    'pkw': 'Car',
    'car': 'Car',
    'auto': 'Car',
    'personenkraftwagen': 'Car',
    'motorrad': 'Motorbike',
    'motorbike': 'Motorbike',
    'motorcycle': 'Motorbike',
    'bike': 'Motorbike',
    'scooter': 'Motorbike',
    'roller': 'Motorbike',
    'wohnmobil': 'Motorhome',
    'wohnwagen': 'Motorhome',
    'wohnmobil / wohnwagen': 'Motorhome',
    'motorhome': 'Motorhome',
    'caravan': 'Motorhome',
    'camper': 'Motorhome',
    'transporter': 'VanUpTo7500',
    'van': 'VanUpTo7500',
    'kleintransporter': 'VanUpTo7500',
    'kastenwagen': 'VanUpTo7500',
    'lkw': 'TruckOver7500',
    'truck': 'TruckOver7500',
    'lkw über 7,5t': 'TruckOver7500',
    'lkw bis 7,5t': 'VanUpTo7500',
    'sattelzugmaschine': 'SemiTrailerTruck',
    'zugmaschine': 'SemiTrailerTruck',
    'anhänger': 'Trailer',
    'trailer': 'Trailer',
    'auflieger': 'SemiTrailer',
    'sattelauflieger': 'SemiTrailer',
    'baumaschine': 'ConstructionMachine',
    'construction': 'ConstructionMachine',
    'agrarfahrzeug': 'AgriculturalVehicle',
    'traktor': 'AgriculturalVehicle',
    'schlepper': 'AgriculturalVehicle',
    'gabelstapler': 'ForkliftTruck',
    'stapler': 'ForkliftTruck',
    'bus': 'Bus',
    'reisebus': 'Bus',
    'omnibus': 'Bus',
    'ebike': 'EBike',
    'e-bike': 'EBike',
    'pedelec': 'EBike',
}

# Category mapping from ACAR BodyType names to mobile.de category enums
CATEGORY_MAP = {
    # Car (PKW)
    'limousine': 'Limousine',
    'sedan': 'Limousine',
    'saloon': 'Limousine',
    'estatecar': 'EstateCar',
    'kombi': 'EstateCar',
    'estate': 'EstateCar',
    'station wagon': 'EstateCar',
    'suv': 'SUV',
    'suv / geländewagen': 'SUV',
    'offroad': 'OffRoad',
    'geländewagen': 'OffRoad',
    'off-road': 'OffRoad',
    'cabrio': 'Cabriolet',
    'cabriolet': 'Cabriolet',
    'convertible': 'Cabriolet',
    'sportscar': 'SportsCar',
    'coupe': 'SportsCar',
    'sportwagen': 'SportsCar',
    'sportwagen / coupé': 'SportsCar',
    'van': 'Van',
    'kleinbus': 'Van',
    'van / kleinbus': 'Van',
    'van / minibus': 'Van',
    'minivan': 'Van',
    'smallcar': 'SmallCar',
    'kleinwagen': 'SmallCar',
    'hatchback': 'SmallCar',
    'othercar': 'OtherCar',
    'andere': 'OtherCar',
    'other': 'OtherCar',
    'sonstige': 'OtherCar',

    # Motorrad (Motorbike)
    'chopper': 'Chopper',
    'chopper / cruiser': 'Chopper',
    'enduro': 'Enduro',
    'enduro / reiseenduro': 'Enduro',
    'naked bike': 'NakedBike',
    'nakedbike': 'NakedBike',
    'roller': 'Scooter',
    'scooter': 'Scooter',
    'roller / scooter': 'Scooter',
    'supersportler': 'SuperSport',
    'supersport': 'SuperSport',
    'sporttourer': 'SportTouring',
    'sporttouring': 'SportTouring',
    'tourer': 'Tourer',
    'supermoto': 'SuperMoto',
    'quad': 'Quad',
    'quad / trike': 'Quad',
    'trike': 'Quad',
    'gespann': 'Sidecar',
    'gespann / beiwagen': 'Sidecar',
    'sidecar': 'Sidecar',
    'pocketbike': 'PocketBike',
    'pocket bike': 'PocketBike',
    'sonstige (motorrad)': 'Other',

    # Wohnmobil / Wohnwagen (Motorhome)
    'alkoven': 'Alcoves',
    'alcoves': 'Alcoves',
    'integriert': 'Integrated',
    'integrated': 'Integrated',
    'teilintegriert': 'SemiIntegrated',
    'semiintegrated': 'SemiIntegrated',
    'kastenwagen (wohnmobil)': 'PanelVan',
    'panelvan': 'PanelVan',
    'wohnwagen': 'Caravan',
    'caravan': 'Caravan',
    'wohnkabine': 'Cabin',
    'cabin': 'Cabin',
    'mobilheim': 'MobileHome',
    'mobilehome': 'MobileHome',
    'andere (wohnmobil)': 'Other',

    # Transporter & LKW (VanUpTo7500 & TruckOver7500)
    'kastenwagen (transporter)': 'BoxVan',
    'boxvan': 'BoxVan',
    'pritsche': 'Flatbed',
    'flatbed': 'Flatbed',
    'kipper': 'Tipper',
    'tipper': 'Tipper',
    'kühlkoffer': 'Refrigerated',
    'kühlkoffer / isotherm': 'Refrigerated',
    'refrigerated': 'Refrigerated',
    'pritschenwagen + plane': 'DropSide',
    'dropside': 'DropSide',
    'fahrgestell': 'Chassis',
    'chassis': 'Chassis',
    'sattelzugmaschine': 'SemiTrailerTruck',
    'semitrailertruck': 'SemiTrailerTruck',
    'koffer / kasten': 'Box',
    'box': 'Box',
    'abschleppwagen': 'Breakdown',
    'breakdown': 'Breakdown',
    'getränkekoffer': 'BeverageTruck',
    'beveragetruck': 'BeverageTruck',
    'andere (nutzfahrzeug)': 'Other',

    # Anhänger & Auflieger (Trailer & SemiTrailer)
    'kofferanhänger': 'BoxTrailer',
    'boxtrailer': 'BoxTrailer',
    'autotransportanhänger': 'CarTransporter',
    'cartransporter': 'CarTransporter',
    'pferdeanhänger': 'HorseTrailer',
    'horsetrailer': 'HorseTrailer',
    'kippanhänger': 'TipperTrailer',
    'tippertrailer': 'TipperTrailer',
    'planenanhänger': 'CurtainTrailer',
    'curtaintrailer': 'CurtainTrailer',
    'kühlauflieger': 'RefrigeratedTrailer',
    'refrigeratedtrailer': 'RefrigeratedTrailer',
    'sonstige (anhänger)': 'Other',
}

# Fuel type mapping
FUEL_MAP = {
    'petrol': 'PETROL',
    'benzin': 'PETROL',
    'diesel': 'DIESEL',
    'electric': 'ELECTRIC',
    'elektro': 'ELECTRIC',
    'hybrid': 'HYBRID',
    'hybrid (benzin/elektro)': 'HYBRID',
    'hybrid (diesel/elektro)': 'HYBRID',
    'plug-in-hybrid': 'HYBRID_PLUGIN',
    'lpg': 'LPG',
    'autogas': 'LPG',
    'autogas (lpg)': 'LPG',
    'cng': 'CNG',
    'erdgas': 'CNG',
    'erdgas (cng)': 'CNG',
    'hydrogen': 'HYDROGEN',
    'wasserstoff': 'HYDROGEN',
    'ethanol': 'ETHANOL',
    'other': 'OTHER',
    'sonstige': 'OTHER',
    'andere': 'OTHER',
}

# Color mapping
COLOR_MAP = {
    'schwarz': 'BLACK',
    'black': 'BLACK',
    'weiß': 'WHITE',
    'weiss': 'WHITE',
    'white': 'WHITE',
    'grau': 'GREY',
    'grey': 'GREY',
    'gray': 'GREY',
    'silber': 'SILVER',
    'silver': 'SILVER',
    'blau': 'BLUE',
    'blue': 'BLUE',
    'rot': 'RED',
    'red': 'RED',
    'grün': 'GREEN',
    'gruen': 'GREEN',
    'green': 'GREEN',
    'gelb': 'YELLOW',
    'yellow': 'YELLOW',
    'braun': 'BROWN',
    'brown': 'BROWN',
    'orange': 'ORANGE',
    'beige': 'BEIGE',
    'gold': 'GOLD',
    'purple': 'PURPLE',
    'violett': 'PURPLE',
    'other': 'OTHER',
    'sonstige': 'OTHER',
    'andere': 'OTHER',
}


OFFICIAL_MOBILE_DE_CLASSES = [
    {'name': 'PKW', 'code': 'Car'},
    {'name': 'Motorrad', 'code': 'Motorbike'},
    {'name': 'Wohnmobil / Wohnwagen', 'code': 'Motorhome'},
    {'name': 'Transporter', 'code': 'VanUpTo7500'},
    {'name': 'LKW', 'code': 'TruckOver7500'},
    {'name': 'Sattelzugmaschine', 'code': 'SemiTrailerTruck'},
    {'name': 'Anhänger', 'code': 'Trailer'},
    {'name': 'Auflieger', 'code': 'SemiTrailer'},
    {'name': 'Baumaschine', 'code': 'ConstructionMachine'},
    {'name': 'Agrarfahrzeug', 'code': 'AgriculturalVehicle'},
    {'name': 'Gabelstapler', 'code': 'ForkliftTruck'},
    {'name': 'Bus', 'code': 'Bus'},
    {'name': 'E-Bike', 'code': 'EBike'},
]

# Official mobile.de baseline choices (Official German labels matching Accept-Language: de)
OFFICIAL_MOBILE_DE_FUELS = [
    {'name': 'Diesel', 'code': 'DIESEL'},
    {'name': 'Benzin', 'code': 'PETROL'},
    {'name': 'Elektro', 'code': 'ELECTRIC'},
    {'name': 'Hybrid', 'code': 'HYBRID'},
    {'name': 'Plug-in-Hybrid', 'code': 'HYBRID_PLUGIN'},
    {'name': 'Autogas (LPG)', 'code': 'LPG'},
    {'name': 'Erdgas (CNG)', 'code': 'CNG'},
    {'name': 'Wasserstoff', 'code': 'HYDROGEN'},
    {'name': 'Ethanol', 'code': 'ETHANOL'},
    {'name': 'Keine / Nicht zutreffend', 'code': None},
    {'name': 'Sonstige', 'code': 'OTHER'},
]

OFFICIAL_MOBILE_DE_BODIES = [
    # PKW (Car)
    {'name': 'Limousine', 'code': 'Limousine', 'classes': ['Car']},
    {'name': 'Kombi', 'code': 'EstateCar', 'classes': ['Car']},
    {'name': 'SUV', 'code': 'SUV', 'classes': ['Car']},
    {'name': 'Geländewagen', 'code': 'OffRoad', 'classes': ['Car']},
    {'name': 'Cabriolet', 'code': 'Cabriolet', 'classes': ['Car']},
    {'name': 'Sportwagen', 'code': 'SportsCar', 'classes': ['Car']},
    {'name': 'Van / Kleinbus', 'code': 'Van', 'classes': ['Car']},
    {'name': 'Kleinwagen', 'code': 'SmallCar', 'classes': ['Car']},
    {'name': 'Andere', 'code': 'OtherCar', 'classes': ['Car']},

    # Motorrad (Motorbike)
    {'name': 'Chopper / Cruiser', 'code': 'Chopper', 'classes': ['Motorbike']},
    {'name': 'Enduro / Reiseenduro', 'code': 'Enduro', 'classes': ['Motorbike']},
    {'name': 'Naked Bike', 'code': 'NakedBike', 'classes': ['Motorbike']},
    {'name': 'Roller / Scooter', 'code': 'Scooter', 'classes': ['Motorbike']},
    {'name': 'Supersportler', 'code': 'SuperSport', 'classes': ['Motorbike']},
    {'name': 'Sporttourer', 'code': 'SportTouring', 'classes': ['Motorbike']},
    {'name': 'Tourer', 'code': 'Tourer', 'classes': ['Motorbike']},
    {'name': 'Supermoto', 'code': 'SuperMoto', 'classes': ['Motorbike']},
    {'name': 'Quad / Trike', 'code': 'Quad', 'classes': ['Motorbike']},
    {'name': 'Gespann / Beiwagen', 'code': 'Sidecar', 'classes': ['Motorbike']},
    {'name': 'Pocketbike', 'code': 'PocketBike', 'classes': ['Motorbike']},
    {'name': 'Sonstige (Motorrad)', 'code': 'Other', 'classes': ['Motorbike']},

    # Wohnmobil / Wohnwagen (Motorhome)
    {'name': 'Alkoven', 'code': 'Alcoves', 'classes': ['Motorhome']},
    {'name': 'Integriert', 'code': 'Integrated', 'classes': ['Motorhome']},
    {'name': 'Teilintegriert', 'code': 'SemiIntegrated', 'classes': ['Motorhome']},
    {'name': 'Kastenwagen (Wohnmobil)', 'code': 'PanelVan', 'classes': ['Motorhome']},
    {'name': 'Wohnwagen', 'code': 'Caravan', 'classes': ['Motorhome']},
    {'name': 'Wohnkabine', 'code': 'Cabin', 'classes': ['Motorhome']},
    {'name': 'Mobilheim', 'code': 'MobileHome', 'classes': ['Motorhome']},
    {'name': 'Andere (Wohnmobil)', 'code': 'Other', 'classes': ['Motorhome']},

    # Transporter & LKW (VanUpTo7500 & TruckOver7500)
    {'name': 'Kastenwagen (Transporter)', 'code': 'BoxVan', 'classes': ['VanUpTo7500']},
    {'name': 'Pritsche', 'code': 'Flatbed', 'classes': ['VanUpTo7500', 'TruckOver7500']},
    {'name': 'Kipper', 'code': 'Tipper', 'classes': ['VanUpTo7500', 'TruckOver7500']},
    {'name': 'Kühlkoffer / Isotherm', 'code': 'Refrigerated', 'classes': ['VanUpTo7500', 'TruckOver7500']},
    {'name': 'Pritschenwagen + Plane', 'code': 'DropSide', 'classes': ['VanUpTo7500', 'TruckOver7500']},
    {'name': 'Fahrgestell', 'code': 'Chassis', 'classes': ['TruckOver7500']},
    {'name': 'Sattelzugmaschine', 'code': 'SemiTrailerTruck', 'classes': ['TruckOver7500', 'SemiTrailerTruck']},
    {'name': 'Koffer / Kasten', 'code': 'Box', 'classes': ['TruckOver7500']},
    {'name': 'Abschleppwagen', 'code': 'Breakdown', 'classes': ['VanUpTo7500', 'TruckOver7500']},
    {'name': 'Getränkekoffer', 'code': 'BeverageTruck', 'classes': ['VanUpTo7500', 'TruckOver7500']},
    {'name': 'Andere (Nutzfahrzeug)', 'code': 'Other', 'classes': ['VanUpTo7500', 'TruckOver7500']},

    # Anhänger & Auflieger (Trailer & SemiTrailer)
    {'name': 'Kofferanhänger', 'code': 'BoxTrailer', 'classes': ['Trailer']},
    {'name': 'Autotransportanhänger', 'code': 'CarTransporter', 'classes': ['Trailer']},
    {'name': 'Pferdeanhänger', 'code': 'HorseTrailer', 'classes': ['Trailer']},
    {'name': 'Kippanhänger', 'code': 'TipperTrailer', 'classes': ['Trailer']},
    {'name': 'Planenanhänger', 'code': 'CurtainTrailer', 'classes': ['Trailer', 'SemiTrailer']},
    {'name': 'Kühlauflieger', 'code': 'RefrigeratedTrailer', 'classes': ['SemiTrailer']},
    {'name': 'Sonstige (Anhänger)', 'code': 'Other', 'classes': ['Trailer', 'SemiTrailer']},
    {'name': 'Keine', 'code': None, 'classes': [
        'Car', 'Motorbike', 'Motorhome', 'VanUpTo7500', 'TruckOver7500',
        'SemiTrailerTruck', 'Trailer', 'SemiTrailer', 'ConstructionMachine',
        'AgriculturalVehicle', 'ForkliftTruck', 'Bus', 'EBike'
    ]},
]

# Specific brand to vehicle class mappings for multi-class taxonomy
KNOWN_MAKE_CLASSES = {
    # Multi-class & Shared brands
    'bmw': ['Car', 'Motorbike'],
    'honda': ['Car', 'Motorbike'],
    'suzuki': ['Car', 'Motorbike'],
    'peugeot': ['Car', 'VanUpTo7500', 'Motorbike'],
    'mercedes-benz': ['Car', 'VanUpTo7500', 'TruckOver7500'],
    'volkswagen': ['Car', 'VanUpTo7500', 'Motorhome'],
    'ford': ['Car', 'VanUpTo7500'],
    'fiat': ['Car', 'VanUpTo7500'],
    'renault': ['Car', 'VanUpTo7500', 'TruckOver7500'],
    'iveco': ['VanUpTo7500', 'TruckOver7500'],
    'man': ['VanUpTo7500', 'TruckOver7500', 'Bus'],
    'ktm': ['Motorbike', 'Car'],
    'volvo': ['Car', 'TruckOver7500', 'Bus'],
    'citroën': ['Car', 'VanUpTo7500'],
    'citroen': ['Car', 'VanUpTo7500'],
    'opel': ['Car', 'VanUpTo7500'],
    'toyota': ['Car', 'VanUpTo7500'],
    'nissan': ['Car', 'VanUpTo7500'],
    'mitsubishi': ['Car', 'VanUpTo7500'],
    'hyundai': ['Car', 'VanUpTo7500'],
    'maxus': ['Car', 'VanUpTo7500'],

    # Dedicated Motorbike brands
    'ducati': ['Motorbike'],
    'harley-davidson': ['Motorbike'],
    'yamaha': ['Motorbike'],
    'kawasaki': ['Motorbike'],
    'aprilia': ['Motorbike'],
    'triumph': ['Motorbike'],
    'moto guzzi': ['Motorbike'],
    'husqvarna': ['Motorbike'],
    'vespa': ['Motorbike'],
    'piaggio': ['Motorbike'],
    'kymco': ['Motorbike'],
    'sym': ['Motorbike'],
    'benelli': ['Motorbike'],
    'indian': ['Motorbike'],
    'mv agusta': ['Motorbike'],
    'royal enfield': ['Motorbike'],
    'beta': ['Motorbike'],
    'gas gas': ['Motorbike'],
    'gasgas': ['Motorbike'],
    'zero motorcycles': ['Motorbike'],
    'zero': ['Motorbike'],
    'cf moto': ['Motorbike'],
    'cfmoto': ['Motorbike'],
    'bueil': ['Motorbike'],
    'buell': ['Motorbike'],
    'cagiva': ['Motorbike'],
    'derbi': ['Motorbike'],
    'gilera': ['Motorbike'],
    'italjet': ['Motorbike'],
    'malaguti': ['Motorbike'],
    'mbk': ['Motorbike'],
    'motron': ['Motorbike'],
    'mz': ['Motorbike'],
    'norton': ['Motorbike'],
    'rieju': ['Motorbike'],
    'sherco': ['Motorbike'],
    'super soco': ['Motorbike'],
    'sur-ron': ['Motorbike'],
    'swm': ['Motorbike'],
    'tm racing': ['Motorbike'],
    'torrot': ['Motorbike'],
    'ural': ['Motorbike'],
    'voge': ['Motorbike'],
    'zontes': ['Motorbike'],
    '3pluscoco': ['Motorbike'],
    'access': ['Motorbike'],
    'acma': ['Motorbike'],
    'adly': ['Motorbike'],
    'adly moto': ['Motorbike'],
    'aeon': ['Motorbike'],
    'agm': ['Motorbike'],
    'ajp': ['Motorbike'],
    'ajs': ['Motorbike'],
    'awo': ['Motorbike'],
    'alpha motors': ['Motorbike'],

    # Dedicated Motorhome / Camper brands
    'hymer': ['Motorhome'],
    'weinsberg': ['Motorhome'],
    'dethleffs': ['Motorhome'],
    'knaus': ['Motorhome'],
    'bürstner': ['Motorhome'],
    'buerstner': ['Motorhome'],
    'hobby': ['Motorhome'],
    'pössl': ['Motorhome'],
    'poessl': ['Motorhome'],
    'carthago': ['Motorhome'],
    'adria': ['Motorhome'],
    'concorde': ['Motorhome'],
    'chausson': ['Motorhome'],
    'challenger': ['Motorhome'],
    'sunlight': ['Motorhome'],
    'carado': ['Motorhome'],
    'malibu': ['Motorhome'],
    'fendt': ['Motorhome'],
    'tabbert': ['Motorhome'],
    'lmc': ['Motorhome'],
    'eura mobil': ['Motorhome'],
    'morelo': ['Motorhome'],
    'frankia': ['Motorhome'],
    'westfalia': ['Motorhome'],
    'roller team': ['Motorhome'],
    'rapido': ['Motorhome'],
    'ahorn': ['Motorhome'],
    'ahorn camp': ['Motorhome'],
    'bavaria': ['Motorhome'],
    'benimar': ['Motorhome'],
    'clever': ['Motorhome'],
    'etrusco': ['Motorhome'],
    'forster': ['Motorhome'],
    'giottiline': ['Motorhome'],
    'itineo': ['Motorhome'],
    'laika': ['Motorhome'],
    'mc louis': ['Motorhome'],
    'mclouis': ['Motorhome'],
    'mobilvetta': ['Motorhome'],
    'pilote': ['Motorhome'],
    'pla': ['Motorhome'],
    'rimor': ['Motorhome'],
    'sun living': ['Motorhome'],
    'trigano': ['Motorhome'],
    'vario mobil': ['Motorhome'],

    # Dedicated Truck / LKW brands
    'scania': ['TruckOver7500'],
    'daf': ['TruckOver7500'],
    'kamag': ['TruckOver7500'],
    'magirus-deutz': ['TruckOver7500'],
    'tatra': ['TruckOver7500'],
    'astra': ['TruckOver7500'],

    # Dedicated Trailer / Anhänger brands
    'schmitz cargobull': ['Trailer', 'SemiTrailer'],
    'kögel': ['Trailer', 'SemiTrailer'],
    'koegel': ['Trailer', 'SemiTrailer'],
    'krone': ['Trailer', 'SemiTrailer'],
    'humbaur': ['Trailer'],
    'böckmann': ['Trailer'],
    'boeckmann': ['Trailer'],
    'saris': ['Trailer'],
    'unsinn': ['Trailer'],
    'stema': ['Trailer'],
    'eduard': ['Trailer'],
    'brenderup': ['Trailer'],
    'hapert': ['Trailer'],
    'schwarzmüller': ['Trailer', 'SemiTrailer'],
    'schwarzmueller': ['Trailer', 'SemiTrailer'],
    'wielton': ['Trailer', 'SemiTrailer'],
    'fliegl': ['Trailer', 'SemiTrailer'],
    'kässbohrer': ['Trailer', 'SemiTrailer'],
    'kaessbohrer': ['Trailer', 'SemiTrailer'],
    'barthau': ['Trailer'],
    'anssems': ['Trailer'],
    'hulco': ['Trailer'],
    'wm meyer': ['Trailer'],
    'pongratz': ['Trailer'],
    'sonstige': ['Car', 'Motorbike', 'Motorhome', 'VanUpTo7500', 'TruckOver7500', 'SemiTrailerTruck', 'Trailer', 'SemiTrailer', 'ConstructionMachine', 'AgriculturalVehicle', 'ForkliftTruck', 'Bus', 'EBike'],
    'other': ['Car', 'Motorbike', 'Motorhome', 'VanUpTo7500', 'TruckOver7500', 'SemiTrailerTruck', 'Trailer', 'SemiTrailer', 'ConstructionMachine', 'AgriculturalVehicle', 'ForkliftTruck', 'Bus', 'EBike'],
}

OFFICIAL_MOBILE_DE_COLORS = [
    {'name': 'Schwarz', 'code': 'BLACK'},
    {'name': 'Weiß', 'code': 'WHITE'},
    {'name': 'Grau', 'code': 'GREY'},
    {'name': 'Silber', 'code': 'SILVER'},
    {'name': 'Blau', 'code': 'BLUE'},
    {'name': 'Rot', 'code': 'RED'},
    {'name': 'Grün', 'code': 'GREEN'},
    {'name': 'Gelb', 'code': 'YELLOW'},
    {'name': 'Braun', 'code': 'BROWN'},
    {'name': 'Orange', 'code': 'ORANGE'},
    {'name': 'Beige', 'code': 'BEIGE'},
    {'name': 'Gold', 'code': 'GOLD'},
    {'name': 'Violett', 'code': 'PURPLE'},
    {'name': 'Sonstige', 'code': 'OTHER'},
]

OFFICIAL_MOBILE_DE_DOORS = [
    {'name': '2/3', 'code': 'TWO_OR_THREE'},
    {'name': '4/5', 'code': 'FOUR_OR_FIVE'},
    {'name': '6/7', 'code': 'SIX_OR_SEVEN'},
    {'name': 'Keine', 'code': None},
]


_OFFICIAL_MAKES_CACHE = None

def get_official_mobile_de_makes() -> List[Dict[str, str]]:
    global _OFFICIAL_MAKES_CACHE
    if _OFFICIAL_MAKES_CACHE is None:
        catalog_path = os.path.join(settings.BASE_DIR, "scripts", "data", "mobile_de_car_catalog.json")
        if os.path.exists(catalog_path):
            try:
                with open(catalog_path, encoding="utf-8") as f:
                    raw = json.load(f)
                    _OFFICIAL_MAKES_CACHE = [
                        {'code': item.get('code') or item['make'].upper().replace(' ', '_'), 'label': item['make']}
                        for item in raw
                    ]
                    _OFFICIAL_MAKES_CACHE.sort(key=lambda x: x['label'].lower())
            except Exception:
                _OFFICIAL_MAKES_CACHE = [{'code': m['code'], 'label': m['name']} for m in OFFICIAL_MOBILE_DE_MAKES]
        else:
            _OFFICIAL_MAKES_CACHE = [{'code': m['code'], 'label': m['name']} for m in OFFICIAL_MOBILE_DE_MAKES]
    return _OFFICIAL_MAKES_CACHE


def get_mobile_de_mappings() -> Dict[str, List[Dict[str, str]]]:
    return {
        'make': get_official_mobile_de_makes(),
        'vehicle_type': [
            {'code': item['code'], 'label': item['name']} for item in OFFICIAL_MOBILE_DE_CLASSES if item.get('code') and item['code'] != 'NONE'
        ],
        'fuel_type': [
            {'code': item['code'], 'label': item['name']} for item in OFFICIAL_MOBILE_DE_FUELS if item.get('code') and item['code'] != 'NONE'
        ],
        'body_type': [
            {'code': item['code'], 'label': item['name']} for item in OFFICIAL_MOBILE_DE_BODIES if item.get('code') and item['code'] != 'NONE'
        ],
        'color': [
            {'code': item['code'], 'label': item['name']} for item in OFFICIAL_MOBILE_DE_COLORS if item.get('code') and item['code'] != 'NONE'
        ],
        'doors': [
            {'code': item['code'], 'label': item['name']} for item in OFFICIAL_MOBILE_DE_DOORS if item.get('code') and item['code'] != 'NONE'
        ],
    }


MOBILE_DE_MAPPINGS = get_mobile_de_mappings()


def seed_official_mobile_de_choices(business):
    """
    Seeds all official mobile.de options as protected choices for a given business in German.
    Safely migrates vehicles linked to obsolete or English choices to their official German equivalents
    and removes redundant empty duplicates.
    """
    from manager.models import FuelType, BodyType, Color, DoorsChoice, VehicleType, Vehicle, Make, VehicleModel

    # 1. Fuel Types (German)
    fuel_migration_map = {
        'petrol': 'Benzin',
        'electric': 'Elektro',
        'lpg': 'Autogas (LPG)',
        'autogas': 'Autogas (LPG)',
        'cng': 'Erdgas (CNG)',
        'erdgas': 'Erdgas (CNG)',
        'hydrogen': 'Wasserstoff',
        'other': 'Sonstige',
        'andere': 'Sonstige',
    }

    official_fuels_by_name = {}
    for item in OFFICIAL_MOBILE_DE_FUELS:
        f_obj, _ = FuelType.objects.update_or_create(
            business=business,
            name=item['name'],
            defaults={
                'mobile_de_mapping': item['code'],
                'is_protected': True,
                'is_active': True,
            }
        )
        official_fuels_by_name[item['name'].lower()] = f_obj

    # Migrate vehicles attached to old/duplicate choices
    for old_name_lower, new_name in fuel_migration_map.items():
        target_obj = official_fuels_by_name.get(new_name.lower())
        if not target_obj:
            continue
        old_objs = FuelType.objects.filter(business=business, name__iexact=old_name_lower).exclude(id=target_obj.id)
        for old_obj in old_objs:
            Vehicle.objects.filter(fuel_type=old_obj).update(fuel_type=target_obj)
            old_obj.delete()

    FuelType.objects.filter(business=business).exclude(
        name__in=[item['name'] for item in OFFICIAL_MOBILE_DE_FUELS]
    ).update(is_protected=False)

    # 2. Body Types (German)
    body_migration_map = {
        'estatecar': 'Kombi',
        'kastenwagen': 'Van / Kleinbus',
        'suv / geländewagen': 'SUV',
        'suv / gelndewagen': 'SUV',
        'offroad': 'Geländewagen',
        'sportscar': 'Sportwagen',
        'sportwagen / coupé': 'Sportwagen',
        'sportwagen / coup': 'Sportwagen',
        'van': 'Van / Kleinbus',
        'van / minibus': 'Van / Kleinbus',
        'smallcar': 'Kleinwagen',
        'othercar': 'Andere',
        'other': 'Andere',
    }

    official_bodies_by_name = {}
    for item in OFFICIAL_MOBILE_DE_BODIES:
        b_obj, _ = BodyType.objects.update_or_create(
            business=business,
            name=item['name'],
            defaults={
                'mobile_de_mapping': item['code'],
                'vehicle_classes': item.get('classes', ['Car']),
                'is_protected': True,
                'is_active': True,
            }
        )
        official_bodies_by_name[item['name'].lower()] = b_obj

    for old_name_lower, new_name in body_migration_map.items():
        target_obj = official_bodies_by_name.get(new_name.lower())
        if not target_obj:
            continue
        old_objs = BodyType.objects.filter(business=business, name__iexact=old_name_lower).exclude(id=target_obj.id)
        for old_obj in old_objs:
            Vehicle.objects.filter(body_type=old_obj).update(body_type=target_obj)
            old_obj.delete()

    # Re-point any motorcycles in BodyType: set body_type = None since motorcycle is a vehicle class
    motorrad_body = BodyType.objects.filter(business=business, name__iexact='Motorrad').first()
    if motorrad_body:
        Vehicle.objects.filter(body_type=motorrad_body).update(body_type=None)
        motorrad_body.delete()

    # Remove legacy Wohnmobil from BodyType (class Wohnmobil / Wohnwagen is in VehicleType)
    BodyType.objects.filter(business=business, name__iexact='Wohnmobil').delete()

    BodyType.objects.filter(business=business).exclude(
        name__in=[item['name'] for item in OFFICIAL_MOBILE_DE_BODIES]
    ).update(is_protected=False)

    # 3. Colors (German)
    color_migration_map = {
        'black': 'Schwarz',
        'white': 'Weiß',
        'grey': 'Grau',
        'gray': 'Grau',
        'silver': 'Silber',
        'blue': 'Blau',
        'red': 'Rot',
        'green': 'Grün',
        'yellow': 'Gelb',
        'brown': 'Braun',
        'purple': 'Violett',
        'other': 'Sonstige',
        'andere': 'Sonstige',
    }

    official_colors_by_name = {}
    for item in OFFICIAL_MOBILE_DE_COLORS:
        c_obj, _ = Color.objects.update_or_create(
            business=business,
            name=item['name'],
            defaults={
                'mobile_de_mapping': item['code'],
                'is_protected': True,
                'is_active': True,
            }
        )
        official_colors_by_name[item['name'].lower()] = c_obj

    for old_name_lower, new_name in color_migration_map.items():
        target_obj = official_colors_by_name.get(new_name.lower())
        if not target_obj:
            continue
        old_objs = Color.objects.filter(business=business, name__iexact=old_name_lower).exclude(id=target_obj.id)
        for old_obj in old_objs:
            Vehicle.objects.filter(color=old_obj).update(color=target_obj)
            old_obj.delete()

    Color.objects.filter(business=business).exclude(
        name__in=[item['name'] for item in OFFICIAL_MOBILE_DE_COLORS]
    ).update(is_protected=False)

    # 4. Doors
    for item in OFFICIAL_MOBILE_DE_DOORS:
        DoorsChoice.objects.update_or_create(
            business=business,
            name=item['name'],
            defaults={
                'mobile_de_mapping': item['code'],
                'is_protected': True,
                'is_active': True,
            }
        )
    DoorsChoice.objects.filter(business=business).exclude(
        name__in=[item['name'] for item in OFFICIAL_MOBILE_DE_DOORS]
    ).update(is_protected=False)

    # 5. Vehicle Types (mobile.de classes)
    official_vt_by_name = {}
    for item in OFFICIAL_MOBILE_DE_CLASSES:
        vt_obj, _ = VehicleType.objects.update_or_create(
            business=business,
            name=item['name'],
            defaults={
                'mobile_de_mapping': item['code'],
                'is_protected': True,
                'is_active': True,
            }
        )
        official_vt_by_name[item['name'].lower()] = vt_obj

    # Migrate vehicles attached to legacy 'Wohnmobil' and remove the duplicate
    canonical_wm = official_vt_by_name.get('wohnmobil / wohnwagen')
    if canonical_wm:
        legacy_wms = VehicleType.objects.filter(business=business, name__iexact='Wohnmobil').exclude(id=canonical_wm.id)
        for old_vt in legacy_wms:
            Vehicle.objects.filter(vehicle_type=old_vt).update(vehicle_type=canonical_wm)
            old_vt.delete()

    VehicleType.objects.filter(business=business).exclude(
        name__in=[item['name'] for item in OFFICIAL_MOBILE_DE_CLASSES]
    ).update(is_protected=False)

    # 6. Universal Keine Make, Model, BodyType and fallback Sonstige for edge cases
    all_supported_classes = [
        'Car', 'Motorbike', 'Motorhome', 'VanUpTo7500', 'TruckOver7500',
        'SemiTrailerTruck', 'Trailer', 'SemiTrailer', 'ConstructionMachine',
        'AgriculturalVehicle', 'ForkliftTruck', 'Bus', 'EBike'
    ]
    keine_make, _ = Make.objects.update_or_create(
        business=business,
        name='Keine',
        defaults={
            'mobile_de_mapping': 'NONE',
            'is_protected': True,
            'is_active': True,
            'vehicle_classes': all_supported_classes,
        }
    )
    VehicleModel.objects.update_or_create(
        business=business,
        make=keine_make,
        name='Keine',
        defaults={
            'mobile_de_mapping': 'NONE',
            'is_protected': True,
            'is_active': True,
            'vehicle_classes': all_supported_classes,
        }
    )
    Make.objects.update_or_create(
        business=business,
        name='Sonstige',
        defaults={
            'mobile_de_mapping': 'OTHER',
            'is_protected': True,
            'is_active': True,
            'vehicle_classes': all_supported_classes,
        }
    )
    BodyType.objects.update_or_create(
        business=business,
        name='Sonstige / Andere',
        defaults={
            'mobile_de_mapping': 'Other',
            'is_protected': True,
            'is_active': True,
            'vehicle_classes': all_supported_classes,
        }
    )

    # 7. Tag Makes with vehicle classes
    for make in Make.objects.filter(business=business):
        if make.name.lower() in ['sonstige', 'keine', 'andere']:
            target_classes = all_supported_classes
        else:
            target_classes = KNOWN_MAKE_CLASSES.get(make.name.lower(), ['Car'])
        if make.vehicle_classes != target_classes:
            make.vehicle_classes = target_classes
            make.save(update_fields=['vehicle_classes'])


def resolve_class(vehicle_type_choice) -> str:
    """Resolves vehicle_type choice to official mobile.de class enum."""
    if not vehicle_type_choice:
        return 'Car'
    if getattr(vehicle_type_choice, 'mobile_de_mapping', None):
        return vehicle_type_choice.mobile_de_mapping.strip()
    return CLASS_MAP.get(vehicle_type_choice.name.strip().lower(), 'Car')


def resolve_fuel(fuel_choice) -> Optional[str]:
    """Resolves fuel_type choice to mobile.de enum code without silent fallback."""
    if not fuel_choice:
        return None
    if getattr(fuel_choice, 'mobile_de_mapping', None):
        return fuel_choice.mobile_de_mapping.strip()
    val = fuel_choice.name.strip().lower()
    if 'keine' in val or 'nicht zutreffend' in val or val == 'none':
        return 'NONE'
    return FUEL_MAP.get(val)


def resolve_category(body_type_choice) -> Optional[str]:
    """Resolves body_type choice to mobile.de enum code without silent fallback."""
    if not body_type_choice:
        return None
    if getattr(body_type_choice, 'mobile_de_mapping', None):
        mapping = body_type_choice.mobile_de_mapping.strip()
        if mapping.upper() == 'NONE':
            return 'Other'
        return mapping
    if body_type_choice.name.strip().lower() == 'keine':
        return 'Other'
    return CATEGORY_MAP.get(body_type_choice.name.strip().lower())


def resolve_color(color_choice) -> Optional[str]:
    """Resolves color choice to mobile.de enum code without silent fallback."""
    if not color_choice:
        return None
    if getattr(color_choice, 'mobile_de_mapping', None):
        return color_choice.mobile_de_mapping.strip()
    return COLOR_MAP.get(color_choice.name.strip().lower())


def resolve_doors(doors_choice) -> Optional[str]:
    """Resolves doors choice to mobile.de enum code without silent fallback."""
    if not doors_choice:
        return None
    if getattr(doors_choice, 'mobile_de_mapping', None):
        mapping = doors_choice.mobile_de_mapping.strip()
        if mapping.upper() in ['NONE', 'KEINE']:
            return None
        return mapping
    val = str(doors_choice.name).strip().lower()
    if 'keine' in val or val == 'none' or val == '0':
        return None
    if '2' in val or '3' in val:
        return 'TWO_OR_THREE'
    if '6' in val or '7' in val:
        return 'SIX_OR_SEVEN'
    if '4' in val or '5' in val:
        return 'FOUR_OR_FIVE'
    return None


def resolve_make(make_choice) -> Optional[str]:
    """Resolves make choice to mobile.de make name/code."""
    if not make_choice:
        return None
    if getattr(make_choice, 'mobile_de_mapping', None):
        mapping = make_choice.mobile_de_mapping.strip()
        if mapping.upper() in ['NONE', 'OTHER', 'SONSTIGE']:
            return 'Sonstige'
        return mapping
    if make_choice.name.strip().lower() in ['keine', 'sonstige', 'other', 'andere']:
        return 'Sonstige'
    return make_choice.name.strip()


def resolve_model(model_choice, fallback_name: Optional[str] = None) -> Optional[str]:
    """Resolves vehicle model choice to mobile.de model name/code."""
    if model_choice:
        if getattr(model_choice, 'mobile_de_mapping', None):
            mapping = model_choice.mobile_de_mapping.strip()
            if mapping.upper() in ['NONE', 'OTHER', 'SONSTIGE']:
                return 'Sonstige'
            return mapping
        if model_choice.name.strip().lower() in ['keine', 'sonstige', 'other', 'andere']:
            return 'Sonstige'
        return model_choice.name.strip()
    return fallback_name.strip() if fallback_name else None


# Backward-compatible convenience functions
def map_category(body_type_name: Optional[str]) -> str:
    if not body_type_name:
        return 'OtherCar'
    return CATEGORY_MAP.get(body_type_name.strip().lower(), 'OtherCar')


def map_fuel(fuel_name: Optional[str]) -> str:
    if not fuel_name:
        return 'PETROL'
    return FUEL_MAP.get(fuel_name.strip().lower(), 'PETROL')


def map_color(color_name: Optional[str]) -> str:
    if not color_name:
        return 'OTHER'
    return COLOR_MAP.get(color_name.strip().lower(), 'OTHER')


def map_doors(doors_choice: Any) -> str:
    if not doors_choice:
        return 'FOUR_OR_FIVE'
    val = str(doors_choice).strip().lower()
    if '2' in val or '3' in val:
        return 'TWO_OR_THREE'
    if '6' in val or '7' in val:
        return 'SIX_OR_SEVEN'
    return 'FOUR_OR_FIVE'


class BaseMobileDeService:
    """Abstract base service for mobile.de operations."""

    def __init__(self, mobile_de_settings):
        self.settings = mobile_de_settings
        self.business = mobile_de_settings.business

    def test_connection(self) -> Tuple[bool, str]:
        raise NotImplementedError

    def build_ad_payload(self, vehicle) -> Dict[str, Any]:
        """Constructs the standard mobile.de Car JSON structure."""
        make_name = resolve_make(vehicle.make) or (vehicle.make.name if vehicle.make else '')
        model_name = resolve_model(vehicle.model, fallback_name=vehicle.manufacturer_model) or (
            'Sonstige' if (vehicle.make and vehicle.make.name.strip().lower() in ['sonstige', 'keine']) else ''
        )

        # First registration format: YYYY-MM
        first_reg = ''
        if vehicle.first_registration_date:
            first_reg = vehicle.first_registration_date.strftime('%Y-%m')
        elif vehicle.year_of_construction:
            first_reg = f"{vehicle.year_of_construction:04d}-01"

        power_kw = vehicle.power_kw or 100
        mileage = vehicle.kilometer or 0
        sale_price = float(vehicle.sale_price or 0)
        vat_rate = float(vehicle.sale_tax.percentage) if (vehicle.sale_tax and vehicle.sale_tax.percentage) else 19.00

        gearbox = vehicle.transmission or 'MANUAL_GEAR'
        if gearbox not in ['MANUAL_GEAR', 'AUTOMATIC_GEAR']:
            gearbox = 'MANUAL_GEAR'

        v_class = resolve_class(vehicle.vehicle_type)

        # Resolve required marketplace choices with NO silent fallbacks
        fuel = resolve_fuel(vehicle.fuel_type)
        if v_class in ['Trailer', 'SemiTrailer']:
            # Trailers have no engine/fuel
            pass
        elif not fuel or fuel == 'NONE':
            fuel_name = vehicle.fuel_type.name if vehicle.fuel_type else "Not specified"
            raise ValueError(f"Vehicle fuel type '{fuel_name}' is not recognized or mapped for mobile.de. Please configure it in Choices Management or select a mapped fuel type.")

        category = resolve_category(vehicle.body_type)
        if not category:
            if v_class in ['Motorbike', 'Motorhome', 'Trailer', 'SemiTrailer']:
                category = 'Other'
            elif v_class in ['VanUpTo7500', 'TruckOver7500']:
                category = 'Other'
            elif v_class != 'Car':
                category = 'Other'
            else:
                cat_name = vehicle.body_type.name if vehicle.body_type else "Not specified"
                raise ValueError(f"Vehicle body type '{cat_name}' is not recognized or mapped for mobile.de. Please configure it in Choices Management or select a mapped body type.")

        color = resolve_color(vehicle.color)
        if not color:
            color_name = vehicle.color.name if vehicle.color else "Not specified"
            raise ValueError(f"Vehicle color '{color_name}' is not recognized or mapped for mobile.de. Please configure it in Choices Management or select a mapped color.")

        door_count = resolve_doors(vehicle.doors) if vehicle.doors else None
        if v_class in ['Car', 'VanUpTo7500']:
            if not door_count or door_count == 'NONE':
                door_name = vehicle.doors.name if vehicle.doors else "Not specified"
                raise ValueError(f"Vehicle door option '{door_name}' is not valid for cars or vans. Please configure or select a valid door count (e.g. 2/3, 4/5).")

        specifics: Dict[str, Any] = {
            'mileage': int(mileage),
            'firstRegistration': first_reg or '2020-01',
            'power': int(power_kw),
            'powerUnit': 'KW',
            'gearbox': gearbox,
            'exteriorColor': color,
            'condition': vehicle.condition or 'USED',
        }
        if fuel and fuel != 'NONE':
            specifics['fuel'] = fuel
        if door_count and door_count != 'NONE':
            specifics['doorCount'] = door_count
        if vehicle.hu_date:
            specifics['hu'] = vehicle.hu_date

        environment: Dict[str, Any] = {
            'emissionClass': vehicle.emission_class or 'EURO6',
            'emissionBadge': vehicle.emission_badge or 'GREEN',
        }
        if vehicle.fuel_consumption_combined:
            environment['fuelConsumption'] = {
                'combined': float(vehicle.fuel_consumption_combined),
                'unit': 'L_100KM'
            }
        if vehicle.co2_emission_combined:
            environment['co2Emission'] = {
                'combined': int(vehicle.co2_emission_combined),
                'unit': 'G_KM'
            }
        if vehicle.efficiency_class:
            environment['efficiencyClass'] = vehicle.efficiency_class

        payload: Dict[str, Any] = {
            'ad': {
                'vehicle': {
                    'class': v_class,
                    'category': category,
                    'make': make_name,
                    'model': model_name,
                    'modelDescription': f"{make_name} {model_name}".strip(),
                    'specifics': specifics,
                    'features': vehicle.features or [],
                    'environment': environment,
                },
                'price': {
                    'consumerPriceGross': sale_price,
                    'currency': 'EUR',
                    'vatRate': vat_rate,
                    'negotiable': False,
                    'vatType': 'VAT_CLAIMABLE' if vat_rate > 0 else 'VAT_NOT_CLAIMABLE',
                },
                'description': vehicle.mobile_de_description or vehicle.description or f"{make_name} {model_name}",
                'customProperties': {
                    'internalId': str(vehicle.internal_id or vehicle.id)
                }
            }
        }
        return payload

    def upload_images(self, vehicle) -> List[Dict[str, str]]:
        raise NotImplementedError

    def publish_or_update_ad(self, vehicle) -> Tuple[bool, str, Dict[str, Any]]:
        raise NotImplementedError

    def delist_vehicle(self, vehicle) -> Tuple[bool, str]:
        raise NotImplementedError

    def fetch_insights(self, vehicle) -> Tuple[bool, Dict[str, Any]]:
        raise NotImplementedError

    def fetch_reference_data(self, endpoint: str) -> List[Dict[str, Any]]:
        raise NotImplementedError


class MobileDeSimulator(BaseMobileDeService):
    """
    Offline developer simulator that performs strict schema validation
    and generates realistic mobile.de responses without calling external servers.
    """

    def fetch_reference_data(self, endpoint: str) -> List[Dict[str, Any]]:
        """Returns verified baseline reference taxonomy in German."""
        ep = endpoint.lower()
        if 'fuel' in ep:
            return [{'key': item['code'], 'label': item['name']} for item in OFFICIAL_MOBILE_DE_FUELS]
        if 'categor' in ep:
            return [{'key': item['code'], 'label': item['name']} for item in OFFICIAL_MOBILE_DE_BODIES]
        if 'color' in ep:
            return [{'key': item['code'], 'label': item['name']} for item in OFFICIAL_MOBILE_DE_COLORS]
        if 'class' in ep:
            return [{'key': item['code'], 'label': item['name']} for item in OFFICIAL_MOBILE_DE_CLASSES]
        return []

    def test_connection(self) -> Tuple[bool, str]:
        if not self.settings.seller_id or not self.settings.api_username or not self.settings.api_password:
            self.settings.last_connection_test = timezone.now()
            self.settings.last_connection_status = 'failed'
            self.settings.last_connection_error = 'Missing credentials. Seller ID, Username, and Password are required.'
            self.settings.save(update_fields=['last_connection_test', 'last_connection_status', 'last_connection_error'])
            return False, self.settings.last_connection_error

        self.settings.last_connection_test = timezone.now()
        self.settings.last_connection_status = 'success'
        self.settings.last_connection_error = None
        self.settings.save(update_fields=['last_connection_test', 'last_connection_status', 'last_connection_error'])
        return True, "Simulator connection verified successfully."

    def upload_images(self, vehicle) -> List[Dict[str, str]]:
        """Simulates photo uploads and returns image reference URIs."""
        refs: List[Dict[str, str]] = []
        if vehicle.image:
            refs.append({'ref': f"https://services.mobile.de/images/sim_{vehicle.id}_primary_{uuid.uuid4().hex[:8]}"})

        for img in vehicle.listing_images.all().order_by('order', 'id'):
            refs.append({'ref': f"https://services.mobile.de/images/sim_{vehicle.id}_gallery_{img.id}_{uuid.uuid4().hex[:8]}"})

        return refs

    def publish_or_update_ad(self, vehicle) -> Tuple[bool, str, Dict[str, Any]]:
        """Validates payload schema and simulates ad creation / update."""
        # Validate connection
        if not self.settings.is_configured:
            return False, "mobile.de integration is not configured in Business Settings.", {}

        # Validate mandatory vehicle data
        if not vehicle.make:
            return False, "Vehicle Make is required by mobile.de.", {}
        if not vehicle.model and not vehicle.manufacturer_model:
            if vehicle.make and vehicle.make.name.strip().lower() in ['sonstige', 'keine']:
                pass
            else:
                return False, "Vehicle Model is required by mobile.de.", {}
        if not vehicle.sale_price or vehicle.sale_price <= 0:
            return False, "Valid Gross Sale Price is required to list on mobile.de.", {}
        if vehicle.kilometer is None or vehicle.kilometer < 0:
            return False, "Valid Mileage (km) is required by mobile.de.", {}
        if not vehicle.transmission:
            return False, "Transmission (Manual / Automatic) is required by mobile.de.", {}

        # Build payload to verify JSON generation
        try:
            payload = self.build_ad_payload(vehicle)
        except ValueError as e:
            return False, str(e), {}
        image_refs = self.upload_images(vehicle)
        if image_refs:
            payload['ad']['images'] = image_refs

        # Assign simulated ad ID if not already present
        if not vehicle.mobile_de_ad_id:
            ad_id = str(random.randint(385000000, 399999999))
            vehicle.mobile_de_ad_id = ad_id

        vehicle.mobile_de_status = 'active'
        vehicle.mobile_de_url = f"https://suchen.mobile.de/fahrzeuge/details.html?id={vehicle.mobile_de_ad_id}"
        vehicle.mobile_de_last_synced_at = timezone.now()
        vehicle.mobile_de_last_error = None

        # Seed realistic insights if zero
        if vehicle.mobile_de_detail_views == 0:
            vehicle.mobile_de_detail_views = random.randint(140, 420)
            vehicle.mobile_de_search_hits = random.randint(1800, 4500)
            vehicle.mobile_de_parkings = random.randint(8, 28)
            vehicle.mobile_de_leads_count = random.randint(1, 6)
            vehicle.mobile_de_price_rating = random.choice(['Sehr guter Preis', 'Guter Preis', 'Fairer Preis'])
            vehicle.mobile_de_stats_updated_at = timezone.now()

        vehicle.save(update_fields=[
            'mobile_de_ad_id', 'mobile_de_status', 'mobile_de_url',
            'mobile_de_last_synced_at', 'mobile_de_last_error',
            'mobile_de_detail_views', 'mobile_de_search_hits',
            'mobile_de_parkings', 'mobile_de_leads_count',
            'mobile_de_price_rating', 'mobile_de_stats_updated_at'
        ])

        return True, "Vehicle successfully published to mobile.de (Simulator).", {
            'ad_id': vehicle.mobile_de_ad_id,
            'url': vehicle.mobile_de_url,
            'status': vehicle.mobile_de_status,
            'payload': payload
        }

    def delist_vehicle(self, vehicle) -> Tuple[bool, str]:
        """Simulates removing ad from mobile.de."""
        if not vehicle.mobile_de_ad_id and vehicle.mobile_de_status == 'not_listed':
            return True, "Vehicle is already not listed."

        old_ad_id = vehicle.mobile_de_ad_id
        vehicle.mobile_de_status = 'not_listed'
        vehicle.mobile_de_ad_id = None
        vehicle.mobile_de_url = None
        vehicle.mobile_de_last_synced_at = timezone.now()
        vehicle.mobile_de_last_error = None
        vehicle.save(update_fields=[
            'mobile_de_status', 'mobile_de_ad_id', 'mobile_de_url',
            'mobile_de_last_synced_at', 'mobile_de_last_error'
        ])
        return True, f"Vehicle #{vehicle.internal_id} successfully delisted from mobile.de."

    def fetch_insights(self, vehicle) -> Tuple[bool, Dict[str, Any]]:
        """Simulates fetching refreshed analytics."""
        if vehicle.mobile_de_status != 'active':
            return False, {"error": "Vehicle is not actively listed on mobile.de."}

        # Increment metrics slightly to simulate real engagement
        vehicle.mobile_de_detail_views += random.randint(2, 12)
        vehicle.mobile_de_search_hits += random.randint(25, 110)
        if random.random() < 0.2:
            vehicle.mobile_de_parkings += 1
        vehicle.mobile_de_stats_updated_at = timezone.now()
        vehicle.save(update_fields=[
            'mobile_de_detail_views', 'mobile_de_search_hits',
            'mobile_de_parkings', 'mobile_de_stats_updated_at'
        ])

        return True, {
            'detail_views': vehicle.mobile_de_detail_views,
            'search_hits': vehicle.mobile_de_search_hits,
            'parkings': vehicle.mobile_de_parkings,
            'leads_count': vehicle.mobile_de_leads_count,
            'price_rating': vehicle.mobile_de_price_rating or 'Guter Preis',
            'stats_updated_at': vehicle.mobile_de_stats_updated_at.isoformat()
        }


class MobileDeClient(BaseMobileDeService):
    """
    Live HTTP client interacting with the mobile.de REST API
    (supports both sandbox and production environments).
    """

    def __init__(self, mobile_de_settings):
        super().__init__(mobile_de_settings)
        use_sandbox = getattr(settings, 'MOBILE_DE_USE_SANDBOX', False)
        self.base_url = 'https://services-sandbox.mobile.de' if use_sandbox else 'https://services.mobile.de'
        self.seller_id = self.settings.seller_id
        self.username = self.settings.api_username
        self.password = self.settings.api_password

    def _get_headers(self, with_idempotency: bool = False) -> Dict[str, str]:
        auth_str = f"{self.username}:{self.password}"
        b64_auth = base64.b64encode(auth_str.encode('utf-8')).decode('ascii')
        headers = {
            'Authorization': f"Basic {b64_auth}",
            'Accept': 'application/vnd.de.mobile.api+json',
            'Content-Type': 'application/vnd.de.mobile.api+json',
            'Accept-Language': 'de',
        }
        if with_idempotency:
            headers['X-Mobile-Insertion-Request-Id'] = str(uuid.uuid4())
        return headers

    def test_connection(self) -> Tuple[bool, str]:
        if not self.seller_id or not self.username or not self.password:
            err = "Missing credentials. Seller ID, Username, and Password are required."
            self._record_connection_test(False, err)
            return False, err

        url = f"{self.base_url}/seller-api/sellers/{self.seller_id}"
        try:
            resp = requests.get(url, headers=self._get_headers(), timeout=10)
            if resp.status_code == 200:
                self._record_connection_test(True, None)
                return True, "Connection to mobile.de verified successfully."
            else:
                err = f"mobile.de returned HTTP {resp.status_code}: {resp.text[:200]}"
                self._record_connection_test(False, err)
                return False, err
        except Exception as e:
            err = f"Network error connecting to mobile.de: {str(e)}"
            self._record_connection_test(False, err)
            return False, err

    def _record_connection_test(self, success: bool, error: Optional[str]):
        self.settings.last_connection_test = timezone.now()
        self.settings.last_connection_status = 'success' if success else 'failed'
        self.settings.last_connection_error = error
        self.settings.save(update_fields=['last_connection_test', 'last_connection_status', 'last_connection_error'])

    def upload_images(self, vehicle) -> List[Dict[str, str]]:
        """Uploads primary and gallery images sequentially to mobile.de."""
        refs: List[Dict[str, str]] = []
        upload_url = f"{self.base_url}/seller-api/sellers/{self.seller_id}/images"

        images_to_upload = []
        if vehicle.image and hasattr(vehicle.image, 'path') and os.path.exists(vehicle.image.path):
            images_to_upload.append(vehicle.image.path)

        for item in vehicle.listing_images.all().order_by('order', 'id'):
            if item.image and hasattr(item.image, 'path') and os.path.exists(item.image.path):
                images_to_upload.append(item.image.path)

        for img_path in images_to_upload:
            try:
                with open(img_path, 'rb') as f:
                    img_data = f.read()
                headers = self._get_headers()
                headers['Content-Type'] = 'image/jpeg'
                resp = requests.post(upload_url, data=img_data, headers=headers, timeout=25)
                if resp.status_code == 201:
                    loc = resp.headers.get('Location')
                    if loc:
                        refs.append({'ref': loc})
            except Exception as e:
                logger.error(f"Failed to upload image {img_path} to mobile.de: {e}")

        return refs

    def publish_or_update_ad(self, vehicle) -> Tuple[bool, str, Dict[str, Any]]:
        """Uploads photos, builds payload, and creates or updates listing on mobile.de."""
        if not self.settings.is_configured:
            return False, "mobile.de integration is not configured in Business Settings.", {}

        try:
            payload = self.build_ad_payload(vehicle)
        except ValueError as e:
            return False, str(e), {}
        image_refs = self.upload_images(vehicle)
        if image_refs:
            payload['ad']['images'] = image_refs

        headers = self._get_headers(with_idempotency=True)

        try:
            if vehicle.mobile_de_ad_id:
                # Update existing ad
                url = f"{self.base_url}/seller-api/sellers/{self.seller_id}/ads/{vehicle.mobile_de_ad_id}"
                resp = requests.put(url, json=payload, headers=headers, timeout=20)
            else:
                # Create new ad
                url = f"{self.base_url}/seller-api/sellers/{self.seller_id}/ads"
                resp = requests.post(url, json=payload, headers=headers, timeout=20)

            if resp.status_code in [200, 201]:
                if resp.status_code == 201:
                    loc = resp.headers.get('Location', '')
                    if loc:
                        ad_id = loc.rstrip('/').split('/')[-1]
                        vehicle.mobile_de_ad_id = ad_id

                vehicle.mobile_de_status = 'active'
                vehicle.mobile_de_url = f"https://suchen.mobile.de/fahrzeuge/details.html?id={vehicle.mobile_de_ad_id}"
                vehicle.mobile_de_last_synced_at = timezone.now()
                vehicle.mobile_de_last_error = None
                vehicle.save(update_fields=[
                    'mobile_de_ad_id', 'mobile_de_status', 'mobile_de_url',
                    'mobile_de_last_synced_at', 'mobile_de_last_error'
                ])
                return True, "Successfully published to mobile.de.", {'url': vehicle.mobile_de_url}
            else:
                err_msg = f"mobile.de API error (HTTP {resp.status_code}): {resp.text}"
                vehicle.mobile_de_status = 'error'
                vehicle.mobile_de_last_error = err_msg
                vehicle.save(update_fields=['mobile_de_status', 'mobile_de_last_error'])
                return False, err_msg, {}
        except Exception as e:
            err_msg = f"Network error during mobile.de publishing: {str(e)}"
            vehicle.mobile_de_status = 'error'
            vehicle.mobile_de_last_error = err_msg
            vehicle.save(update_fields=['mobile_de_status', 'mobile_de_last_error'])
            return False, err_msg, {}

    def delist_vehicle(self, vehicle) -> Tuple[bool, str]:
        """Unpublishes ad from mobile.de."""
        if not vehicle.mobile_de_ad_id:
            vehicle.mobile_de_status = 'not_listed'
            vehicle.save(update_fields=['mobile_de_status'])
            return True, "Vehicle was not listed."

        url = f"{self.base_url}/seller-api/sellers/{self.seller_id}/ads/{vehicle.mobile_de_ad_id}"
        try:
            resp = requests.delete(url, headers=self._get_headers(), timeout=15)
            if resp.status_code in [200, 204, 404]:
                vehicle.mobile_de_status = 'not_listed'
                vehicle.mobile_de_ad_id = None
                vehicle.mobile_de_url = None
                vehicle.mobile_de_last_synced_at = timezone.now()
                vehicle.mobile_de_last_error = None
                vehicle.save(update_fields=[
                    'mobile_de_status', 'mobile_de_ad_id', 'mobile_de_url',
                    'mobile_de_last_synced_at', 'mobile_de_last_error'
                ])
                return True, "Vehicle delisted from mobile.de successfully."
            else:
                return False, f"Failed to delist from mobile.de: HTTP {resp.status_code}"
        except Exception as e:
            return False, f"Network error while delisting: {str(e)}"

    def fetch_insights(self, vehicle) -> Tuple[bool, Dict[str, Any]]:
        """Retrieves listing statistics and price rating from mobile.de."""
        if not vehicle.mobile_de_ad_id:
            return False, {"error": "Vehicle has no active mobile.de ad."}

        stats_url = f"{self.base_url}/seller-api/sellers/{self.seller_id}/ads/{vehicle.mobile_de_ad_id}/statistics"
        price_url = f"{self.base_url}/seller-api/sellers/{self.seller_id}/ads/{vehicle.mobile_de_ad_id}/pricerating"
        headers = self._get_headers()

        try:
            stats_resp = requests.get(stats_url, headers=headers, timeout=10)
            if stats_resp.status_code == 200:
                data = stats_resp.json()
                vehicle.mobile_de_detail_views = data.get('detailViews', vehicle.mobile_de_detail_views)
                vehicle.mobile_de_search_hits = data.get('searchHits', vehicle.mobile_de_search_hits)
                vehicle.mobile_de_parkings = data.get('parkings', vehicle.mobile_de_parkings)
                vehicle.mobile_de_leads_count = data.get('contactRequests', vehicle.mobile_de_leads_count)

            price_resp = requests.get(price_url, headers=headers, timeout=10)
            if price_resp.status_code == 200:
                pdata = price_resp.json()
                vehicle.mobile_de_price_rating = pdata.get('rating', vehicle.mobile_de_price_rating)

            vehicle.mobile_de_stats_updated_at = timezone.now()
            vehicle.save(update_fields=[
                'mobile_de_detail_views', 'mobile_de_search_hits',
                'mobile_de_parkings', 'mobile_de_leads_count',
                'mobile_de_price_rating', 'mobile_de_stats_updated_at'
            ])

            return True, {
                'detail_views': vehicle.mobile_de_detail_views,
                'search_hits': vehicle.mobile_de_search_hits,
                'parkings': vehicle.mobile_de_parkings,
                'leads_count': vehicle.mobile_de_leads_count,
                'price_rating': vehicle.mobile_de_price_rating,
                'stats_updated_at': vehicle.mobile_de_stats_updated_at.isoformat()
            }
        except Exception as e:
            return False, {"error": str(e)}

    def fetch_reference_data(self, endpoint: str) -> List[Dict[str, Any]]:
        """Fetches reference data taxonomy from mobile.de Reference Data API in German."""
        url = f"{self.base_url}/seller-api/reference-data/{endpoint.lstrip('/')}"
        headers = self._get_headers()
        try:
            resp = requests.get(url, headers=headers, timeout=15)
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list):
                    return data
                if isinstance(data, dict):
                    for k in ['items', 'categories', 'makes', 'models', 'fuelTypes', 'colors', 'classes']:
                        if k in data and isinstance(data[k], list):
                            return data[k]
                    return [data]
            logger.warning(f"mobile.de reference-data returned HTTP {resp.status_code} for {endpoint}")
            return []
        except Exception as e:
            logger.error(f"Error fetching mobile.de reference data ({endpoint}): {e}")
            return []


def get_mobile_de_service(business) -> Optional[BaseMobileDeService]:
    """Factory returning the appropriate mobile.de service instance."""
    from manager.models import MobileDeSettings

    settings_obj, _ = MobileDeSettings.objects.get_or_create(business=business)
    is_simulator = getattr(settings, 'MOBILE_DE_SIMULATOR', True)

    if is_simulator:
        return MobileDeSimulator(settings_obj)
    return MobileDeClient(settings_obj)
