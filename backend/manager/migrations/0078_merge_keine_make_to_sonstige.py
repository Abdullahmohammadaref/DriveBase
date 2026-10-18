from django.db import migrations

ALL_CLASSES = [
    'Car', 'Motorbike', 'Motorhome', 'VanUpTo7500', 'TruckOver7500',
    'SemiTrailerTruck', 'Trailer', 'SemiTrailer', 'ConstructionMachine',
    'AgriculturalVehicle', 'ForkliftTruck', 'Bus', 'EBike'
]


def merge_keine_make_to_sonstige(apps, schema_editor):
    Business = apps.get_model('manager', 'Business')
    Make = apps.get_model('manager', 'Make')
    VehicleModel = apps.get_model('manager', 'VehicleModel')
    Vehicle = apps.get_model('manager', 'Vehicle')

    for business in Business.objects.all():
        # 1. Ensure canonical 'Sonstige' Make exists for this business
        sonstige_make, _ = Make.objects.update_or_create(
            business=business,
            name='Sonstige',
            defaults={
                'mobile_de_mapping': 'Sonstige',
                'vehicle_classes': ALL_CLASSES,
                'is_protected': True,
                'is_active': True,
            }
        )

        # 2. Ensure canonical 'Sonstige' Model exists under 'Sonstige' Make
        sonstige_model, _ = VehicleModel.objects.update_or_create(
            business=business,
            make=sonstige_make,
            name='Sonstige',
            defaults={
                'mobile_de_mapping': 'Sonstige',
                'is_protected': True,
                'is_active': True,
            }
        )

        # 3. Reassign any vehicles pointing to 'Keine' Make or Model
        keine_makes = Make.objects.filter(
            business=business,
            name__iexact='Keine'
        ).exclude(id=sonstige_make.id)

        for k_make in keine_makes:
            keine_models = VehicleModel.objects.filter(make=k_make)
            for k_model in keine_models:
                Vehicle.objects.filter(model=k_model).update(model=sonstige_model)
                k_model.delete()
            Vehicle.objects.filter(make=k_make).update(make=sonstige_make)
            k_make.delete()

        # Delete any dangling 'Keine' models
        dangling_keine_models = VehicleModel.objects.filter(
            business=business,
            name__iexact='Keine'
        ).exclude(id=sonstige_model.id)
        for d_model in dangling_keine_models:
            Vehicle.objects.filter(model=d_model).update(model=sonstige_model)
            d_model.delete()


def reverse_merge(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('manager', '0077_merge_wohnmobil_vehicle_type'),
    ]

    operations = [
        migrations.RunPython(merge_keine_make_to_sonstige, reverse_merge),
    ]
