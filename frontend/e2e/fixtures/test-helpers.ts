/**
 * E2E Test Helpers & API Utilities for DriveBase
 */

export interface TestAuthRequest {
    request_id: string;
    approval_token: string;
    approval_url: string;
    action_type: string;
    status: string;
    recipient_email: string | null;
    is_expired: boolean;
}

export const BACKEND_URL = 'http://localhost:8000';
export const FRONTEND_URL = 'http://localhost:5173';

/**
 * Fetch auth request details directly from backend test-helper endpoint in < 1ms.
 */
export async function getAuthRequest(requestId: string): Promise<TestAuthRequest> {
    const res = await fetch(`${BACKEND_URL}/api/auth/test-helper/request/${requestId}`);
    if (!res.ok) {
        throw new Error(`Failed to fetch auth request for id ${requestId}: ${res.statusText}`);
    }
    return res.json();
}

/**
 * Fetch latest auth request by action type.
 */
export async function getLatestAuthRequest(actionType?: string): Promise<TestAuthRequest> {
    const url = actionType
        ? `${BACKEND_URL}/api/auth/test-helper/latest?action_type=${actionType}`
        : `${BACKEND_URL}/api/auth/test-helper/latest`;
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to fetch latest auth request: ${res.statusText}`);
    }
    return res.json();
}

/**
 * Force an auth request to expire immediately (for testing 410 / timeout edge cases).
 */
export async function forceExpireAuthRequest(requestId: string): Promise<void> {
    const res = await fetch(`${BACKEND_URL}/api/auth/test-helper/expire/${requestId}`, {
        method: 'POST',
    });
    if (!res.ok) {
        throw new Error(`Failed to expire auth request ${requestId}`);
    }
}

/**
 * Clean 5-column German StarMoney format builder.
 * Headers: "Buchungstag";"Begünstigter/Absender - Name";"Betrag";"Betrag - Währung";"Verwendungszweckzeile 1"
 */
export function buildStarMoneyCsv(
    transactions: Array<{
        date: string;         // e.g. "17.1.2023" or "24.09.2026"
        counterparty: string; // e.g. "Abdullah Filiz" or "Autohaus Spandau GmbH"
        amount: string;       // e.g. "65000,00" or "-9553,00"
        currency?: string;    // e.g. "EUR"
        purpose: string;      // e.g. "Darlehen Abdullah Filiz"
    }>
): string {
    const headers = [
        '"Buchungstag"',
        '"Begünstigter/Absender - Name"',
        '"Betrag"',
        '"Betrag - Währung"',
        '"Verwendungszweckzeile 1"'
    ].join(';');

    const rows = transactions.map(t => {
        const curr = t.currency || 'EUR';
        return `"${t.date}";"${t.counterparty}";${t.amount};"${curr}";"${t.purpose}"`;
    });

    return [headers, ...rows].join('\r\n');
}

/**
 * 15 Base StarMoney transactions derived from real dealership statement.
 */
export const STARMONEY_BASE_TRANSACTIONS = [
    { date: "17.1.2023", counterparty: "Abdullah Filiz", amount: "65000,00", currency: "EUR", purpose: "Darlehen Abdullah Filiz" },
    { date: "19.1.2023", counterparty: "Alex Gleich", amount: "500,00", currency: "EUR", purpose: "Ek vw caravelle id:1061vin 007186 ABWA: Gleich Alex" },
    { date: "20.1.2023", counterparty: "AHF Cars + More GmbH + Co. KG", amount: "-350,00", currency: "EUR", purpose: "Miet kosten 01.01.2024 SecureGo plus IBAN: DE52100900001012569005" },
    { date: "20.1.2023", counterparty: "Johannes Maier", amount: "-9553,00", currency: "EUR", purpose: "EK Audi A6 FIN:37851 ID:1074 SecureGo plus" },
    { date: "23.1.2023", counterparty: "Ihor Dilion", amount: "200,00", currency: "EUR", purpose: "anatolij kyjuk fur auto ABWA: Dilion Ihor" },
    { date: "23.1.2023", counterparty: "Taxiverhuur Rotterdam", amount: "500,00", currency: "EUR", purpose: "Bic DEVODEEBB EREF: Voor uit betelen auto kopen" },
    { date: "24.1.2023", counterparty: "AHF Cars + More GmbH + Co. KG", amount: "-7,00", currency: "EUR", purpose: "Miet kosten Differenz 01.01.2024" },
    { date: "25.1.2023", counterparty: "Quandt Haustechnik GmbH", amount: "-5594,00", currency: "EUR", purpose: "EK VW Caddy FIN:138201 Amtl.Kennzeichen: HH-QH 3000 Belegnr:32300001 ID: 1078" },
    { date: "25.1.2023", counterparty: "ARI Fleet Germany GmbH", amount: "-14577,50", currency: "EUR", purpose: "EK Opel, Vivaro RE NR FR23-00195 HH-TP 1074 VIN: VXEVAYHVMMZ104965 ID: 1097" },
    { date: "25.1.2023", counterparty: "IPS-FEST GmbH", amount: "-6613,00", currency: "EUR", purpose: "EK Mercedes Benz Vito WDF44770313431095 Rechnung Nr. 23510008 ID: 1071" },
    { date: "25.1.2023", counterparty: "Martin Hentschel", amount: "-14055,00", currency: "EUR", purpose: "EK BMW 430d Gran Coupe FIN:50349 ID:1090" },
    { date: "25.1.2023", counterparty: "BERLINER VB BERLIN", amount: "39900,00", currency: "EUR", purpose: "BERLINER VB BERLIN Fil.Steglitz CRS/Berlin/DE" },
    { date: "26.1.2023", counterparty: "HEGEDUS ZOLTAN", amount: "200,00", currency: "EUR", purpose: "EK Mini ID. 1047" },
    { date: "26.1.2023", counterparty: "VALTON SPOLKA Z OGRANICZONA ODPOWIE", amount: "5500,00", currency: "EUR", purpose: "RECHNUNG 1027 EREF: SR23IP01023133DS" },
    { date: "27.1.2023", counterparty: "S+G Automobil AG", amount: "-33105,00", currency: "EUR", purpose: "EK Mercedes Benz C Klasse Auftrag-Nr 1123/01320 Kunden-Nr:0827177 FIN:R004467 ID:1081" },
];

/**
 * 10 Additional StarMoney transactions for incremental batch testing.
 */
export const STARMONEY_INCREMENTAL_NEW_TRANSACTIONS = [
    { date: "27.1.2023", counterparty: "Sabine Schilar", amount: "-11674,00", currency: "EUR", purpose: "EK Fiat 500 Elektro FIN:108447 ID:1091" },
    { date: "27.1.2023", counterparty: "Valentin Adrian Preuss", amount: "200,00", currency: "EUR", purpose: "Anzahlung Audi A3 Preuss" },
    { date: "27.1.2023", counterparty: "Hünies Maschinen", amount: "-13771,00", currency: "EUR", purpose: "RE NR 0001 2023 EK HYUNDAI KONA VIN: 127615 ID 1095" },
    { date: "31.1.2023", counterparty: "LITRIC D.O.O.", amount: "8500,00", currency: "EUR", purpose: "WV1ZZZ2KZLX008586 CADDY-FN570620" },
    { date: "31.1.2023", counterparty: "KFZ Handel + Auto Transport", amount: "-450,00", currency: "EUR", purpose: "Auto Transport A Kl Vin 01793 id. 1026 Re Rr. 200055" },
    { date: "31.1.2023", counterparty: "KFZ Handel + Auto Transport", amount: "-350,00", currency: "EUR", purpose: "Auto Transport Audi Vin. 38447 RE Nr. 20056 ID: 1034" },
    { date: "31.1.2023", counterparty: "KFZ Handel + Auto Transport", amount: "-450,00", currency: "EUR", purpose: "Auto Transport Renault Vin. 28763 RE Nr. 20057 ID: 1067" },
    { date: "31.1.2023", counterparty: "EUROMAX", amount: "-1200,00", currency: "EUR", purpose: "RE NR: 79/2022 3X AUTOTRANPORT DACIA MAZDA RENAULT" },
    { date: "31.1.2023", counterparty: "Berliner Volksbank", amount: "-23,70", currency: "EUR", purpose: "ABSCHLUSS PER 31.01.2023" },
    { date: "02.2.2023", counterparty: "Fred Gliese", amount: "-10882,00", currency: "EUR", purpose: "EK VW Caddy FIN:88727 ID:1114" },
];

/**
 * Returns StarMoney Batch 1 CSV string (15 movements).
 */
export function getStarMoneyBatch1Csv(): string {
    return buildStarMoneyCsv(STARMONEY_BASE_TRANSACTIONS);
}

/**
 * Returns StarMoney Batch 2 CSV string (25 movements: 15 existing + 10 new).
 */
export function getStarMoneyBatch2IncrementalCsv(): string {
    return buildStarMoneyCsv([...STARMONEY_BASE_TRANSACTIONS, ...STARMONEY_INCREMENTAL_NEW_TRANSACTIONS]);
}
