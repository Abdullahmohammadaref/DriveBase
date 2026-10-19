# Component Examples

This file documents standard patterns for UI components in the VMS.

## 1. Interactive Elements & Hover States
Every clickable element must respond to hover:
- **Cards**: Add a subtle scale transform or background color shift.
- **Table Rows**: Apply `hover:bg-muted/50`.
- **Icon Buttons**: Use `variant="ghost" size="icon"` from shadcn/ui.
- **Tooltips**: Every icon-only button must be wrapped in a Tooltip.

```tsx
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"

<Tooltip>
    <TooltipTrigger asChild>
        <Button variant="ghost" size="icon">
            <Trash2 className="h-4 w-4" />
        </Button>
    </TooltipTrigger>
    <TooltipContent>Deactivate record</TooltipContent>
</Tooltip>
```

## 2. Form Fields
Mandatory fields require an asterisk:

```tsx
<Label htmlFor="make">
    {t("vehicles.make")} <span className="text-destructive">*</span>
</Label>
```

**Select Components:**
- `DynamicSelect`: For ID-based choices (has Quick Add).
- `SearchableSelect`: For string-based choices (no Quick Add).

## 3. StickyFooter
All list and edit pages require a `StickyFooter` to keep primary actions accessible without scrolling.

```tsx
import { StickyFooter } from "@/components/StickyFooter"

<StickyFooter>
    <div className="flex items-center gap-2">
        {/* AutosaveIndicator, Left Actions */}
    </div>
    <div className="flex items-center gap-2">
        {/* Next/Prev Navigation, Primary Action */}
    </div>
</StickyFooter>
```

## 4. Status Badges
Status indicators must use the semantic colors defined in `colors.md`. Ensure consistency between the list view, detail cards, and the footer.

## 5. KPI Cards (Dashboard)
Dashboard KPI cards follow a consistent layout:
- 36×36 icon container with tinted background (`bg-{color}/10`)
- Label → Value → Sublabel → Optional equation
- All values use `font-bold`, sized by importance (`text-lg` primary, `text-base` secondary)

```tsx
<div className="rounded-xl border border-border bg-card p-4">
    <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
            <DollarSign className="h-4 w-4 text-emerald-600" />
        </div>
        <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Label</p>
            <p className="text-lg font-bold text-emerald-600">€12,500</p>
            <p className="text-[10px] text-muted-foreground">avg €2,500 / vehicle</p>
        </div>
    </div>
</div>
```

## 6. Charts (recharts)
All charts use the same Tooltip styling:
```tsx
contentStyle={{
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    fontSize: "12px",
}}
```
- Revenue: `hsl(142, 71%, 45%)` (green)
- Expenses: `hsl(0, 84%, 60%)` (red)
- Profit: `hsl(262, 83%, 58%)` (purple, with gradient fill)

## 7. FinancialMetricsStrip
Two-row layout for vehicle financial KPIs:
- **Row 1 (Cost Basis)**: COGS (`buyNet + netExpEarn`), VAT Liability (`|saleTax − buyTax|`), Break-Even (dynamic target margin multiplier e.g. `× 1.10`)
- **Row 2 (Profit — only when sold)**: Gross Profit (`(saleGross − buyGross) + netExpEarn`), Net Profit (`(saleNet − buyNet) + netExpEarn`), Total Profit (`Net Profit − VAT Liability`, highlighted), Margin (`Gross Profit ÷ saleNet`), ROI (`Gross Profit ÷ COGS`)
- Note: Holding Cost and Adj. Profit cells are preserved commented-out in code.
- Equations use compact format: `€19,990 − €15,850 + (−€300)` or `€18,172.73 − €14,409.09 + (−€300.00)`

## 8. Split-View Toggle
The VehicleFormPage supports a toggleable split view:
- Toggle button renders in the StickyFooter (passed via `splitViewToggle` prop)
- Uses `PanelRightOpen` / `PanelRightClose` icons from lucide-react
- Side-by-side layout activates at `2xl` breakpoint only (1536px+)
- Preference persisted in `localStorage` key `drivebase_vehicle_split_view`

## 9. Transaction Financial Summary
The transaction dashboard and form use a high-density, horizontal 9-card summary:
- **Metrics**: Net (Revenue, Expenses, Profit), Tax (Revenue, Expenses, Total), Gross (Revenue, Expenses, Difference).
- **Layout**: Single horizontal row using `flex-1` to fill the whole available width, with `overflow-x-auto` fallback.
- **Aesthetics**: Compact cards with `text-[10px]` labels and `text-sm` font-mono values.
- **Colors**: Standard semantic colors for revenue (emerald) and expenses/losses (red).
