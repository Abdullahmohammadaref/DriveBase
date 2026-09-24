import { Page, Locator, expect } from '@playwright/test';

export class TransactionsPage {
    readonly page: Page;
    readonly businessSlug: string;

    constructor(page: Page, businessSlug: string = 'haselhorst-automobile-gmbh') {
        this.page = page;
        this.businessSlug = businessSlug;
    }

    async gotoList() {
        await this.page.goto(`/${this.businessSlug}/transactions`);
        await this.page.waitForLoadState('networkidle');
    }

    async gotoNew() {
        await this.page.goto(`/${this.businessSlug}/transactions/new`);
        await this.page.waitForLoadState('networkidle');
    }

    async gotoEdit(internalId: number) {
        await this.page.goto(`/${this.businessSlug}/transactions/${internalId}/edit`);
        await this.page.waitForLoadState('networkidle');
    }

    async openImportModal() {
        await this.page.locator('button:has-text("Import CSV"), button:has-text("CSV importieren")').first().click();
        await expect(this.page.locator('text=/Import (CSV )?Transactions|Transaktionen importieren/i').first()).toBeVisible();
    }

    async uploadStarMoneyCsv(csvContent: string, filename: string = 'starmoney_export.csv') {
        await this.openImportModal();

        const modal = this.page.locator('div[role="dialog"]').last();

        // Set file directly on input
        const fileInput = modal.locator('input[type="file"][accept*=".csv"]').first();
        await fileInput.setInputFiles({
            name: filename,
            mimeType: 'text/csv',
            buffer: Buffer.from(csvContent, 'utf-8'),
        });

        // Select payment method in modal
        const methodSelect = modal.locator('button[role="combobox"]').first();
        await methodSelect.click();
        await this.page.waitForTimeout(200);

        const popper = this.page.locator('[data-slot="popover-content"]:visible, [data-radix-popper-content-wrapper]:visible').last();
        await popper.locator('div.overflow-y-auto button, button[role="option"]').first().click();
        await this.page.waitForTimeout(200);

        // Click Import
        const uploadBtn = modal.locator('button:has-text("Import"), button:has-text("Upload"), button:has-text("Importieren")').last();
        await expect(uploadBtn).toBeEnabled({ timeout: 5000 });
        await uploadBtn.click();
    }
}
