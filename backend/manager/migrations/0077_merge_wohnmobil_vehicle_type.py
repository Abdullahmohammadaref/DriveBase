from django.db import migrations


def merge_wohnmobil_vehicle_type(apps, schema_editor):
    Business = apps.get_model('manager', 'Business')
    VehicleType = apps.get_model('manager', 'VehicleType')
    Vehicle = apps.get_model('manager', 'Vehicle')

    for business in Business.objects.all():
        # 1. Ensure canonical 'Wohnmobil / Wohnwagen' exists
        canonical_vt, _ = VehicleType.objects.update_or_create(
            business=business,
            name='Wohnmobil / Wohnwagen',
            defaults={
                'mobile_de_mapping': 'Motorhome',
                'is_protected': True,
                'is_active': True,
            }
        )

        # 2. Find any legacy 'Wohnmobil' records excluding the canonical one
        legacy_vts = VehicleType.objects.filter(
            business=business,
            name__iexact='Wohnmobil'
        ).exclude(id=canonical_vt.id)

        # 3. Safely reassign any vehicles to the canonical record
        for old_vt in legacy_vts:
            Vehicle.objects.filter(vehicle_type=old_vt).update(vehicle_type=canonical_vt)
            old_vt.delete()


def reverse_merge(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('manager', '0076_fueltype_doorschoice_vehicle_classes'),
    ]

    operations = [
        migrations.RunPython(merge_wohnmobil_vehicle_type, reverse_merge),
    ]
