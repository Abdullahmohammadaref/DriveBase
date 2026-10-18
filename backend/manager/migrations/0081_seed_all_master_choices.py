from django.db import migrations


def seed_all_master_choices(apps, schema_editor):
    from manager.models import Business as RealBusiness
    from manager.services.choices_seeder import seed_choices_for_business
    for business in RealBusiness.objects.all():
        seed_choices_for_business(business)


def reverse_seed(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('manager', '0080_consolidate_zero_tax_choices'),
    ]

    operations = [
        migrations.RunPython(seed_all_master_choices, reverse_seed),
    ]
