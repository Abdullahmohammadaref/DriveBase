You have Codegraph access to the drivebase project in this environment. Before concluding you don't have access to something, actually call the tool and check — don't answer from assumption.

ok now before looking any line of code look at
idea.md
to understand the overall idea of the app then read
developer_guide.md
to see the technical side of the idea, then look at
PROJECT_MAP.md
docs-ui-tweak-fix.md
to see what have been done in the project then look at
design-system
to understand the design of this application,

after doing all this please make a plan_{whatever_name_that_suits}.md file for the following feature I am going to describe now:

"""
ROOT CAUSE BUG FIX + PROFIT FORMULA RESTRUCTURE ON THE EDIT VEHICLE DETAILS PAGE

There is a sign bug in how "Net Expenses & Earnings" flows into COGS on the Edit
Vehicle Details page. The Expenses & Earnings card correctly displays:

    NET: −300.00 €
    Earnings (+0.00 €) − Expenses (300.00 €)

So the signed net value (earnings minus expenses) is −300.00 when there's a €300
expense and no earnings. This signed value is the source of truth and must be
used AS-IS (with its sign) everywhere it feeds into a calculation.

Currently, COGS is calculated as:
    COGS = buy_net + 300.00   (WRONG — always adds the absolute expense amount)

It must instead be:
    COGS = buy_net + net_exp_earn   (where net_exp_earn is the SIGNED value, e.g. −300.00)

For this example vehicle:
    COGS = 14,409.09 + (−300.00) = 14,109.09 €   (not 14,709.09 €)

This is the root cause and must be fixed at its source — the shared financial
calculation function used by the Edit Vehicle Details page (find it via Codegraph;
in earlier work this lived in vehicleFinancials.ts, in a function likely named
calcVehicleFinancials or similar — verify the actual current name and location
via Codegraph, do not assume it hasn't moved).

SECOND CHANGE — restructure Gross Profit, Net Profit, and Total Profit to all
consistently subtract cost (COGS), instead of only Total Profit doing so:

Introduce a "Gross COGS" value (mirrors COGS but using the gross/tax-included
buy price instead of net):
    Gross COGS = buy_gross + net_exp_earn
    Example: 15,850.00 + (−300.00) = 15,550.00 €

Then:

    Gross Profit = sale_gross − Gross COGS
    Example: 19,990.00 − 15,550.00 = 4,440.00 €
    (This REPLACES the current formula of sale_gross − buy_gross, which ignores
    expenses/earnings entirely — that is the bug being fixed here.)

    Net Profit = sale_net − COGS
    Example: 18,172.73 − 14,109.09 = 4,063.64 €
    (This REPLACES the current formula of sale_net − buy_net, which also ignores
    expenses/earnings entirely.)

    VAT Liability = |sale_tax_amount − buy_tax_amount|   (UNCHANGED)
    Example: |1,817.27 − 1,440.91| = 376.36 €

    Total Profit = Net Profit − VAT Liability
    Example: 4,063.64 − 376.36 = 3,687.28 €
    (This SIMPLIFIES the current formula, which was:
    sale_net − COGS − VAT Liability. Since Net Profit now already has COGS
    subtracted, Total Profit no longer needs to subtract COGS a second time —
    it only needs to subtract VAT Liability from the already-COGS-adjusted
    Net Profit.)

WHERE THIS APPLIES: Only the Edit Vehicle Details page (the single-vehicle
COGS / VAT Liability / Break-Even / Gross Profit / Net Profit / Total Profit /
Margin / ROI card grid). This is a SEPARATE page/component from the Vehicles
list page summary cards (that page has its own already-planned changes in
plan_vehicles_page_summary_cards.md — do not touch that file's scope in this task,
but DO read it, because both places compute "net_exp_earn" and they MUST use
the exact same sign convention: net_exp_earn = total_earnings − total_expenses
(matching what the Expenses & Earnings card literally displays as "NET"). If
the vehicles-page-summary plan used the opposite sign convention anywhere,
flag that mismatch explicitly and correct it as part of this plan too, since
having two different sign conventions for the same value in two different
places would be a critical inconsistency bug.

EQUATION LABELS: Update the small gray equation text shown under each of these
metric cards (COGS, Gross Profit, Net Profit, Total Profit) to reflect the new
formulas exactly, using the vehicle's real signed values, e.g.:
    COGS: "14,409.09 € + (−300,00 €)"  or however the codebase's existing
    formatting convention displays negative additions — check the existing
    equation-string formatting pattern in the code and match it exactly, do
    not invent a new format.

Margin and ROI formulas stay conceptually the same (Gross Profit ÷ Sale Net,
Gross Profit ÷ COGS) but will now naturally reflect the new Gross Profit and
COGS values since those are corrected inputs.

Break-Even is UNCHANGED by this task — do not touch it.
"""

the plan needs to be concrete — exact file paths, exact function names, exact expected change — not a description of intent. additionally in this plan you should utilize multiple agents architecture (non-overlapping file/directory scopes per agent — no two agents ever write to the same file; sequential dependency first — if task B needs task A's output, they stay with one agent or B waits until A is verified done; only genuinely independent tasks in unrelated files get split into parallel subagents; one subagent per independent unit of work, not one per line item in the list; a review checkpoint after each phase, not one giant unreviewed run) when needed, this way the managing agent will be commanded to split tasks and use multiple agents correctly.

For every task in the plan, format it like this — not as prose:

```
### Task: [short name]
SCOPE: [exact file path(s) this task is allowed to touch — nothing outside this list]
MODE: sequential — [reason it must not run in parallel]
```

or

```
### Task: [short name]
SCOPE: [exact file path(s) this task is allowed to touch — nothing outside this list]
MODE: parallel-safe — [what it's independent of]
```

Rules for deciding MODE: default to sequential. Only mark a task parallel-safe if its SCOPE has zero file overlap with every other parallel-safe task AND it doesn't read or depend on output that another task in this batch produces. If two tasks touch the same file, or one needs the other's result, they must not both be parallel-safe — either merge them into one task, or make the dependent one sequential and order it after the one it depends on.

These SCOPE and MODE fields are binding execution instructions for whichever agent runs this plan next, not descriptive notes — treat them the same as a direct command.

Before finalizing the plan, verify PROJECT_MAP.md still matches current code via Codegraph. If anything's mismatched, note it in the plan and flag it to me — don't silently trust the docs.

You are connected with Codegraph so please make use of it when you have to look at code (and you must look at code also as we said, don't trust documentation only) as Codegraph saves a lot of usages, this is simply not an option for you, you have to do it.

For any claim from idea.md, developer_guide.md, PROJECT_MAP.md, or design-system about what currently exists in the code, verify it against the actual code via Codegraph before relying on it in the plan — don't trust docs alone. If something's mismatched, note it in the plan and flag it to me rather than guessing.

do all this in this one prompt, don't stop until you are done.
