from decimal import Decimal
from django.db import migrations


def consolidate_zero_tax_choices(apps, schema_editor):
    TaxPercentage = apps.get_model('manager', 'TaxPercentage')
    Vehicle = apps.get_model('manager', 'Vehicle')
    Business = apps.get_model('manager', 'Business')

    for biz in Business.objects.all():
        # Find all 0% / tax-free / differenzbesteuerung choices for this business
        zero_taxes = list(
            TaxPercentage.objects.filter(business=biz).filter(
                name__icontains='differenz'
            ) | TaxPercentage.objects.filter(business=biz, percentage=Decimal('0.00')) | TaxPercentage.objects.filter(business=biz, is_no_tax=True)
        )

        unique_zero_taxes = {t.id: t for t in zero_taxes}
        zero_tax_list = list(unique_zero_taxes.values())

        if not zero_tax_list:
            continue

        # Find or establish canonical "0% Steuerfrei"
        canonical = next((t for t in zero_tax_list if t.name == "0% Steuerfrei"), None)
        if not canonical:
            # Prefer renaming 'Differenzbesteuerung' choice so existing FKs stay attached to the primary ID
            canonical = next((t for t in zero_tax_list if "differenz" in t.name.lower()), zero_tax_list[0])
            canonical.name = "0% Steuerfrei"
            canonical.percentage = Decimal("0.00")
            canonical.is_no_tax = True
            canonical.is_active = True
            canonical.save()

        # Remap any other zero tax choices to canonical and delete them
        for other in zero_tax_list:
            if other.id != canonical.id:
                Vehicle.objects.filter(buy_tax_id=other.id).update(buy_tax_id=canonical.id)
                Vehicle.objects.filter(sale_tax_id=other.id).update(sale_tax_id=canonical.id)
                TaxPercentage.objects.filter(id=other.id).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('manager', '0079_cleanup_none_marketplace_mappings'),
    ]

    operations = [
        migrations.RunPython(consolidate_zero_tax_choices, migrations.RunPython.noop),
    ]
