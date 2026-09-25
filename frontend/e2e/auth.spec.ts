import { test, expect } from '@playwright/test';
import { AuthPage } from './pages/AuthPage';
import {
    getLatestAuthRequest,
    getAuthRequest,
    forceExpireAuthRequest,
    BACKEND_URL,
    FRONTEND_URL
} from './fixtures/test-helpers';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Phase 1: Authentication, Registration, 2FA & Security Suite', () => {

    test.beforeEach(async ({ context }) => {
        await context.clearCookies();
    });

    test('Story 1.8: Form validation assertions on Manager Login & Register', async ({ page }) => {
        const auth = new AuthPage(page);

        // 1. Manager Login Validation
        await auth.gotoManagerLogin();

        // Switch to email mode & test client/server error with non-existent account
        const emailTab = page.locator('button:has(svg.lucide-mail), button:has-text("Email"), button:has-text("E-Mail")').first();
        if (await emailTab.isVisible()) {
            await emailTab.click();
        }

        await page.locator('#email').fill('non_existent_ghost_manager@dealership.de');
        await page.locator('#password').fill('wrongpassword123');
        await page.locator('button[type="submit"]').click();

        // Expect error message
        await expect(page.locator('text=/Invalid credentials|Ungültige Anmeldedaten|No user found/i').first()).toBeVisible({ timeout: 5000 });

        // 2. Registration Client Validation
        await auth.gotoRegister();

        // Short username (< 3 chars)
        await page.locator('#reg-username').fill('ab');
        await page.locator('#reg-email').fill('test@dealership.de');
        await page.locator('#reg-business').fill('Test Car House');
        await page.locator('#reg-password').fill('Short1!');
        await page.locator('#reg-confirm-password').fill('Short1!');
        await page.locator('button[type="submit"]').click();

        await expect(page.locator('text=/Username must be at least 3 characters|mindestens 3 Zeichen/i').first()).toBeVisible();

        // Password mismatch
        await page.locator('#reg-username').fill('validuser');
        await page.locator('#reg-password').fill('SecurePassword123!');
        await page.locator('#reg-confirm-password').fill('DifferentPassword123!');
        await page.locator('button[type="submit"]').click();

        await expect(page.locator('text=/Passwords do not match|Passwörter stimmen nicht überein/i').first()).toBeVisible();

        // Weak password (< 8 chars)
        await page.locator('#reg-password').fill('short');
        await page.locator('#reg-confirm-password').fill('short');
        await page.locator('button[type="submit"]').click();

        await expect(page.locator('text=/Password must be at least 8 characters|mindestens 8 Zeichen/i').first()).toBeVisible();
    });

    test('Story 1.1: Manager registration, email verification & admin activation', async ({ page }) => {
        const auth = new AuthPage(page);
        const timestamp = Date.now();
        const testUsername = `marcus_${timestamp}`;
        const testEmail = `marcus_${timestamp}@nord-auto.de`;
        const testPassword = 'SecurePassword2026!';
        const testBusiness = `Neue Automobile Nord ${timestamp}`;

        await auth.gotoRegister();

        await page.locator('#reg-username').fill(testUsername);
        await page.locator('#reg-email').fill(testEmail);
        await page.locator('#reg-business').fill(testBusiness);
        await page.locator('#reg-password').fill(testPassword);
        await page.locator('#reg-confirm-password').fill(testPassword);

        // Submit registration
        await page.locator('button[type="submit"]').click();

        // Wait for email verification polling screen
        await expect(page.locator('text=/Check Your Email|Prüfen Sie Ihre E-Mail|Verify/i').first()).toBeVisible({ timeout: 10000 });

        // Zero-latency intercept verification link
        const authReq = await getLatestAuthRequest('register_verify_email');
        expect(authReq).toBeTruthy();
        expect(authReq.approval_url).toBeTruthy();

        // Trigger email verification link
        const verifyRes = await fetch(authReq.approval_url);
        expect(verifyRes.ok).toBeTruthy();

        // Verify UI updates to verification complete / waiting for admin
        await expect(page.locator('text=/Verification Complete|Verifizierung abgeschlossen|Waiting for admin|Admin approval|Pending Approval|Wartet auf Genehmigung/i').first()).toBeVisible({ timeout: 15000 });

        // Simulate Admin Activation via test helper
        const activateRes = await fetch(`${BACKEND_URL}/api/auth/test-helper/activate-user/${testUsername}`);
        expect(activateRes.ok).toBeTruthy();
        const activateData = await activateRes.json();
        expect(activateData.is_active).toBe(true);

        const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Weiter")');
        if (await continueBtn.isVisible()) {
            await continueBtn.click();
        }

        // Now user can log in
        await auth.gotoManagerLogin();
        const userTab = page.locator('button:has(svg.lucide-user), button:has-text("Username"), button:has-text("Benutzername")').first();
        if (await userTab.isVisible()) {
            await userTab.click();
        }
        await page.locator('#username').fill(testUsername);
        await page.locator('#password').fill(testPassword);
        await page.locator('button[type="submit"]').click();

        // Wait for 2FA login email polling
        await expect(page.locator('text=/Check Your Email|Prüfen Sie Ihre E-Mail/i').first()).toBeVisible({ timeout: 10000 });

        const loginAuthReq = await getLatestAuthRequest('manager_login');
        expect(loginAuthReq).toBeTruthy();
        const loginApproveRes = await fetch(loginAuthReq.approval_url);
        expect(loginApproveRes.ok).toBeTruthy();

        // Polling auto-redirects to dashboard
        await page.waitForURL(/.*\/dashboard/, { timeout: 15000 });
        expect(page.url()).toContain('/dashboard');
    });

    test('Story 1.2: Manager login with 2FA email polling & case-insensitive email normalization', async ({ page }) => {
        const auth = new AuthPage(page);

        await auth.gotoManagerLogin();

        // Test with uppercase email: AREF2005@HOTMAIL.COM
        const emailTab = page.locator('button:has(svg.lucide-mail), button:has-text("Email"), button:has-text("E-Mail")').first();
        if (await emailTab.isVisible()) {
            await emailTab.click();
        }

        await page.locator('#email').fill('AREF2005@HOTMAIL.COM');
        await page.locator('#password').fill('password');
        await page.locator('button[type="submit"]').click();

        // UI transitions to 2FA polling screen
        await expect(page.locator('text=/Check Your Email|Prüfen Sie Ihre E-Mail/i').first()).toBeVisible({ timeout: 10000 });

        // Intercept approval link
        const latestRequest = await getLatestAuthRequest('manager_login');
        expect(latestRequest).toBeTruthy();
        expect(latestRequest.recipient_email?.toLowerCase()).toBe('aref2005@hotmail.com');

        // Approve in secondary context
        const response = await fetch(latestRequest.approval_url);
        expect(response.ok).toBeTruthy();

        // Page detects approval and navigates to dealership dashboard
        await page.waitForURL(/.*\/dashboard/, { timeout: 15000 });
        expect(page.url()).toContain('/haselhorst-automobile');
        expect(page.url()).toContain('/dashboard');

        // Save session storageState for operational lifecycle tests
        const authDir = path.resolve('.auth');
        if (!fs.existsSync(authDir)) {
            fs.mkdirSync(authDir, { recursive: true });
        }
        await page.context().storageState({ path: path.join(authDir, 'manager_session.json') });
    });

    test('Story 1.3: Unauthenticated password reset via login email token', async ({ page }) => {
        const auth = new AuthPage(page);

        await auth.gotoForgotPassword();

        // Enter email and submit
        await page.locator('input[type="email"], #email').fill('aref2005@hotmail.com');
        await page.locator('button[type="submit"]').click();

        // UI transitions to waiting polling screen
        await expect(page.locator('text=/Check Your Email|Prüfen Sie Ihre E-Mail|Reset/i').first()).toBeVisible({ timeout: 10000 });

        // Intercept password_reset auth request
        const resetReq = await getLatestAuthRequest('password_reset');
        expect(resetReq).toBeTruthy();
        expect(resetReq.action_type).toBe('password_reset');

        // Approve reset link
        const approveRes = await fetch(resetReq.approval_url);
        expect(approveRes.ok).toBeTruthy();

        // UI should transition to new password form
        await expect(page.locator('#password, input[name="password"]').first()).toBeVisible({ timeout: 10000 });

        // Enter matching new password
        const newPassword = 'NewSecretPassword2026!';
        await page.locator('#password').fill(newPassword);
        await page.locator('#confirm-password, #confirmPassword').fill(newPassword);
        await page.locator('button[type="submit"]').click();

        // Expect success message
        await expect(page.locator('text=/Password Reset Successfully|Erfolgreich|Your password has been reset/i').first()).toBeVisible({ timeout: 10000 });

        // Reset password back to standard 'password' for future test runs
        await page.goto('/login/forgot-password');
        await page.locator('input[type="email"], #email').fill('aref2005@hotmail.com');
        await page.locator('button[type="submit"]').click();
        await page.waitForTimeout(500);
        const restoreReq = await getLatestAuthRequest('password_reset');
        await fetch(restoreReq.approval_url);
        await page.locator('#password').fill('password');
        await page.locator('#confirm-password, #confirmPassword').fill('password');
        await page.locator('button[type="submit"]').click();
        await expect(page.locator('text=/Password Reset Successfully|Erfolgreich/i').first()).toBeVisible({ timeout: 10000 });
    });

    test('Story 1.4: Authenticated password change from User Settings', async ({ page }) => {
        const auth = new AuthPage(page);
        await auth.fastLogin('ooo', 'password');

        await page.goto('/haselhorst-automobile-gmbh/user-settings');
        await page.waitForLoadState('networkidle');

        // Locate password change section
        const newPasswordInput = page.locator('#settings-new-password');
        await expect(newPasswordInput).toBeVisible();

        const tempPassword = 'TemporarySecretPassword2026!';
        await newPasswordInput.fill(tempPassword);
        await page.locator('#settings-confirm-password').fill(tempPassword);

        // Click Change Password button
        await page.locator('button:has-text("Change Password"), button:has-text("Passwort ändern")').click();

        // Polling status appears
        await expect(page.locator('text=/Überprüfen Sie Ihr E-Mail-Postfach|Check Your Email|Prüfen Sie Ihre E-Mail/i').first()).toBeVisible({ timeout: 10000 });

        // Intercept password_change request
        const pwChangeReq = await getLatestAuthRequest('password_change');
        expect(pwChangeReq).toBeTruthy();
        expect(pwChangeReq.action_type).toBe('password_change');

        // Approve in secondary context
        const approveRes = await fetch(pwChangeReq.approval_url);
        expect(approveRes.ok).toBeTruthy();

        // Assert success in UI
        await expect(page.locator('text=/Password Updated|Passwort aktualisiert/i').first()).toBeVisible({ timeout: 15000 });

        // Revert password back to 'password' via backend debug helper
        await fetch(`${BACKEND_URL}/api/auth/test-helper/reset-user/ooo?password=password`);
    });

    test('Story 1.5: Forgot email recovery flow via backup email', async ({ page }) => {
        const auth = new AuthPage(page);
        await auth.gotoForgotEmail();

        // Fill username, password, registered backup email and new target email
        await page.locator('#username').fill('ooo');
        await page.locator('#password').fill('password');
        await page.locator('#backup-email').fill('gunmasterxox@gmail.com');
        await page.locator('#new-email').fill('recovered_target@dealership.de');

        await page.locator('button[type="submit"]').click();

        // UI transitions to polling for backup email
        await expect(page.locator('text=/Check Your Backup Email|Sicherheits-E-Mail|Backup-E-Mail/i').first()).toBeVisible({ timeout: 10000 });

        // Retrieve verify_email auth request
        const verifyReq = await getLatestAuthRequest('verify_email');
        expect(verifyReq).toBeTruthy();
        expect(verifyReq.action_type).toBe('verify_email');

        // Approve backup email
        const approveRes = await fetch(verifyReq.approval_url);
        expect(approveRes.ok).toBeTruthy();

        // UI transitions to polling for new email
        await expect(page.locator('text=/Check Your NEW Email|NEUE E-Mail|New Email/i').first()).toBeVisible({ timeout: 15000 });
    });

    test('Story 1.6: Two-step email change chain in User Settings', async ({ page }) => {
        const auth = new AuthPage(page);
        await auth.fastLogin('ooo', 'password');

        await page.goto('/haselhorst-automobile-gmbh/user-settings');
        await page.waitForLoadState('networkidle');

        const tempNewEmail = `temp_${Date.now()}@dealership.de`;
        const emailInput = page.locator('#settings-new-email');
        await expect(emailInput).toBeVisible();
        await emailInput.fill(tempNewEmail);

        // Click initiate email change
        await page.locator('button:has-text("E-Mail-Adresse ändern"), button:has-text("Change Email"), button:has-text("E-Mail ändern")').first().click();

        // Polling status appears for old email
        await expect(page.locator('text=/Überprüfen Sie Ihr E-Mail-Postfach|Check Your Email|Prüfen Sie Ihre E-Mail/i').first()).toBeVisible({ timeout: 10000 });

        // Step 1: Intercept and approve email_change_verify_old
        const oldReq = await getLatestAuthRequest('email_change_verify_old');
        expect(oldReq).toBeTruthy();
        const oldRes = await fetch(oldReq.approval_url);
        expect(oldRes.ok).toBeTruthy();

        // UI transitions to waiting for new email
        await expect(page.locator('text=/Überprüfen Sie Ihre neue E-Mail|Check Your New Email|NEUE E-Mail|New Email/i').first()).toBeVisible({ timeout: 15000 });

        // Step 2: Intercept and approve email_change_verify_new
        const newReq = await getLatestAuthRequest('email_change_verify_new');
        expect(newReq).toBeTruthy();
        const newRes = await fetch(newReq.approval_url);
        expect(newRes.ok).toBeTruthy();

        // UI transitions to Email Updated!
        await expect(page.locator('text=/Email Updated|E-Mail aktualisiert/i').first()).toBeVisible({ timeout: 15000 });

        // Restore original email 'aref2005@hotmail.com'
        await fetch(`${BACKEND_URL}/api/auth/test-helper/reset-user/ooo?email=aref2005@hotmail.com`);
    });

    test('Story 1.7: Employee login request & manager cross-device approval', async ({ browser }) => {
        // Create two distinct browser contexts: Context A (Employee), Context B (Manager)
        const employeeContext = await browser.newContext();
        const employeePage = await employeeContext.newPage();

        await employeePage.goto('http://localhost:5173/login/employee');

        // Fill employee credentials (existing employee in DB: y / y)
        await employeePage.locator('#username').fill('y');
        await employeePage.locator('#password').fill('y');
        await employeePage.locator('button[type="submit"]').click();

        // Employee page enters waiting for approval state
        await expect(employeePage.locator('text=/Waiting for Approval|Warten auf Genehmigung/i').first()).toBeVisible({ timeout: 10000 });

        // Retrieve employee login request
        const empReq = await getLatestAuthRequest('employee_login');
        expect(empReq).toBeTruthy();
        expect(empReq.action_type).toBe('employee_login');

        // Manager context approves request
        const managerContext = await browser.newContext();
        const managerPage = await managerContext.newPage();
        await managerPage.goto(empReq.approval_url);

        // Assert manager sees approval confirmation
        await expect(managerPage.locator('text=/Approved|Genehmigt|Success/i').first()).toBeVisible({ timeout: 10000 });

        // Employee page detects approval automatically and redirects
        await employeePage.waitForURL(/.*\/dashboard/, { timeout: 15000 });
        expect(employeePage.url()).toContain('/haselhorst-automobile');
        expect(employeePage.url()).toContain('/dashboard');

        await employeeContext.close();
        await managerContext.close();
    });

});
