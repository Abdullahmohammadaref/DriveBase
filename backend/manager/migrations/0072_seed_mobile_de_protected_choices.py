from django.db import migrations


def seed_protected_choices(apps, schema_editor):
    Business = apps.get_model('manager', 'Business')
    FuelType = apps.get_model('manager', 'FuelType')
    BodyType = apps.get_model('manager', 'BodyType')
    Color = apps.get_model('manager', 'Color')
    DoorsChoice = apps.get_model('manager', 'DoorsChoice')

    OFFICIAL_FUELS = [
        {'name': 'Diesel', 'code': 'DIESEL'},
        {'name': 'Petrol', 'code': 'PETROL'},
        {'name': 'Electric', 'code': 'ELECTRIC'},
        {'name': 'Hybrid', 'code': 'HYBRID'},
        {'name': 'Plug-in-Hybrid', 'code': 'HYBRID_PLUGIN'},
        {'name': 'LPG', 'code': 'LPG'},
        {'name': 'CNG', 'code': 'CNG'},
        {'name': 'Hydrogen', 'code': 'HYDROGEN'},
        {'name': 'Ethanol', 'code': 'ETHANOL'},
        {'name': 'Other', 'code': 'OTHER'},
    ]

    OFFICIAL_BODIES = [
        {'name': 'Limousine', 'code': 'Limousine'},
        {'name': 'EstateCar', 'code': 'EstateCar'},
        {'name': 'SUV', 'code': 'SUV'},
        {'name': 'OffRoad', 'code': 'OffRoad'},
        {'name': 'Cabriolet', 'code': 'Cabriolet'},
        {'name': 'SportsCar', 'code': 'SportsCar'},
        {'name': 'Van', 'code': 'Van'},
        {'name': 'SmallCar', 'code': 'SmallCar'},
        {'name': 'OtherCar', 'code': 'OtherCar'},
    ]

    OFFICIAL_COLORS = [
        {'name': 'Black', 'code': 'BLACK'},
        {'name': 'White', 'code': 'WHITE'},
        {'name': 'Grey', 'code': 'GREY'},
        {'name': 'Silver', 'code': 'SILVER'},
        {'name': 'Blue', 'code': 'BLUE'},
        {'name': 'Red', 'code': 'RED'},
        {'name': 'Green', 'code': 'GREEN'},
        {'name': 'Yellow', 'code': 'YELLOW'},
        {'name': 'Brown', 'code': 'BROWN'},
        {'name': 'Orange', 'code': 'ORANGE'},
        {'name': 'Beige', 'code': 'BEIGE'},
        {'name': 'Gold', 'code': 'GOLD'},
        {'name': 'Purple', 'code': 'PURPLE'},
        {'name': 'Other', 'code': 'OTHER'},
    ]

    OFFICIAL_DOORS = [
        {'name': '2/3', 'code': 'TWO_OR_THREE'},
        {'name': '4/5', 'code': 'FOUR_OR_FIVE'},
        {'name': '6/7', 'code': 'SIX_OR_SEVEN'},
    ]

    for business in Business.objects.all():
        # 1. Fuel Types
        benzin = FuelType.objects.filter(business=business, name__iexact='Benzin').first()
        if benzin and not FuelType.objects.filter(business=business, name='Petrol').exists():
            benzin.name = 'Petrol'
            benzin.mobile_de_mapping = 'PETROL'
            benzin.is_protected = True
            benzin.save()

        elektro = FuelType.objects.filter(business=business, name__iexact='Elektro').first()
        if elektro and not FuelType.objects.filter(business=business, name='Electric').exists():
            elektro.name = 'Electric'
            elektro.mobile_de_mapping = 'ELECTRIC'
            elektro.is_protected = True
            elektro.save()

        for item in OFFICIAL_FUELS:
            FuelType.objects.update_or_create(
                business=business,
                name=item['name'],
                defaults={
                    'mobile_de_mapping': item['code'],
                    'is_protected': True,
                    'is_active': True,
                }
            )

        # 2. Body Types
        for item in OFFICIAL_BODIES:
            BodyType.objects.update_or_create(
                business=business,
                name=item['name'],
                defaults={
                    'mobile_de_mapping': item['code'],
                    'is_protected': True,
                    'is_active': True,
                }
            )
        BodyType.objects.filter(business=business).exclude(
            name__in=[item['name'] for item in OFFICIAL_BODIES]
        ).update(is_protected=False)

        # 3. Colors
        for item in OFFICIAL_COLORS:
            Color.objects.update_or_create(
                business=business,
                name=item['name'],
                defaults={
                    'mobile_de_mapping': item['code'],
                    'is_protected': True,
                    'is_active': True,
                }
            )
        Color.objects.filter(business=business).exclude(
            name__in=[item['name'] for item in OFFICIAL_COLORS]
        ).update(is_protected=False)

        # 4. Doors
        for item in OFFICIAL_DOORS:
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
            name__in=[item['name'] for item in OFFICIAL_DOORS]
        ).update(is_protected=False)


class Migration(migrations.Migration):

    dependencies = [
        ('manager', '0071_bodytype_is_protected_bodytype_mobile_de_mapping_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_protected_choices, migrations.RunPython.noop),
    ]
