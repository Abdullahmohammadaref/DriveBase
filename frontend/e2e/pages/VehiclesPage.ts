import { Page, Locator, expect } from '@playwright/test';

export interface VehicleCreationData {
    vin: string;
    make: string;
    model: string;
    kilometer: number;
    buyPrice: number;
    description?: string;
    internalComments?: string;
}

export class VehiclesPage {
    readonly page: Page;
    readonly businessSlug: string;

    constructor(page: Page, businessSlug: string = 'haselhorst-automobile-gmbh') {
        this.page = page;
        this.businessSlug = businessSlug;
    }

    async gotoList() {
        await this.page.goto(`/${this.businessSlug}/vehicles`);
        await this.page.waitForLoadState('networkidle');
    }

    async gotoNew() {
        await this.page.goto(`/${this.businessSlug}/vehicles/new`);
        await this.page.waitForLoadState('networkidle');
    }

    async gotoEdit(internalId: number) {
        await this.page.goto(`/${this.businessSlug}/vehicles/${internalId}/edit`);
        await this.page.waitForLoadState('networkidle');
    }

    async getVehicleCard(internalId: number): Promise<Locator> {
        return this.page.locator(`[data-testid="vehicle-card-${internalId}"], a[href*="/vehicles/${internalId}/edit"]`).first();
    }

    async setStatus(status: 'purchased' | 'ready_for_sale' | 'reserved' | 'sold' | 'inactive') {
        const labels: Record<string, RegExp> = {
            purchased: /Eingekauft|Purchased/i,
            ready_for_sale: /Verkaufsbereit|Ready for Sale/i,
            reserved: /Reserviert|Reserved/i,
            sold: /Verkauft|Sold/i,
            inactive: /Delete|Löschen|Deactivate|Deaktivieren|Inaktiv|Inactive/i,
        };
        const pattern = labels[status] || new RegExp(status, 'i');
        const statusBtn = this.page.locator('button').filter({ hasText: pattern }).first();
        if (await statusBtn.isVisible() && await statusBtn.isEnabled()) {
            await statusBtn.click();
            await this.page.waitForTimeout(300);

            if (status === 'inactive') {
                // If SmartDeleteModal opened, click confirm button
                const confirmBtn = this.page.locator('div[role="dialog"] button:has-text("Deactivate"), div[role="dialog"] button:has-text("Deaktivieren"), div[role="dialog"] button:has-text("Delete Permanently"), div[role="dialog"] button:has-text("Endgültig löschen")').last();
                if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                    await confirmBtn.click();
                    await this.page.waitForTimeout(500);
                }
            }
        }
    }

    async verifyAutoSaveState(state: 'saved' | 'saving' | 'failed') {
        if (state === 'saved') {
            await expect(this.page.locator('text=/Saved|Gespeichert/i').first()).toBeVisible({ timeout: 5000 });
        } else if (state === 'saving') {
            await expect(this.page.locator('text=/Saving|Speichern/i').first()).toBeVisible({ timeout: 5000 });
        }
    }
}
