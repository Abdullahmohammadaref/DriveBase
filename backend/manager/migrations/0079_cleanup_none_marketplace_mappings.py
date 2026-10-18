from django.db import migrations


def cleanup_none_marketplace_mappings(apps, schema_editor):
    BodyType = apps.get_model('manager', 'BodyType')
    FuelType = apps.get_model('manager', 'FuelType')
    DoorsChoice = apps.get_model('manager', 'DoorsChoice')
    Make = apps.get_model('manager', 'Make')
    VehicleModel = apps.get_model('manager', 'VehicleModel')

    # Nullify any pseudo-code 'NONE' mappings that cause invalid yellow banners
    BodyType.objects.filter(mobile_de_mapping__iexact='NONE').update(mobile_de_mapping=None)
    FuelType.objects.filter(mobile_de_mapping__iexact='NONE').update(mobile_de_mapping=None)
    DoorsChoice.objects.filter(mobile_de_mapping__iexact='NONE').update(mobile_de_mapping=None)
    Make.objects.filter(mobile_de_mapping__iexact='NONE').update(mobile_de_mapping='Sonstige')
    VehicleModel.objects.filter(mobile_de_mapping__iexact='NONE').update(mobile_de_mapping='Sonstige')


class Migration(migrations.Migration):

    dependencies = [
        ('manager', '0078_merge_keine_make_to_sonstige'),
    ]

    operations = [
        migrations.RunPython(cleanup_none_marketplace_mappings, migrations.RunPython.noop),
    ]
