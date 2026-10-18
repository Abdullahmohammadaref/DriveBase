import sys
import logging
from django.db.models.signals import post_save
from django.dispatch import receiver
from manager.models import Business

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Business)
def handle_new_business_created(sender, instance, created, **kwargs):
    """
    Automatically seed baseline and standard choices when a new Business is created.
    Ensures zero manual setup for newly registered dealerships.
    Skips execution during test suite execution to allow isolated fixture creation.
    """
    if 'test' in sys.argv:
        return

    if created:
        try:
            logger.info("New business created: %s (id=%s). Seeding default choices...", instance.name, instance.id)
            from manager.services.choices_seeder import seed_choices_for_business
            stats = seed_choices_for_business(instance)
            logger.info("Successfully seeded default choices for business %s: %s", instance.id, stats)
        except Exception as e:
            logger.exception("Failed to seed choices for business %s: %s", instance.id, e)
