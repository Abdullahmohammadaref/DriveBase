import { test, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Peer Deletion & Real-Time Unlinking Workflow', () => {
    test.use({ storageState: path.resolve(__dirname, '../.auth/manager_session.json') });
    test.describe.configure({ mode: 'serial' });

    const businessSlug = 'haselhorst-automobile-gmbh';

    test('1. Vehicle edit page displays Unlink button in inline transactions table', async ({ page }) => {
        // Navigate to Vehicle #1 edit page
        await page.goto(`/${businessSlug}/vehicles/1/edit`);
        await page.waitForLoadState('networkidle');

        // Scroll to transactions section
        const txSection = page.locator('text=/Transactions|Transaktionen/i').first();
        await expect(txSection).toBeVisible({ timeout: 10000 });
        await txSection.scrollIntoViewIfNeeded();

        // Verify that the Unlink button exists in the table actions
        const unlinkButtons = page.locator('button[title*="Unlink"], button[title*="trennen"]');
        const count = await unlinkButtons.count();
        expect(count).toBeGreaterThan(0);

        // Verify the first unlink button is visible
        await expect(unlinkButtons.first()).toBeVisible();
    });

    test('2. Transaction edit form displays discrete clearable (x) button on vehicle selector', async ({ page }) => {
        // Navigate to Transaction #1 edit page
        await page.goto(`/${businessSlug}/transactions/1/edit`);
        await page.waitForLoadState('networkidle');

        // Locate vehicle label and searchable select
        const vehicleLabel = page.locator('label:has-text("Vehicle"), label:has-text("Fahrzeug")').first();
        await expect(vehicleLabel).toBeVisible({ timeout: 10000 });

        // Locate the clear button inside the vehicle selector
        const clearBtn = page.locator('button[role="combobox"] span[title*="Clear selection"]');
        await expect(clearBtn).toBeVisible({ timeout: 5000 });
    });

    test('3. SmartDeleteModal for Vehicle displays vehicle-only permanent deletion options', async ({ page }) => {
        // Navigate to Vehicles list
        await page.goto(`/${businessSlug}/vehicles`);
        await page.waitForLoadState('networkidle');

        // Click delete on first vehicle
        const deleteBtn = page.locator('button:has-text("Delete"), button:has-text("Löschen")').first();
        await expect(deleteBtn).toBeVisible({ timeout: 10000 });
        await deleteBtn.click();

        // Modal should appear with dependency information
        const modal = page.locator('div[role="dialog"]');
        await expect(modal).toBeVisible({ timeout: 5000 });

        // Verify deactivation badge
        await expect(modal.locator('text=/Safe Deactivation|Sichere Deaktivierung/i')).toBeVisible();

        // Verify the manager permanent deletion checkbox mentions preserving transactions
        const preserveNotice = modal.locator('text=/Force permanent deletion of vehicle only|Transactions will be preserved|Transaktionen bleiben erhalten/i').first();
        await expect(preserveNotice).toBeVisible();

        // Check the checkbox
        const checkbox = modal.locator('input[type="checkbox"]');
        await checkbox.check();

        // Verify action button changes to "Delete Vehicle Only" / "Nur Fahrzeug löschen"
        const confirmBtn = modal.locator('button:has-text("Delete Vehicle Only"), button:has-text("Nur Fahrzeug löschen")');
        await expect(confirmBtn).toBeVisible();

        // Cancel modal safely without deleting
        const cancelBtn = modal.locator('button:has-text("Cancel"), button:has-text("Abbrechen")').first();
        await cancelBtn.click();
        await expect(modal).toBeHidden();
    });
});
