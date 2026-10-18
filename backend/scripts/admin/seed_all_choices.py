"""
ACAR Dealership OS - Master Choices Seeding CLI
===============================================
CLI runner to seed/synchronize all standard choices for a dealership business:
  Tier 1: mobile.de Marketplace Choices (Makes, Models, Body Types, Colors, Fuel Types, Doors)
  Tier 2: ACAR-Internal Choices (Countries, Cities, Payment Methods, Tax Percentages,
          Vehicle Types, Damage Types, Categories, Subcategories, Key Numbers)

Usage:
  python scripts/admin/seed_all_choices.py [--business-id <id>] [--all-businesses]
"""

import os
import sys
import argparse

# Ensure backend directory is in sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "acar.settings")
import django
django.setup()

from django.db import transaction
from manager.models import Business
from manager.services.choices_seeder import seed_choices_for_business


def main():
    parser = argparse.ArgumentParser(description="Seed standard choice options for ACAR Dealership OS.")
    parser.add_argument("--business-id", type=int, default=1, help="Business ID to seed choices for (default: 1)")
    parser.add_argument("--all-businesses", action="store_true", help="Seed choices for ALL businesses in the database")

    args = parser.parse_args()

    print("=================================================================")
    print("  ACAR Dealership OS - Choices Seeding & Disaster Recovery")
    print("=================================================================")

    if args.all_businesses:
        businesses = list(Business.objects.all())
        if not businesses:
            print("No businesses found in database.")
            return
        print(f"Targeting ALL {len(businesses)} businesses in database.")
    else:
        business = Business.objects.filter(id=args.business_id).first()
        if not business:
            print(f"Error: Business with ID {args.business_id} does not exist.")
            return
        businesses = [business]
        print(f"Targeting Business ID: {business.id} ({business.name})")

    for b in businesses:
        with transaction.atomic():
            stats = seed_choices_for_business(b)
            print("\nCompleted Successfully! Seeded counts:")
            for category, count in stats.items():
                print(f"  - {category:18s}: {count}")

    print("\n=================================================================")
    print("  All Choices Seeded & Synchronized Successfully!")
    print("=================================================================\n")


if __name__ == "__main__":
    main()
