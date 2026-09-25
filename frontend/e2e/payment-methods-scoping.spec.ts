import { test, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Payment Method Historical Archival & Real-Time Scoping Workflow', () => {
    test.use({ storageState: path.resolve(__dirname, '../.auth/manager_session.json') });
    test.describe.configure({ mode: 'serial' });

    const businessSlug = 'haselhorst-automobile-gmbh';

    test('Transaction preserves historical payment method when scope is disabled, and prunes it in real-time on selection change', async ({ page }) => {
        // 1. Navigate to Choices Management -> Payment Methods
        await page.goto(`/${businessSlug}/choices`);
        await page.waitForLoadState('networkidle');

        // Click Payment Methods tab in sidebar
        const pmTab = page.locator('nav[aria-label="Tabs"] button').filter({ hasText: /Payment Methods|Zahlungsmethoden/i }).first();
        await pmTab.click();
        await page.waitForTimeout(300);

        // Verify "Überweisung Sparkasse" is visible in list
        const sparkasseRow = page.locator('button').filter({ hasText: /Überweisung Sparkasse/i }).first();
        await expect(sparkasseRow).toBeVisible({ timeout: 10000 });

        // Ensure "Transactions" scope is currently enabled before the test starts
        await sparkasseRow.click();
        await page.waitForTimeout(300);

        const txCheckbox = page.getByRole('checkbox', { name: /Bookkeeping Transactions|Buchhaltung/i });
        if (!(await txCheckbox.isChecked())) {
            await txCheckbox.check();
            await page.getByRole('button', { name: /Speichern|Save/i }).first().click();
            await page.waitForTimeout(500);
        } else {
            // Close modal if already checked
            await page.getByRole('button', { name: /Abbrechen|Cancel/i }).first().click();
            await page.waitForTimeout(300);
        }

        // 2. Open an existing transaction that uses Sparkasse (Transaction #1)
        await page.goto(`/${businessSlug}/transactions/1/edit`);
        await page.waitForLoadState('networkidle');

        // Check method field: should display "Überweisung Sparkasse"
        const methodLabel = page.locator('label[for="method"]').first();
        const methodTrigger = methodLabel.locator('..').locator('button[role="combobox"]').first();
        await expect(methodTrigger).toContainText(/Überweisung Sparkasse|Sparkasse/i, { timeout: 10000 });

        // 3. Now go back to Choices Management and UNCHECK "Bookkeeping Transactions"
        await page.goto(`/${businessSlug}/choices`);
        await page.waitForLoadState('networkidle');

        const pmTabAgain = page.locator('nav[aria-label="Tabs"] button').filter({ hasText: /Payment Methods|Zahlungsmethoden/i }).first();
        await pmTabAgain.click();
        await page.waitForTimeout(300);

        const sparkasseRowEdit = page.locator('button').filter({ hasText: /Überweisung Sparkasse/i }).first();
        await sparkasseRowEdit.click();
        await page.waitForTimeout(300);

        const txCheckboxDisable = page.getByRole('checkbox', { name: /Bookkeeping Transactions|Buchhaltung/i });
        await expect(txCheckboxDisable).toBeChecked();
        await txCheckboxDisable.uncheck();

        const saveModalBtn = page.getByRole('button', { name: /Speichern|Save/i }).first();
        await saveModalBtn.click();
        await page.waitForTimeout(500);

        // 4. Return to Transaction #1 edit page
        await page.goto(`/${businessSlug}/transactions/1/edit`);
        await page.waitForLoadState('networkidle');

        // CRITICAL BUG VERIFICATION: The field must NOT be blank ("Select method")!
        // It must display the historical method name
        await expect(methodTrigger).not.toContainText(/Select method|Methode auswählen/i);
        await expect(methodTrigger).toContainText(/Überweisung Sparkasse|Sparkasse/i);

        // Open the dropdown: the historical option must still be present and cleanly displayed
        await methodTrigger.click();
        await page.waitForTimeout(300);

        const popper = page.locator('[data-slot="popover-content"]:visible, [data-radix-popper-content-wrapper]:visible').last();
        await expect(popper).toBeVisible();

        const sparkasseOption = popper.locator('button').filter({ hasText: /Überweisung Sparkasse|Sparkasse/i }).first();
        await expect(sparkasseOption).toBeVisible();
        await expect(sparkasseOption).not.toContainText(/Archived|Archiviert/i);

        // 5. Select a DIFFERENT option (e.g. "Barzahlung")
        const barzahlungOption = popper.locator('button').filter({ hasText: /Barzahlung|Cash/i }).first();
        await expect(barzahlungOption).toBeVisible();
        await barzahlungOption.click();
        await page.waitForTimeout(300);

        // Assert that the trigger now shows Barzahlung
        await expect(methodTrigger).toContainText(/Barzahlung|Cash/i);

        // Wait for auto-save confirmation
        await expect(page.locator('text=/Saved|Gespeichert/i').first()).toBeVisible({ timeout: 10000 });

        // 6. REAL-TIME PRUNING ASSERTION:
        // Click the dropdown trigger again. Sparkasse must now be completely gone in real time!
        await methodTrigger.click();
        await page.waitForTimeout(300);

        const popperAfter = page.locator('[data-slot="popover-content"]:visible, [data-radix-popper-content-wrapper]:visible').last();
        await expect(popperAfter).toBeVisible();

        const prunedSparkasseOption = popperAfter.locator('button').filter({ hasText: /Überweisung Sparkasse|Sparkasse/i });
        await expect(prunedSparkasseOption).toHaveCount(0);

        // Close dropdown
        await page.keyboard.press('Escape');

        // 7. RESTORE STATE FOR CLEAN TEARDOWN:
        // Re-enable Transactions for Sparkasse in Choices
        await page.goto(`/${businessSlug}/choices`);
        await page.waitForLoadState('networkidle');

        const pmTabRestore = page.locator('nav[aria-label="Tabs"] button').filter({ hasText: /Payment Methods|Zahlungsmethoden/i }).first();
        await pmTabRestore.click();
        await page.waitForTimeout(300);

        const sparkasseRowRestore = page.locator('button').filter({ hasText: /Überweisung Sparkasse/i }).first();
        await sparkasseRowRestore.click();
        await page.waitForTimeout(300);

        const txCheckboxRestore = page.getByRole('checkbox', { name: /Bookkeeping Transactions|Buchhaltung/i });
        await txCheckboxRestore.check();

        const saveModalBtnRestore = page.getByRole('button', { name: /Speichern|Save/i }).first();
        await saveModalBtnRestore.click();
        await page.waitForTimeout(500);

        // Put Transaction #1 back to Sparkasse
        await page.goto(`/${businessSlug}/transactions/1/edit`);
        await page.waitForLoadState('networkidle');

        await methodTrigger.click();
        await page.waitForTimeout(300);
        const popperRestore = page.locator('[data-slot="popover-content"]:visible, [data-radix-popper-content-wrapper]:visible').last();
        const sparkasseReenabled = popperRestore.locator('button').filter({ hasText: /Überweisung Sparkasse|Sparkasse/i }).first();
        await expect(sparkasseReenabled).toBeVisible();
        await sparkasseReenabled.click();
        await page.waitForTimeout(300);
        await expect(page.locator('text=/Saved|Gespeichert/i').first()).toBeVisible({ timeout: 10000 });
    });
});
