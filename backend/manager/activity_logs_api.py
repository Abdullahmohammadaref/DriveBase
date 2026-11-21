"""
Django Ninja API for Activity Logs.

This module provides REST API endpoints for:
- Fetching recent activity logs (for header notifications)
- Listing all activity logs with pagination and filtering
"""

from ninja import Router
from ninja.security import django_auth
from typing import Optional

from .models import ActivityLog, Business, User


# Create router with session authentication
router = Router(auth=django_auth, tags=["Activity Logs"])


def get_user_business(request) -> Business:
    """Get the authenticated user's business"""
    return request.user.business


@router.get("/users")
def get_users_for_filter(request):
    """
    Get list of users for the filter dropdown.
    """
    business = get_user_business(request)
    
    # Get all users that have activity logs for this business
    user_ids = ActivityLog.objects.filter(business=business).values_list('user_id', flat=True).distinct()
    has_system_logs = None in user_ids
    valid_user_ids = [uid for uid in user_ids if uid is not None]
    users = User.objects.filter(id__in=valid_user_ids, business=business)
    
    user_list = [
        {"id": u.id, "name": u.username}
        for u in users
    ]
    if has_system_logs:
        user_list.insert(0, {"id": "system", "name": "System"})

    return {
        "users": user_list
    }


@router.get("/recent")
def get_recent_activity_logs(request):
    """
    Get the 5 most recent activity logs for the header notification dropdown.
    Returns minimal data for quick display.
    """
    business = get_user_business(request)
    
    print(f"[ActivityLog-API] Fetching recent logs for business: {business}")
    
    logs = ActivityLog.objects.filter(business=business).select_related('user').order_by('-timestamp')[:5]
    
    total_count = ActivityLog.objects.filter(business=business).count()
    print(f"[ActivityLog-API] Total logs in database for this business: {total_count}")
    
    result_logs = list(logs)
    print(f"[ActivityLog-API] Returning {len(result_logs)} logs")
    
    return {
        "logs": [
            {
                "id": log.id,
                "user_name": log.user.username if log.user else "System",
                "is_system": log.user is None,
                "action": log.action,
                "action_display": str(dict(ActivityLog.ACTION_CHOICES).get(log.action, log.action)),
                "entity_type": log.entity_type,
                "entity_type_display": str(dict(ActivityLog.ENTITY_CHOICES).get(log.entity_type, log.entity_type)),
                "entity_id": log.entity_id,
                "entity_name": log.entity_name,
                "timestamp": log.timestamp.isoformat(),
            }
            for log in result_logs
        ]
    }


@router.get("/")
def list_activity_logs(
    request,
    page: int = 1,
    per_page: int = 20,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    user_id: Optional[str] = None,
    sort: str = "timestamp",
    order: str = "desc",
):
    """
    List activity logs with pagination and filtering.
    For the Activity Logs page.
    """
    business = get_user_business(request)
    
    print(f"[ActivityLog-API] Listing logs for business: {business}")
    
    qs = ActivityLog.objects.filter(business=business).select_related('user')
    
    # Apply filters
    if action:
        qs = qs.filter(action=action)
    
    if entity_type:
        qs = qs.filter(entity_type=entity_type)
    
    if user_id:
        if str(user_id).lower() in ["system", "none", "null"]:
            qs = qs.filter(user__isnull=True)
        else:
            try:
                qs = qs.filter(user_id=int(user_id))
            except (ValueError, TypeError):
                pass
    
    # Apply sorting
    sort_field = sort if sort in ["timestamp", "action", "entity_type", "user__username"] else "timestamp"
    if order == "desc":
        sort_field = f"-{sort_field}"
    qs = qs.order_by(sort_field)
    
    # Pagination
    total = qs.count()
    pages = (total + per_page - 1) // per_page if total > 0 else 1
    offset = (page - 1) * per_page
    logs = qs[offset:offset + per_page]
    
    print(f"[ActivityLog-API] Found {total} total logs, returning page {page}")
    
    return {
        "items": [
            {
                "id": log.id,
                "user_name": log.user.username if log.user else "System",
                "user_id": log.user.id if log.user else None,
                "is_system": log.user is None,
                "action": log.action,
                "action_display": str(dict(ActivityLog.ACTION_CHOICES).get(log.action, log.action)),
                "entity_type": log.entity_type,
                "entity_type_display": str(dict(ActivityLog.ENTITY_CHOICES).get(log.entity_type, log.entity_type)),
                "entity_id": log.entity_id,
                "entity_name": log.entity_name,
                "details": log.details,
                "timestamp": log.timestamp.isoformat(),
            }
            for log in logs
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": pages,
    }
