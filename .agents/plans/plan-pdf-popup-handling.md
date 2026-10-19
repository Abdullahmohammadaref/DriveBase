# plan-pdf-popup-handling.md — PDF Generation: Popup Blocker Safety Net

> **Date:** 2026-05-17
> **Agent target:** Antigravity / Claude Code
> **Scope:** `ContractModal.tsx` only — one file, frontend only, no backend changes
> **Pre-read (mandatory):** `idea.md`, `developer-guide.md`, `PROJECT_MAP.md`, `design-system/components.md`
> **Skill to read:** `SKILL.md` (the backend crash prevention skill — relevant if touching any imports)

---

## Context Summary

DriveBase generates PDFs for vehicle documents. The `ContractModal` is a multi-step wizard:
- Step 1: Buy Documents vs Sale Documents
- Step 2 (sale only): EU Country vs Outside EU
- Step 3 (sale only): Sales Agreement (2 PDFs) / Receipt (2 PDFs) / Binding Order (1 PDF)

The current implementation tries to open multiple tabs simultaneously using programmatic `<a>` clicks. Browsers (Chrome, Firefox, Edge) block all but the first tab in this scenario as a popup — the user only sees one PDF and never knows the others existed.

The fix: after the user picks their document option, **add a new final step** ("download-ready") that shows individual download buttons for each PDF in that set — as a guaranteed fallback. While this step is rendering, also attempt to open the tabs as usual (best-effort). The download buttons are always there as the safety net. A quiet, non-alarming hint at the bottom of the step tells the user about the popup situation without screaming at them.

---

## Document Sets (What generates what)

Based on the current code and backend endpoints:

| Option | PDFs Generated | Endpoints Called |
|---|---|---|
| **Buy Contract** | 1 | `GET /api/vehicles/{id}/pdf/buy-contract` |
| **Sales Agreement** | 2 | `GET /api/vehicles/{id}/pdf/sale-agreement` + `GET /api/vehicles/{id}/pdf/identity-check` |
| **Receipt** | 2 | `GET /api/vehicles/{id}/pdf/receipt?region={region}` + `GET /api/vehicles/{id}/pdf/identity-check` |
| **Binding Order** | 1 | `GET /api/vehicles/{id}/pdf/binding-order` |

---

## What Changes

**File:** `frontend/src/components/vehicles/ContractModal.tsx`

This is the **only file that changes**. No backend changes. No new components. No changes to `VehiclesPage.tsx` or `VehicleForm.tsx` (they just pass `open`/`onOpenChange`/`vehicle` — the modal handles everything internally).

---

## Step-by-Step Implementation

### 1 — Add the new step to `ModalStep`

```ts
// BEFORE:
type ModalStep = "choose-type" | "sale-region" | "sale-documents"

// AFTER:
type ModalStep = "choose-type" | "sale-region" | "sale-documents" | "download-ready"
```

### 2 — Define a `PdfEntry` type for the download-ready step

Add this interface at the top of the file (after imports, before `ContractModalProps`):

```ts
interface PdfEntry {
    label: string        // e.g. "Sales Agreement", "Identity Check"
    url: string          // full API URL, e.g. /api/vehicles/5/pdf/sale-agreement
}
```

### 3 — Add state for the generated PDF list

```ts
const [pendingPdfs, setPendingPdfs] = useState<PdfEntry[]>([])
```

Reset it in `handleOpenChange`:

```ts
const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
        setStep("choose-type")
        setSaleRegion(null)
        setPendingPdfs([])   // ← add this
    }
    onOpenChange(isOpen)
}
```

### 4 — Replace the four handler functions

Replace all four current handler functions (`handleBuyContract`, `handleSalesAgreement`, `handleReceipt`, `handleBindingOrder`) with a single unified helper `triggerPdfGeneration` and rewrite the handlers to call it. This reduces duplication and makes the pattern consistent.

