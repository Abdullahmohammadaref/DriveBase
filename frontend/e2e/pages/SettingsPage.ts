import { Page, Locator, expect } from '@playwright/test';

export class SettingsPage {
    readonly page: Page;
    readonly businessSlug: string;

    constructor(page: Page, businessSlug: string = 'haselhorst-automobile-gmbh') {
        this.page = page;
        this.businessSlug = businessSlug;
    }

    async gotoBusinessSettings() {
        await this.page.goto(`/${this.businessSlug}/business-settings`);
        await this.page.waitForLoadState('networkidle');
    }

    async gotoUserSettings() {
        await this.page.goto(`/${this.businessSlug}/user-settings`);
        await this.page.waitForLoadState('networkidle');
    }

    async gotoChoices() {
        await this.page.goto(`/${this.businessSlug}/choices`);
        await this.page.waitForLoadState('networkidle');
    }

    async gotoLegalEntities() {
        await this.page.goto(`/${this.businessSlug}/legal-entities`);
        await this.page.waitForLoadState('networkidle');
    }

    async triggerBusinessDataExport(): Promise<void> {
        await this.gotoBusinessSettings();
        const exportBtn = this.page.locator('button:has-text("Export Business Data"), button:has-text("Unternehmensdaten exportieren")').first();
        await expect(exportBtn).toBeVisible();
        await exportBtn.click();
    }
}
