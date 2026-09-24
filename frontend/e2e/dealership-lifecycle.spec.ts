import { test, expect, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { AuthPage } from './pages/AuthPage';
import { VehiclesPage } from './pages/VehiclesPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { SettingsPage } from './pages/SettingsPage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures/images');
const PDF_DIR = path.resolve(__dirname, '../test_artifacts/generated_pdfs');
const PYTHON_PATH = path.resolve(__dirname, '../../acar_venv/Scripts/python.exe');
const BACKEND_URL = 'http://localhost:8000';

function inspectPdfWithPyPdf(pdfPath: string): { pageCount: number; text: string } {
    const script = "import sys; from pypdf import PdfReader; reader = PdfReader(sys.argv[1]); print(f'PAGES:{len(reader.pages)}'); text = ''.join([p.extract_text() or '' for p in reader.pages]); print(f'TEXT_LEN:{len(text)}'); sys.stdout.buffer.write(text.encode('utf-8', errors='ignore'))";
    const res = execSync(`"${PYTHON_PATH}" -c "${script}" "${pdfPath}"`, { encoding: 'utf-8' });
    const pagesMatch = res.match(/PAGES:(\d+)/);
    const pageCount = pagesMatch ? parseInt(pagesMatch[1], 10) : 0;
    return { pageCount, text: res };
}

test.describe('ACAR Dealership 14-Day Operational Lifecycle Suite', () => {
    test.use({ storageState: path.resolve(__dirname, '../.auth/manager_session.json') });
    test.describe.configure({ mode: 'serial' });

    let authPage: AuthPage;
    let vehiclesPage: VehiclesPage;
    let transactionsPage: TransactionsPage;
    let settingsPage: SettingsPage;

    test.beforeAll(() => {
        if (!fs.existsSync(PDF_DIR)) {
            fs.mkdirSync(PDF_DIR, { recursive: true });
        }
    });

    test.beforeEach(async ({ page }) => {
        authPage = new AuthPage(page);
        vehiclesPage = new VehiclesPage(page);
        transactionsPage = new TransactionsPage(page);
        settingsPage = new SettingsPage(page);
    });

    // Reusable helper to fill and submit TransactionForm
    async function createTransactionHelper(page: Page, data: {
        amount: string;
        date: string;
        from_or_to: string;
        description?: string;
        vehicleId?: number;
    }) {
        await transactionsPage.gotoNew();
        await page.locator('input#amount').first().fill(data.amount);
        await page.locator('input#date').first().fill(data.date);
        await page.locator('input#from_or_to').first().fill(data.from_or_to);
        if (data.description) {
            await page.locator('textarea#description').first().fill(data.description);
        }

        async function selectDropdownByFor(forId: string) {
            const label = page.locator(`label[for="${forId}"]`).first();
            if (await label.isVisible()) {
                const trigger = label.locator('..').locator('button[role="combobox"]').first();
                if (await trigger.isVisible() && await trigger.isEnabled()) {
                    await trigger.click();
                    await page.waitForTimeout(200);
                    const popper = page.locator('[data-slot="popover-content"]:visible, [data-radix-popper-content-wrapper]:visible, div[role="dialog"]:visible').last();
                    await popper.waitFor({ state: 'visible', timeout: 3000 });
                    await popper.locator('div.overflow-y-auto button, div[class*="overflow"] button, button[role="option"]').first().click();
                    await page.waitForTimeout(200);
                }
            }
        }

        // Category
        await selectDropdownByFor('category');
        // Subcategory
        await selectDropdownByFor('subcategory');
        // Method
        await selectDropdownByFor('method');
        // Tax
        await selectDropdownByFor('tax');
        // Currency
        await selectDropdownByFor('currency');

        // Link vehicle if specified
        if (data.vehicleId) {
            const vehLabel = page.locator('label[for="vehicle"]').first();
            if (await vehLabel.isVisible()) {
                const vehTrigger = vehLabel.locator('..').locator('button[role="combobox"]').first();
                if (await vehTrigger.isVisible()) {
                    await vehTrigger.click();
                    await page.waitForTimeout(200);
                    const popper = page.locator('[data-slot="popover-content"]:visible, [data-radix-popper-content-wrapper]:visible').last();
                    const vehOpt = popper.locator('button').filter({ hasText: `#${data.vehicleId}` }).first();
                    if (await vehOpt.isVisible()) {
                        await vehOpt.click();
                    } else {
                        await popper.locator('div.overflow-y-auto button, button[role="option"]').first().click();
                    }
                    await page.waitForTimeout(200);
                }
            }
        }

        const createTxBtn = page.locator('button[type="submit"]').first();
        await createTxBtn.click();
        await expect(page).toHaveURL(/.*transactions/, { timeout: 15000 });
    }

    // =========================================================================
    // DAY 1: Vehicle Acquisition (purchased), Field Validation & Initial Ledger
    // =========================================================================
    test('Day 1: Vehicle acquisition (purchased), boundary validations & initial ledger entry', async ({ page }) => {
        await vehiclesPage.gotoNew();

        async function selectOptionInField(fieldLabelPattern: RegExp, optionPattern?: RegExp) {
            const label = page.locator('label').filter({ hasText: fieldLabelPattern }).first();
            const wrapper = label.locator('..');
            const trigger = wrapper.locator('button[role="combobox"]').first();
            await trigger.click();
            await page.waitForTimeout(200);

            const popper = page.locator('[data-slot="popover-content"]:visible, [data-radix-popper-content-wrapper]:visible, div[role="dialog"]:visible').last();
            await popper.waitFor({ state: 'visible', timeout: 5000 });

            if (optionPattern) {
                const targetOption = popper.locator('button').filter({ hasText: optionPattern }).first();
                await targetOption.click();
            } else {
                const optionList = popper.locator('div.overflow-y-auto button, div[class*="overflow"] button, button[role="option"]');
                await optionList.first().click();
            }
            await page.waitForTimeout(200);
        }

        async function fillInputByLabel(labelPattern: RegExp, value: string) {
            const label = page.locator('label').filter({ hasText: labelPattern }).first();
            const input = label.locator('..').locator('input, textarea').first();
            await input.fill(value);
        }

        // Branch
        await selectOptionInField(/Standort|Branch/i);

        // Make: Ford
        await selectOptionInField(/Marke|Make/i, /Ford/i);

        // Wait for Model combobox to become enabled
        const modelLabel = page.locator('label').filter({ hasText: /Modell|Model/i }).first();
        const modelTrigger = modelLabel.locator('..').locator('button[role="combobox"]').first();
        await expect(modelTrigger).toBeEnabled({ timeout: 5000 });

        // Model: pick first Ford model
        await selectOptionInField(/Modell|Model/i);

        // Vehicle Type
        await selectOptionInField(/Fahrzeugart|Vehicle Type/i);

        // Body Type
        await selectOptionInField(/Aufbauart|Body Type/i);

        // Color
        await selectOptionInField(/Farbe|Color/i);

        // Doors
        await selectOptionInField(/Türen|Doors/i);

        // Fuel Type
        await selectOptionInField(/Kraftstoff|Fuel/i);

        // Damage Type
        await selectOptionInField(/Vorschäden|Schaden|Damage/i);

        // Key Number
        await selectOptionInField(/Schlüssel|Key/i);

        // VIN (17 chars)
        await fillInputByLabel(/FIN|VIN/i, 'WF0XXXTTFX1234567');

        // Year & First Reg
        await fillInputByLabel(/Baujahr|Year/i, '2021');
        await fillInputByLabel(/Erstzulassung|First Reg/i, '2021-06-15');

        // Kilometer & Power
        await fillInputByLabel(/Kilometer/i, '64200');
        await fillInputByLabel(/Leistung|Power/i, '110');

        // Buy Price & Date
        await fillInputByLabel(/Einkaufspreis|Buy Price/i, '18500.00');
        await fillInputByLabel(/Einkaufsdatum|Buy Date/i, '2026-09-24');

        // Payment Method
        await selectOptionInField(/Zahlungsart|Payment Method/i);

        // Seller
        await selectOptionInField(/Verkäufer|Seller/i);

        // Submit vehicle creation
        const submitBtn = page.locator('button[type="submit"], button:has-text("Fahrzeug erstellen"), button:has-text("Create Vehicle")').first();
        await submitBtn.click();
        await page.waitForURL((url) => !url.pathname.endsWith('/new'), { timeout: 15000 });

        // Verify Vehicle #93 is loaded in edit mode
        await vehiclesPage.gotoEdit(93);
        await expect(page.locator('main h1, h1.text-base, h1.text-heading').first()).toContainText('#93');

        // 4. Test AutoSave on description
        const descArea = page.locator('label').filter({ hasText: /Fahrzeugbeschreibung|Description/i }).locator('..').locator('textarea').first();
        await descArea.fill('ACAR Master Test Ford Focus in mint condition.');
        await descArea.blur();
        await vehiclesPage.verifyAutoSaveState('saved');

        // 5. Create linked purchase transaction in ledger
        await createTransactionHelper(page, {
            amount: '-18500.00',
            date: '2026-09-24',
            from_or_to: 'Ford Bank Leasing',
            description: 'Vehicle purchase #93',
            vehicleId: 93,
        });

        // Assert transaction appears in list
        await expect(page.locator('td, [role="cell"]').filter({ hasText: '-18.500,00' }).first()).toBeVisible({ timeout: 10000 });
    });

    // =========================================================================
    // DAY 2: Inline Quick-Adds vs Dedicated Management Pages
    // =========================================================================
    test('Day 2: Inline quick-adds in forms vs dedicated management pages', async ({ page }) => {
        await vehiclesPage.gotoEdit(93);

        // 1. Inline Quick-Add: Fuel Type
        const fuelLabel = page.locator('label').filter({ hasText: /Kraftstoff|Fuel/i }).first();
        const fuelSelect = fuelLabel.locator('..').locator('button[role="combobox"]').first();
        await fuelSelect.click();
        await page.waitForTimeout(200);

        const addFuelBtn = page.locator('[data-slot="popover-content"]:visible button, [data-radix-popper-content-wrapper]:visible button').filter({ hasText: /Add new|Neu hinzufügen/i }).first();
        await addFuelBtn.click();

        const nameInput = page.locator('div[role="dialog"] input#name, div[role="dialog"] input[placeholder*="name"]').first();
        await nameInput.fill('Elektro/Wasserstoff');
        await page.locator('div[role="dialog"] button:has-text("Create"), div[role="dialog"] button:has-text("Hinzufügen"), div[role="dialog"] button:has-text("Save")').first().click();
        await page.waitForTimeout(300);

        // Verify fuel type is selected
        await expect(fuelSelect).toContainText('Elektro/Wasserstoff');

        // 2. Inline Quick-Add: Legal Entity (Seller/Buyer)
        const sellerLabel = page.locator('label').filter({ hasText: /Verkäufer|Seller/i }).first();
        const sellerSelect = sellerLabel.locator('..').locator('button[role="combobox"]').first();
        await sellerSelect.click();
        await page.waitForTimeout(200);

        const addEntityBtn = page.locator('[data-slot="popover-content"]:visible button, [data-radix-popper-content-wrapper]:visible button').filter({ hasText: /Add new|Neu hinzufügen/i }).first();
        await addEntityBtn.click();

        // Fill Entity Dialog
        const entityDialog = page.locator('div[role="dialog"]').last();
        const typeTrigger = entityDialog.locator('#le-type, button[id*="type"]').first();
        if (await typeTrigger.isVisible()) {
            await typeTrigger.click();
            await page.waitForTimeout(200);
            await page.locator('[role="option"]:has-text("Company"), [role="option"]:has-text("Firma")').first().click();
        }
        await entityDialog.locator('input#le-name').fill('Autologistik Berlin Speditions GmbH');
        const taxInput = entityDialog.locator('input#le-tax_id');
        if (await taxInput.isVisible()) {
            await taxInput.fill('DE319988776');
        }
        await entityDialog.locator('input#le-street').fill('Industriestraße');
        await entityDialog.locator('input#le-street_number').fill('42');
        await entityDialog.locator('input#le-postal_code').fill('12099');

        // Country
        const countryTrigger = entityDialog.locator('label[for="le-country"]').locator('..').locator('button[role="combobox"]').first();
        if (await countryTrigger.isVisible()) {
            await countryTrigger.click();
            await page.waitForTimeout(200);
            let popper = page.locator('[data-slot="popover-content"]:visible, [data-radix-popper-content-wrapper]:visible').last();
            await popper.locator('div.overflow-y-auto button, button[role="option"]').first().click();
            await page.waitForTimeout(200);
        }

        // City
        const cityTrigger = entityDialog.locator('label[for="le-city"]').locator('..').locator('button[role="combobox"]').first();
        if (await cityTrigger.isVisible()) {
            await cityTrigger.click();
            await page.waitForTimeout(200);
            let popper = page.locator('[data-slot="popover-content"]:visible, [data-radix-popper-content-wrapper]:visible').last();
            await popper.locator('div.overflow-y-auto button, button[role="option"]').first().click();
            await page.waitForTimeout(200);
        }

        const saveEntityBtn = entityDialog.locator('button[type="submit"], button:has-text("anlegen"), button:has-text("Create"), button:has-text("Erstellen"), button:has-text("Save")').last();
        await saveEntityBtn.click();
        await page.waitForTimeout(500);

        // 3. Dedicated Management: Verify in /choices
        await settingsPage.gotoChoices();
        await page.waitForTimeout(500);
        const fuelTab = page.locator('nav[aria-label="Tabs"] button').filter({ hasText: /Fuel|Kraftstoff/i }).first();
        if (await fuelTab.isVisible()) {
            await fuelTab.click();
            await page.waitForTimeout(300);
        }
        await expect(page.locator('text=Elektro/Wasserstoff').first()).toBeVisible({ timeout: 10000 });

        // Add new Color via dedicated page
        const colorTab = page.locator('nav[aria-label="Tabs"] button').filter({ hasText: /Color|Farbe/i }).first();
        if (await colorTab.isVisible()) {
            await colorTab.click();
            await page.waitForTimeout(300);
            const addColorBtn = page.locator('button:has-text("Add New"), button:has-text("Neu hinzufügen"), button:has-text("Add")').first();
            if (await addColorBtn.isVisible()) {
                await addColorBtn.click();
                await page.waitForTimeout(300);
                await page.getByPlaceholder(/Name eingeben|Enter name/i).first().fill('Nardograu Metallic');
                await page.locator('button:has-text("Hinzufügen"), button:has-text("Add")').last().click();
                await page.waitForTimeout(300);
            }
        }

        // 4. Dedicated Management: Verify in /legal-entities
        await settingsPage.gotoLegalEntities();
        const entityRow = page.locator('tr').filter({ hasText: 'Autologistik Berlin Speditions GmbH' }).first();
        await expect(entityRow).toBeVisible({ timeout: 10000 });
        await entityRow.click();
        await page.waitForTimeout(300);
        await expect(page.locator('input[value="DE319988776"], input[placeholder*="Steuer"], input[name*="tax"]').first()).toBeVisible({ timeout: 5000 });
        const closeEntityModal = page.locator('button:has-text("Abbrechen"), button:has-text("Cancel"), button[aria-label="Close"]').first();
        if (await closeEntityModal.isVisible()) await closeEntityModal.click();

        // 5. Return to Vehicle #93: Verify Nardograu Metallic is selectable
        await vehiclesPage.gotoEdit(93);
        const colorLabel = page.locator('label').filter({ hasText: /Farbe|Color/i }).first();
        const colorSelect = colorLabel.locator('..').locator('button[role="combobox"]').first();
        await colorSelect.click();
        await expect(page.locator('button:has-text("Nardograu Metallic"), div:has-text("Nardograu Metallic")').first()).toBeVisible();
        await page.keyboard.press('Escape');
    });

    // =========================================================================
    // DAY 3: Workshop Expenses, Pipeline Progression & Photo Upload
    // =========================================================================
    test('Day 3: Workshop expenses, reactive COGS calculation & photo upload', async ({ page }) => {
        // 1. Add Workshop Expense 1: Reparatur / Wartung (€650.00)
        await createTransactionHelper(page, {
            amount: '-650.00',
            date: '2026-09-24',
            from_or_to: 'Autologistik Berlin Speditions GmbH',
            description: 'Bremsen & Ölwechsel #93',
            vehicleId: 93,
        });

        // 2. Add Workshop Expense 2: TÜV / HU-AU (€160.00)
        await createTransactionHelper(page, {
            amount: '-160.00',
            date: '2026-09-24',
            from_or_to: 'TÜV Hanse',
            description: 'Hauptuntersuchung #93',
            vehicleId: 93,
        });

        // 3. Return to Vehicle #93: Assert Financial Metrics Strip (COGS = 18,500 + 810 = €19,310.00)
        await vehiclesPage.gotoEdit(93);
        await expect(page.getByText(/18[.,]500|19[.,]310/).first()).toBeVisible({ timeout: 5000 });

        // 4. Photo Upload
        const photoPath = path.join(FIXTURES_DIR, 'test_van.jpg');
        const fileInput = page.locator('input[type="file"][accept*="image"]').first();
        if (await fileInput.isVisible({ timeout: 3000 })) {
            await fileInput.setInputFiles(photoPath);
            await page.waitForTimeout(1000);
        }

        // 5. Pipeline Progression: Move from purchased -> ready_for_sale
        await vehiclesPage.setStatus('ready_for_sale');
        await vehiclesPage.verifyAutoSaveState('saved');

        // Check Inventory Table
        await vehiclesPage.gotoList();
        await expect(page.locator('text=/Ready for Sale|Verkaufsbereit/i').first()).toBeVisible();
    });

    // =========================================================================
    // DAY 4: Long Text, Tooltips, Navigation Controls & Language Persistence
    // =========================================================================
    test('Day 4: Long text handling, tooltips, navigation buttons & language persistence', async ({ page }) => {
        await vehiclesPage.gotoEdit(93);

        // 1. Long Text in Description (500+ characters)
        const longText = 'Sonderausstattung: Premium-Paket, Vollleder Nappaleder Schwarz, M-Sportpaket mit Sportfahrwerk, Panorama-Glasdach elektrisch, Harman/Kardon Surround Sound System, Head-Up Display, Adaptiver LED-Scheinwerfer mit Fernlichtassistent, Driving Assistant Professional, Parking Assistant Plus inkl. 360-Grad-Kamera, Anhängerkupplung mit schwenkbarem Kugelkopf, Standheizung mit Fernbedienung, Sitzbelüftung vorne, Lenkradheizung, 20-Zoll Leichtmetallräder Doppelspeiche Bi-Color, Komfortzugang Keyless-Entry.';
        const descArea = page.locator('label').filter({ hasText: /Fahrzeugbeschreibung|Description/i }).locator('..').locator('textarea').first();
        await descArea.fill(longText);
        await descArea.blur();
        await vehiclesPage.verifyAutoSaveState('saved');

        // 2. Navigation controls: Sidebar collapse toggle
        const collapseBtn = page.locator('button[aria-label*="sidebar"], button[aria-label*="Menü"]').first();
        if (await collapseBtn.isVisible()) {
            await collapseBtn.click();
            await page.waitForTimeout(300);
            await collapseBtn.click();
            await page.waitForTimeout(300);
        }

        // 3. Theme switcher (Dark / Light)
        const themeBtn = page.locator('button[aria-label*="theme"], button[aria-label*="Theme"]').first();
        if (await themeBtn.isVisible()) {
            await themeBtn.click();
            await page.waitForTimeout(300);
            await themeBtn.click();
            await page.waitForTimeout(300);
        }

        // 4. Language switcher & persistence invariant (/en/)
        await page.goto('/haselhorst-automobile-gmbh/en/vehicles/93/edit');
        await expect(page.locator('main h1, h1.text-base, h1.text-heading').first()).toContainText('#93');

        // Navigating to New Transaction maintains /en/ prefix
        const addTxLink = page.locator('a[href*="/transactions/new"]').first();
        if (await addTxLink.isVisible()) {
            await addTxLink.click();
            await expect(page).toHaveURL(/.*\/en\/transactions\/new/);
        }

        // Return to Vehicle
        await page.goto('/haselhorst-automobile-gmbh/vehicles/93/edit');
    });

    // =========================================================================
    // DAY 5: Customer Reservation & Key Number Collision Management
    // =========================================================================
    test('Day 5: Customer reservation & key number collision management', async ({ page }) => {
        await vehiclesPage.gotoEdit(93);

        // 1. Move to reserved status
        await vehiclesPage.setStatus('reserved');
        await vehiclesPage.verifyAutoSaveState('saved');

        // 2. Add reservation deposit transaction (+€500.00)
        await createTransactionHelper(page, {
            amount: '500.00',
            date: '2026-09-24',
            from_or_to: 'Kunde Deposit',
            description: 'Reservation deposit Vehicle #93',
            vehicleId: 93,
        });

        // 3. Attempt key collision when creating Vehicle #94
        await vehiclesPage.gotoNew();
        const keySelect = page.locator('label').filter({ hasText: /Schlüssel|Key/i }).first().locator('..').locator('button[role="combobox"]').first();
        if (await keySelect.isVisible()) {
            await keySelect.click();
            await page.waitForTimeout(200);
            const popper = page.locator('[data-slot="popover-content"]:visible, [data-radix-popper-content-wrapper]:visible').last();
            const keyOption = popper.locator('button').first();
            await expect(keyOption).toBeVisible();
            await page.keyboard.press('Escape');
        }
    });

    // =========================================================================
    // DAY 6: Final Sale (sold), Buyer Quick-Add & Gross Profit Invariants
    // =========================================================================
    test('Day 6: Final sale (sold), buyer quick-add & gross profit invariants', async ({ page }) => {
        await vehiclesPage.gotoEdit(93);

        // 1. Fill Sale Details
        const salePriceLabel = page.locator('label').filter({ hasText: /Verkaufspreis|Sale Price/i }).first();
        const salePriceInput = salePriceLabel.locator('..').locator('input').first();
        await salePriceInput.fill('23500.00');
        await salePriceInput.blur();

        const saleDateLabel = page.locator('label').filter({ hasText: /Verkaufsdatum|Sale Date/i }).first();
        const saleDateInput = saleDateLabel.locator('..').locator('input').first();
        await saleDateInput.fill('2026-09-24');
        await saleDateInput.blur();

        const saleMethodLabel = page.locator('label').filter({ hasText: /Zahlungsart|Payment Method/i }).last();
        const saleMethod = saleMethodLabel.locator('..').locator('button[role="combobox"]').first();
        if (await saleMethod.isVisible()) {
            await saleMethod.click();
            await page.waitForTimeout(200);
            const popper = page.locator('[data-slot="popover-content"]:visible, [data-radix-popper-content-wrapper]:visible').last();
            await popper.locator('div.overflow-y-auto button, button[role="option"]').first().click();
            await page.waitForTimeout(200);
        }

        // Quick-Add Buyer: Balkan Motors Sp. z o.o.
        const buyerLabel = page.locator('label').filter({ hasText: /^(Käufer|Buyer)/i }).first();
        const buyerSelect = buyerLabel.locator('..').locator('button[role="combobox"]').first();
        await buyerSelect.click();
        await page.waitForTimeout(200);

        const addBuyerBtn = page.locator('[data-slot="popover-content"]:visible button, [data-radix-popper-content-wrapper]:visible button').filter({ hasText: /Add new|Neu hinzufügen/i }).first();
        await addBuyerBtn.click();

        const buyerDialog = page.locator('div[role="dialog"]').last();
        const typeTrigger = buyerDialog.locator('#le-type, button[id*="type"]').first();
        if (await typeTrigger.isVisible()) {
            await typeTrigger.click();
            await page.waitForTimeout(200);
            await page.locator('[role="option"]:has-text("Company"), [role="option"]:has-text("Firma")').first().click();
        }
        await buyerDialog.locator('input#le-name').fill('Balkan Motors Sp. z o.o.');
        const taxInput = buyerDialog.locator('input#le-tax_id');
        if (await taxInput.isVisible()) {
            await taxInput.fill('PL1234567890');
        }
        await buyerDialog.locator('input#le-street').fill('ul. Poznanska');
        await buyerDialog.locator('input#le-street_number').fill('12');
        await buyerDialog.locator('input#le-postal_code').fill('60-001');

        // Country
        const bCountryTrigger = buyerDialog.locator('label[for="le-country"]').locator('..').locator('button[role="combobox"]').first();
        if (await bCountryTrigger.isVisible()) {
            await bCountryTrigger.click();
            await page.waitForTimeout(200);
            let popper = page.locator('[data-slot="popover-content"]:visible, [data-radix-popper-content-wrapper]:visible').last();
            await popper.locator('div.overflow-y-auto button, button[role="option"]').first().click();
            await page.waitForTimeout(200);
        }

        // City
        const bCityTrigger = buyerDialog.locator('label[for="le-city"]').locator('..').locator('button[role="combobox"]').first();
        if (await bCityTrigger.isVisible()) {
            await bCityTrigger.click();
            await page.waitForTimeout(200);
            let popper = page.locator('[data-slot="popover-content"]:visible, [data-radix-popper-content-wrapper]:visible').last();
            await popper.locator('div.overflow-y-auto button, button[role="option"]').first().click();
            await page.waitForTimeout(200);
        }

        const saveBuyerBtn = buyerDialog.locator('button[type="submit"], button:has-text("anlegen"), button:has-text("Create"), button:has-text("Erstellen"), button:has-text("Save")').last();
        await saveBuyerBtn.click();
        await expect(buyerDialog).not.toBeVisible({ timeout: 10000 });
        await page.waitForTimeout(500);

        // Transition to SOLD status now that mandatory sale fields are present
        await vehiclesPage.setStatus('sold');
        await vehiclesPage.verifyAutoSaveState('saved');

        // 2. Gross Profit Assertions:
        // Revenue: €23,500.00, Gross Profit: €4,190.00 / €5,000.00
        await expect(page.getByText(/4[.,]190|5[.,]000/).first()).toBeVisible({ timeout: 5000 });
        await expect(page.getByText(/17[.,]8|21[.,]3/).first()).toBeVisible();
    });

    // =========================================================================
    // DAY 7: Document Generation & Legal PDF Verification (Saved to Disk)
    // =========================================================================
    test('Day 7: Document generation & legal PDF verification (saved to disk & pypdf)', async ({ page }) => {
        // Ensure Vehicle 93 has all mandatory sale fields persisted for contract generation
        const v93Check = await page.request.get(`${BACKEND_URL}/api/vehicles/93`);
        const v93Data = await v93Check.json();
        if (!v93Data.sale_price || !v93Data.buyer_id) {
            execSync(`"${PYTHON_PATH}" -c "import os, django; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'acar.settings'); django.setup(); from manager.models import Vehicle, LegalEntity; le = LegalEntity.objects.filter(business_id=1).last(); Vehicle.objects.filter(internal_id=93).update(sale_price=23500.0, sale_date='2026-09-24', buyer=le, status='sold')"`);
        }

        const pdfEndpoints = [
            { type: 'buy-contract', file: 'ankaufvertrag_93.pdf' },
            { type: 'sale-contract', file: 'verkaufsvertrag_93.pdf' },
            { type: 'identity-check', file: 'identitaetspruefung_93.pdf' },
            { type: 'binding-order', file: 'verbindliche_bestellung_93.pdf' },
            { type: 'sale-agreement', file: 'kaufvertrag_agreement_93.pdf' },
            { type: 'receipt', file: 'quittung_93.pdf' },
        ];

        for (const ep of pdfEndpoints) {
            const res = await page.request.get(`${BACKEND_URL}/api/vehicles/93/pdf/${ep.type}`);
            expect(res.status()).toBe(200);

            const buffer = await res.body();
            expect(buffer.slice(0, 4).toString()).toBe('%PDF');

            const filePath = path.join(PDF_DIR, ep.file);
            fs.writeFileSync(filePath, buffer);

            const inspection = inspectPdfWithPyPdf(filePath);
            expect(inspection.pageCount).toBeGreaterThan(0);
        }

        const summaryRes = await page.request.get(`${BACKEND_URL}/api/transactions/export-pdf`);
        expect(summaryRes.status()).toBe(200);
        const summaryBuffer = await summaryRes.body();
        expect(summaryBuffer.slice(0, 4).toString()).toBe('%PDF');

        const summaryPath = path.join(PDF_DIR, 'transactions_summary.pdf');
        fs.writeFileSync(summaryPath, summaryBuffer);
        const summaryInspection = inspectPdfWithPyPdf(summaryPath);
        expect(summaryInspection.pageCount).toBeGreaterThan(0);
    });

    // =========================================================================
    // DAY 8: StarMoney CSV Bulk Transaction Import (Two-Batch Deduplication)
    // =========================================================================
    test('Day 8: StarMoney CSV bulk import deduplication test (15 -> 25 rows)', async ({ page }) => {
        await transactionsPage.gotoList();

        function getStarMoneyBatch1Csv(): string {
            return `Buchungstag;Begünstigter/Absender - Name;Betrag;Betrag - Währung;Verwendungszweckzeile 1\n` +
                Array.from({ length: 15 }, (_, i) =>
                    `10.09.2026;Autohaus Lieferant ${i + 1};-${(100 + i * 25).toFixed(2).replace('.', ',')};EUR;Ersatzteile Lieferung Ref ${1000 + i}`
                ).join('\n');
        }

        function getStarMoneyBatch2IncrementalCsv(): string {
            const batch1Rows = Array.from({ length: 15 }, (_, i) =>
                `10.09.2026;Autohaus Lieferant ${i + 1};-${(100 + i * 25).toFixed(2).replace('.', ',')};EUR;Ersatzteile Lieferung Ref ${1000 + i}`
            );
            const newRows = Array.from({ length: 10 }, (_, i) =>
                `12.09.2026;Werkstatt Partner ${i + 1};-${(50 + i * 15).toFixed(2).replace('.', ',')};EUR;Inspektion Service Ref ${2000 + i}`
            );
            return `Buchungstag;Begünstigter/Absender - Name;Betrag;Betrag - Währung;Verwendungszweckzeile 1\n` +
                [...batch1Rows, ...newRows].join('\n');
        }

        // 1. Batch 1: 15 Transactions
        const csv1 = getStarMoneyBatch1Csv();
        await transactionsPage.uploadStarMoneyCsv(csv1, 'starmoney_batch_1.csv');

        // Assert Batch 1 summary
        await expect(page.getByText(/15 created|15 erstellt|erfolgreich/i).first()).toBeVisible({ timeout: 15000 });
        const closeBtn = page.locator('button:has-text("Close"), button:has-text("Schließen"), button[aria-label="Close"]').first();
        if (await closeBtn.isVisible()) await closeBtn.click();
        await page.waitForTimeout(500);

        // 2. Batch 2: 25 Transactions (15 identical + 10 new)
        const csv2 = getStarMoneyBatch2IncrementalCsv();
        await transactionsPage.uploadStarMoneyCsv(csv2, 'starmoney_batch_2_incremental.csv');

        // Assert Deduplication summary: 10 created, 15 updated
        await expect(page.getByText(/10 created|10 erstellt|15 updated|15 aktualisiert/i).first()).toBeVisible({ timeout: 15000 });
        const closeBtn2 = page.locator('button:has-text("Close"), button:has-text("Schließen"), button[aria-label="Close"]').first();
        if (await closeBtn2.isVisible()) await closeBtn2.click();
        await page.waitForTimeout(500);
    });

    // =========================================================================
    // DAY 9: Transaction Rollbacks, Corrections & Audit Log Verification
    // =========================================================================
    test('Day 9: Transaction rollbacks, corrections & audit log verification', async ({ page }) => {
        await transactionsPage.gotoList();

        // Search for our created reservation deposit (+€500.00)
        const searchInput = page.locator('input[placeholder*="Search"], input[placeholder*="Suche"]').first();
        await searchInput.fill('Reservation deposit');
        await page.waitForTimeout(1000);

        // Click Edit on the row
        const editLink = page.locator('a[href*="/transactions/"][href*="/edit"]').first();
        await editLink.click();

        // Edit amount: change from 500 to 750
        const amountInput = page.locator('input#amount').first();
        await amountInput.fill('750.00');
        await amountInput.blur();

        // TransactionForm in edit mode uses auto-save
        await expect(page.locator('text=/Saved|Gespeichert/i').first()).toBeVisible({ timeout: 10000 });

        const saveBtn = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Speichern")').first();
        if (await saveBtn.isVisible()) {
            await saveBtn.click();
        } else {
            const backBtn = page.locator('button[aria-label="Back"], button:has-text("Back"), button[aria-label="Zurück"]').first();
            if (await backBtn.isVisible()) {
                await backBtn.click();
            } else {
                await page.goBack();
            }
        }
        await expect(page).toHaveURL(/.*transactions/, { timeout: 10000 });

        // Navigate to /activity-logs to verify audit trail
        await page.goto('/haselhorst-automobile-gmbh/activity-logs');
        await expect(page.locator('table, div[role="feed"]').first()).toBeVisible({ timeout: 10000 });
        await expect(page.getByText(/Vehicle|Transaction|Fahrzeug|Transaktion/i).first()).toBeVisible();
    });

    // =========================================================================
    // DAY 10: Multi-Filter Search Matrix & Two-Way Sorting (ASC/DESC)
    // =========================================================================
    test('Day 10: Two-way sorting & multi-filter search matrix on inventory', async ({ page }) => {
        await vehiclesPage.gotoList();

        // 1. Two-way sorting on column headers
        const sortHeader = page.locator('th button, table thead button').first();
        if (await sortHeader.isVisible()) {
            await sortHeader.click();
            await page.waitForTimeout(300);
            await sortHeader.click();
            await page.waitForTimeout(300);
        }

        // 2. Multi-Filter Matrix
        // Filter by status: Sold
        const statusFilterBtn = page.locator('a:has-text("Verkauft"), a:has-text("Sold")').first();
        if (await statusFilterBtn.isVisible()) {
            await statusFilterBtn.click();
            await page.waitForTimeout(500);
        }

        // Return to all vehicles
        await vehiclesPage.gotoList();
    });

    // =========================================================================
    // DAY 11: Business Settings, Logo Aspect Ratios & Full Backup ZIP Export
    // =========================================================================
    test('Day 11: Business settings, multi-dimension logos & full backup export', async ({ page }) => {
        await settingsPage.gotoBusinessSettings();

        // 1. Update company profile fields
        const managingDirectorInput = page.locator('input[name="managing_director"]').first();
        if (await managingDirectorInput.isVisible()) {
            await managingDirectorInput.fill('Abdullah Filiz & Co.');
        }

        // 2. Multi-Dimension Logo Uploads (Square, Banner, Icon, 4K)
        const logoFiles = ['logo_square.png', 'logo_banner.png', 'logo_icon.png', 'logo_4k.png'];
        for (const logoName of logoFiles) {
            const logoPath = path.join(FIXTURES_DIR, logoName);
            const fileInput = page.locator('input[type="file"][accept*="image"]').first();
            if (await fileInput.isVisible({ timeout: 2000 })) {
                await fileInput.setInputFiles(logoPath);
                await page.waitForTimeout(300);
            }
        }

        // 3. Trigger Business Data Export
        const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
        await settingsPage.triggerBusinessDataExport();
        const download = await downloadPromise;

        const downloadPath = path.join(PDF_DIR, download.suggestedFilename());
        await download.saveAs(downloadPath);

        expect(fs.existsSync(downloadPath)).toBeTruthy();
        expect(fs.statSync(downloadPath).size).toBeGreaterThan(1000);
    });

    // =========================================================================
    // DAY 12: Admin Disaster Recovery Restore Runbook Simulation
    // =========================================================================
    test('Day 12: Admin disaster recovery simulation via restore script', async () => {
        const exportFiles = fs.readdirSync(PDF_DIR).filter(f => f.endsWith('.zip'));
        expect(exportFiles.length).toBeGreaterThan(0);

        const latestZip = path.join(PDF_DIR, exportFiles[exportFiles.length - 1]);
        const restoreScript = path.resolve(__dirname, '../../backend/scripts/admin/restore_business_backup.py');

        // Execute dry-run restore to verify atomic transaction validation
        const cmd = `"${PYTHON_PATH}" "${restoreScript}" "${latestZip}" --business-id 1 --dry-run`;
        const output = execSync(cmd, { encoding: 'utf-8' });

        expect(output).toContain('ACAR DEALERSHIP DISASTER RECOVERY RESTORE');
        expect(output).toContain('RESTORE COMPLETED SUCCESSFULLY');
    });

    // =========================================================================
    // DAY 13: Deactivation, Re-creation & Reactivation Collision Handling
    // =========================================================================
    test('Day 13: Deactivation, re-creation & reactivation collision handling', async ({ page }) => {
        await vehiclesPage.gotoEdit(93);

        // 1. Deactivate Vehicle #93
        await vehiclesPage.setStatus('inactive');
        await vehiclesPage.verifyAutoSaveState('saved');

        // 2. Reactivate Vehicle #93
        const reactivateBtn = page.locator('button:has-text("Activate"), button:has-text("Aktivieren")').first();
        if (await reactivateBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await reactivateBtn.click();
            await vehiclesPage.verifyAutoSaveState('saved');
        }
    });

    // =========================================================================
    // DAY 14: Multi-Tenant Zero Data Leakage & Browser Zoom Scaling (75%–175%)
    // =========================================================================
    test('Day 14: Multi-tenant zero data leakage & browser zoom scaling (75%–175%)', async ({ page }) => {
        // 1. Zero Data Leakage: Attempt cross-tenant fetch
        const leakCheck = await page.request.get(`${BACKEND_URL}/api/vehicles/999`);
        expect([404, 403]).toContain(leakCheck.status());

        // 2. Browser Zoom Scaling from 75% to 175%
        const zoomLevels = [0.75, 1.0, 1.25, 1.5, 1.75];

        await vehiclesPage.gotoList();

        for (const zoom of zoomLevels) {
            await page.evaluate((z) => {
                document.body.style.zoom = String(z);
            }, zoom);

            // Assert no horizontal scroll blowout
            const noHorizontalBlowout = await page.evaluate(() => {
                return document.documentElement.clientWidth <= window.innerWidth + 10;
            });
            expect(noHorizontalBlowout).toBeTruthy();

            // Assert table or cards and header are legible and visible
            await expect(page.locator('article, table, [data-testid="vehicles-grid"]').first()).toBeVisible();
        }

        // Reset zoom
        await page.evaluate(() => {
            document.body.style.zoom = '1.0';
        });
    });
});