```ts
/**
 * Core PDF generation handler.
 * 1. Attempts to open each PDF in a new tab (best-effort — may be blocked).
 * 2. Always transitions to the "download-ready" step with individual download buttons.
 */
const triggerPdfGeneration = (pdfs: PdfEntry[]) => {
    if (!vehicle?.internal_id) return

    // Best-effort: try to open all tabs at once
    // Browsers will block all but the first — that's expected, the buttons are the real fallback
    pdfs.forEach((pdf, index) => {
        const link = document.createElement("a")
        link.href = pdf.url
        link.target = `pdf-tab-${Date.now()}-${index}`
        link.rel = "noopener noreferrer"
        link.style.display = "none"
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    })

    // Always show the download-ready step regardless of whether tabs opened
    setPendingPdfs(pdfs)
    setStep("download-ready")
}

const handleBuyContract = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!vehicle?.internal_id) return
    triggerPdfGeneration([
        { label: "Purchase Contract", url: pdfUrl("buy-contract") },
    ])
}

const handleSalesAgreement = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!vehicle?.internal_id) return
    triggerPdfGeneration([
        { label: "Sales Agreement", url: pdfUrl("sale-agreement") },
        { label: "Identity Check", url: pdfUrl("identity-check") },
    ])
}

const handleReceipt = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!vehicle?.internal_id) return
    const backendRegion = saleRegion === "non-eu" ? "outside_eu" : "eu"
    triggerPdfGeneration([
        { label: "Receipt", url: pdfUrl("receipt", { region: backendRegion }) },
        { label: "Identity Check", url: pdfUrl("identity-check") },
    ])
}

const handleBindingOrder = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!vehicle?.internal_id) return
    triggerPdfGeneration([
        { label: "Binding Order", url: pdfUrl("binding-order") },
    ])
}
```

Remove the old `openPdfTabs` helper entirely — `triggerPdfGeneration` replaces it.

Also remove the `setTimeout(() => handleOpenChange(false), 50)` calls from the old handlers — the modal now stays open and transitions to `download-ready` instead of closing.

### 5 — Update `handleBack`

`handleBack` needs to handle going back from `download-ready`. Going back from the download-ready step brings the user back to `sale-documents` (or to `choose-type` for buy contract). Since we can't easily know which step originated the `download-ready` step, the simplest approach is to track this with a tiny piece of state:

```ts
const [prevStep, setPrevStep] = useState<ModalStep>("choose-type")
```

Set it before each `triggerPdfGeneration` call by recording the current step. Actually, simpler: just set `download-ready`'s back destination based on `pendingPdfs` contents — if it came from buy, `pendingPdfs` has 1 entry and it's a `buy-contract` URL, otherwise it came from `sale-documents`.

Even simpler: reset to `prevStep`. Add the state `const [originStep, setOriginStep] = useState<ModalStep>("choose-type")` and set it in `triggerPdfGeneration`:

```ts
const triggerPdfGeneration = (pdfs: PdfEntry[], fromStep: ModalStep) => {
    ...
    setOriginStep(fromStep)
    setPendingPdfs(pdfs)
    setStep("download-ready")
}
```

Pass `step` when calling from each handler:

```ts
const handleBuyContract = (e: React.MouseEvent) => {
    ...
    triggerPdfGeneration([{ label: "Purchase Contract", url: pdfUrl("buy-contract") }], step)
}
// Same for the others: pass `step` as the second argument
```

Update `handleBack`:

```ts
const handleBack = () => {
    if (step === "download-ready") {
        setStep(originStep)
        setPendingPdfs([])
    } else if (step === "sale-documents") {
        setStep("sale-region")
        setSaleRegion(null)
    } else if (step === "sale-region") {
        setStep("choose-type")
    }
}
```

Add `originStep` to the reset in `handleOpenChange`:

```ts
const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
        setStep("choose-type")
        setSaleRegion(null)
        setPendingPdfs([])
        setOriginStep("choose-type")
    }
    onOpenChange(isOpen)
}
```

### 6 — Add the `download-ready` step JSX

Add a new JSX block after the `step === "sale-documents"` block. This is the entire download-ready UI:

```tsx
{/* Step 4: Download Ready — PDF buttons + popup hint */}
{step === "download-ready" && (
    <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
            {pendingPdfs.length === 1
                ? "Your document is ready. Click below to open it."
                : `Your ${pendingPdfs.length} documents are ready. Open each one below.`}
        </p>

        {/* One download button per PDF */}
        <div className="space-y-2">
            {pendingPdfs.map((pdf, index) => (
                <a
                    key={index}
                    href={pdf.url}
                    target={`pdf-download-${Date.now()}-${index}`}
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 w-full rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/50 hover:border-primary/40 transition-colors"
                >
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span>{pdf.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">Open PDF →</span>
                </a>
            ))}
        </div>

        {/* Quiet popup hint — only shown if there are multiple PDFs */}
        {pendingPdfs.length > 1 && (
            <p className="text-xs text-muted-foreground pt-1 border-t border-border">
                If a PDF didn't open automatically, use the buttons above. You may need to allow pop-ups for this site in your browser settings.
            </p>
        )}
    </div>
)}
```

