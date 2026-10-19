import os
import sys
import json

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'drivebase.settings')
import django
django.setup()

from django.contrib.sessions.backends.db import SessionStore
from django.contrib.auth import get_user_model

User = get_user_model()
# Find active manager of Business 1
user = User.objects.filter(is_manager=True, is_active=True, business_id=1).first()
if not user:
    user = User.objects.filter(is_manager=True, is_active=True).first()

print(f"Ensuring session for Manager: {user.username} (ID: {user.pk}) in Business {user.business.name}")

s = SessionStore()
s['_auth_user_id'] = str(user.pk)
s['_auth_user_backend'] = 'django.contrib.auth.backends.ModelBackend'
s['_auth_user_hash'] = user.get_session_auth_hash()
s.save()

storage_state = {
    "cookies": [
        {
            "name": "sessionid",
            "value": s.session_key,
            "domain": "localhost",
            "path": "/",
            "expires": -1,
            "httpOnly": True,
            "secure": False,
            "sameSite": "Lax"
        },
        {
            "name": "csrftoken",
            "value": "playwright_csrf_token",
            "domain": "localhost",
            "path": "/",
            "expires": -1,
            "httpOnly": False,
            "secure": False,
            "sameSite": "Lax"
        }
    ],
    "origins": [
        {
            "origin": "http://localhost:5173",
            "localStorage": [
                {
                    "name": "drivebase_active_business",
                    "value": json.dumps({
                        "id": user.business.id,
                        "slug": user.business.name.lower().replace(" ", "-"),
                        "name": user.business.name
                    })
                }
            ]
        }
    ]
}

auth_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../frontend/.auth'))
os.makedirs(auth_dir, exist_ok=True)
auth_file = os.path.join(auth_dir, 'manager_session.json')

with open(auth_file, 'w') as f:
    json.dump(storage_state, f, indent=2)

print(f"Session key {s.session_key} saved to {auth_file}")
