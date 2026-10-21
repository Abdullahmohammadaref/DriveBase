import json
from unittest.mock import patch

from django.core import mail
from django.test import override_settings

from django.contrib.auth import get_user_model

from .test_setup import BaseTestCase

User = get_user_model()


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    EMAIL_FROM="noreply@example.com",
)
class LoginRequestApiTests(BaseTestCase):
    def post_login(self, payload):
        return self.client.post(
            "/api/auth/request-login",
            data=json.dumps(payload),
            content_type="application/json",
        )

    def test_manager_login_request_sends_email_with_configured_sender(self):
        response = self.post_login(
            {
                "username": "manager_a",
                "password": "testpass123",
                "login_type": "manager",
            }
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertTrue(data["request_id"])
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].from_email, "noreply@example.com")

    def test_manager_login_returns_clear_error_when_email_send_fails(self):
        with patch("manager.auth_api.send_auth_email", side_effect=Exception("smtp failure")):
            response = self.post_login(
                {
                    "username": "manager_a",
                    "password": "testpass123",
                    "login_type": "manager",
                }
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["detail"],
            "Failed to send login email. Please try again.",
        )

    def test_manager_login_by_email_returns_clear_error_for_duplicate_email(self):
        User.objects.create_user(
            username="manager_dup",
            password="anotherpass123",
            email="manager_a@test.com",
            business=self.business_a,
            is_manager=True,
        )

        response = self.post_login(
            {
                "email": "manager_a@test.com",
                "password": "testpass123",
                "login_type": "manager",
            }
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Please use your username instead.", response.json()["detail"])

    def test_manager_login_exempt_from_csrf_requirement(self):
        """Verify desktop clients can request login without a pre-existing CSRF cookie."""
        from django.test import Client
        csrf_client = Client(enforce_csrf_checks=True)
        response = csrf_client.post(
            "/api/auth/request-login",
            data=json.dumps({
                "username": "manager_a",
                "password": "testpass123",
                "login_type": "manager",
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])