Design notes:
- The download buttons are plain `<a>` tags styled to look like list items — not `<Button>` with `onClick`. This is intentional: browser popup blockers generally allow `<a target="_blank">` clicks initiated from direct user interaction, and each click is a separate, deliberate user action — meaning each one will open successfully even with popup blocking enabled. This is the key difference from `triggerPdfGeneration`'s programmatic mass-open (which does get blocked). The fallback step effectively turns "one click opens 2 tabs at once" into "user clicks each button once → each tab opens cleanly."
- `border-border` and `hover:bg-muted/50` match the VMS design system (components.md pattern for interactive rows).
- The popup hint is small (`text-xs text-muted-foreground`), separated by a subtle divider, and only shows when there are 2+ PDFs. It is not shown at all for single-PDF cases — no noise.
- No success/failure tracking, no toast notifications, no loading spinners. The PDF either opens or it doesn't. The buttons are always there.

### 7 — Add new imports

Add `Download` icon from lucide-react (or keep `FileText` — it's already imported and works fine). No new imports needed beyond what's already there. `FileText` is used in the download buttons.

Verify the existing import line covers all used icons:

```ts
import { FileText, Globe, ArrowLeft, Receipt, ClipboardList, FileSignature } from "lucide-react"
```

All icons used in existing steps are still present. The `download-ready` step uses `FileText` which is already imported. No changes needed to the import line.

### 8 — Update the dialog width

The current `DialogContent` is `sm:max-w-[450px]`. This is fine for the download-ready step — the content is simple enough. No width change needed.

### 9 — Update `ModalStep` type in the back button condition

The back button shows for `step !== "choose-type"`. Since `download-ready` is not `choose-type`, the back arrow will already appear. No change needed there.

### 10 — Locale keys

The `ContractModal` currently uses **hardcoded English strings** (not `t()` calls). This is consistent with how it was written — the entire component has no `t()` calls. Do not add i18n to the existing strings in this plan (out of scope — changing them would require `useTranslation` import and touching every string). Add no locale keys. Keep the new strings in the `download-ready` step as hardcoded English, consistent with the rest of the file.

---

## Complete Updated State Variables

After all changes, the component has these state variables:

```ts
const [step, setStep] = useState<ModalStep>("choose-type")
const [saleRegion, setSaleRegion] = useState<SaleRegion | null>(null)
const [pendingPdfs, setPendingPdfs] = useState<PdfEntry[]>([])
const [originStep, setOriginStep] = useState<ModalStep>("choose-type")
```

---

## Complete Reset in `handleOpenChange`

```ts
const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
        setStep("choose-type")
        setSaleRegion(null)
        setPendingPdfs([])
        setOriginStep("choose-type")
    }
    onOpenChange(isOpen)
}
```

---

## Files Modified Summary

| File | Change |
|---|---|
| `frontend/src/components/vehicles/ContractModal.tsx` | Add `PdfEntry` type; add `download-ready` to `ModalStep`; add `pendingPdfs` and `originStep` state; replace `openPdfTabs` + individual handlers with `triggerPdfGeneration` + updated handlers; update `handleBack` to handle `download-ready`; update `handleOpenChange` to reset new state; add `download-ready` JSX step |

**Nothing else changes.** `VehiclesPage.tsx`, `VehicleForm.tsx`, `vehicle_api.py`, all locale files — untouched.

---

## Behavior Summary After This Change

| Scenario | What Happens |
|---|---|
| User clicks **Binding Order** | `triggerPdfGeneration` tries to open 1 tab. Modal transitions to `download-ready` showing 1 button: "Binding Order → Open PDF". User clicks it — PDF opens cleanly (single tab, no blocking). |
| User clicks **Sales Agreement** | Tries to open 2 tabs (browser blocks the 2nd). Modal shows 2 buttons: "Sales Agreement → Open PDF" and "Identity Check → Open PDF". User clicks each — both open cleanly. |
| User clicks **Receipt** | Same as Sales Agreement — 2 buttons. |
| User clicks **Buy Contract** (from step 1) | Tries 1 tab. Modal shows 1 button. Works cleanly. |
| User wants to generate a different doc | Clicks back arrow → returns to previous step → selects again. |
| User is done | Clicks the `X` or clicks outside the modal — everything resets. |

---

## Do Not Touch

- `VehiclesPage.tsx` — passes `vehicle` to modal, no changes needed
- `VehicleForm.tsx` — passes `vehicle ?? null` to modal, no changes needed
- All backend PDF endpoints — they are correct and working
- `pdf_generators/vehicle_pdfs.py` — no changes
- `api.py` PDF routes — no changes
- Any other frontend files

---

## TypeScript Check

After changes, run:

```bash
cd frontend && npx tsc --noEmit
```

The only thing to verify: `triggerPdfGeneration` signature accepts `(pdfs: PdfEntry[], fromStep: ModalStep)` and all four call sites pass both arguments. TypeScript will catch any mismatch.
