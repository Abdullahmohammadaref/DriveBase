import { Page, Locator, expect } from '@playwright/test';
import { getLatestAuthRequest, getAuthRequest, forceExpireAuthRequest, BACKEND_URL } from '../fixtures/test-helpers';

export class AuthPage {
    readonly page: Page;
    readonly usernameInput: Locator;
    readonly passwordInput: Locator;
    readonly emailInput: Locator;
    readonly submitButton: Locator;
    readonly errorMessage: Locator;
    readonly successMessage: Locator;

    constructor(page: Page) {
        this.page = page;
        this.usernameInput = page.locator('input[name="username"], input[id="username"]');
        this.passwordInput = page.locator('input[name="password"], input[id="password"]');
        this.emailInput = page.locator('input[name="email"], input[id="email"]');
        this.submitButton = page.locator('button[type="submit"]');
        this.errorMessage = page.locator('[role="alert"], .text-destructive, .text-rose-600, .bg-destructive\\/10');
        this.successMessage = page.locator('.text-emerald-600, .bg-emerald-50, .text-green-600');
    }

    async gotoLanding() {
        await this.page.goto('/login');
    }

    async gotoManagerLogin() {
        await this.page.goto('/login/manager');
    }

    async gotoEmployeeLogin() {
        await this.page.goto('/login/employee');
    }

    async gotoRegister() {
        await this.page.goto('/register');
    }

    async gotoForgotPassword() {
        await this.page.goto('/login/forgot-password');
    }

    async gotoForgotEmail() {
        await this.page.goto('/login/forgot-email');
    }

    /**
     * Submit manager login and complete the 2FA email polling approval flow.
     */
    async loginAsManager(usernameOrEmail: string, password: string): Promise<void> {
        await this.gotoManagerLogin();
        
        // Determine whether input is email or username
        if (usernameOrEmail.includes('@')) {
            await this.emailInput.fill(usernameOrEmail);
        } else {
            await this.usernameInput.fill(usernameOrEmail);
        }
        await this.passwordInput.fill(password);
        await this.submitButton.click();

        // Wait for polling UI to appear
        await expect(this.page.getByText(/check your email|prüfen sie ihre e-mail|waiting for confirmation/i)).toBeVisible({ timeout: 10000 });

        // Retrieve latest auth approval link from zero-latency test helper
        const latestRequest = await getLatestAuthRequest('manager_login');
        expect(latestRequest).toBeTruthy();
        expect(latestRequest.approval_url).toBeTruthy();

        // Complete approval in parallel/secondary request context
        const response = await fetch(latestRequest.approval_url);
        expect(response.ok).toBeTruthy();

        // Polling UI should automatically detect approval and redirect to dashboard
        await this.page.waitForURL(/.*\/dashboard/, { timeout: 15000 });
    }

    /**
     * Fast-track direct login for non-auth tests (DEBUG endpoint).
     */
    async fastLogin(username: string = 'ooo', password: string = 'password'): Promise<void> {
        // Seed CSRF cookie
        await this.page.request.get(`${BACKEND_URL}/api/auth/csrf`);
        const cookies = await this.page.context().cookies();
        const csrfToken = cookies.find(c => c.name === 'csrftoken')?.value || '';

        const response = await this.page.request.post(`${BACKEND_URL}/api/auth/debug-login`, {
            headers: {
                'X-CSRFToken': csrfToken,
                'Referer': `${BACKEND_URL}/`,
            },
            data: {
                username,
                password,
                login_type: 'manager',
            },
        });
        expect(response.ok()).toBeTruthy();

        // Navigate to dashboard
        await this.page.goto('/haselhorst-automobile-gmbh/dashboard');
        await this.page.waitForLoadState('networkidle');
    }
}
