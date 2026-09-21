/**
 * Utility to parse and format Activity Log details.
 * Supports:
 * 1. Bilingual JSON payloads: `{"en": "...", "de": "..."}`
 * 2. On-the-fly regex translation of historical English records into German
 */

const statusMapDe: Record<string, string> = {
    available: "Verfügbar",
    reserved: "Reserviert",
    sold: "Verkauft",
    purchased: "Gekauft",
    in_preparation: "In Aufbereitung",
    in_stock: "Auf Lager",
    offer: "Angebot",
    inactive: "Inaktiv",
    confirmed: "Bestätigt",
    review_required: "Prüfung erforderlich",
    active: "Aktiv",
}

export function formatActivityLogDetails(
    details: string | null | undefined,
    locale: string = "en"
): string {
    if (!details) return "-"

    const trimmed = details.trim()

    // 1. Check if details is JSON (new bilingual format)
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
            const parsed = JSON.parse(trimmed)
            if (typeof parsed === "object" && parsed !== null) {
                if (locale.startsWith("de") && parsed.de) {
                    return parsed.de
                }
                if (parsed.en) {
                    return parsed.en
                }
                if (parsed.de) {
                    return parsed.de
                }
            }
        } catch {
            // Not valid JSON, continue with pattern matching
        }
    }

    // 2. If viewing in German, match and translate historical English strings
    if (locale.startsWith("de")) {
        // "Status changed from X to Y"
        const statusFromToMatch = trimmed.match(/^Status changed from\s+(\w+)\s+to\s+(\w+)$/i)
        if (statusFromToMatch) {
            const from = statusMapDe[statusFromToMatch[1].toLowerCase()] || statusFromToMatch[1]
            const to = statusMapDe[statusFromToMatch[2].toLowerCase()] || statusFromToMatch[2]
            return `Status geändert von ${from} auf ${to}`
        }

        // "Status changed: X → Y"
        const statusArrowMatch = trimmed.match(/^Status changed:\s*(\w+)\s*→\s*(\w+)$/i)
        if (statusArrowMatch) {
            const from = statusMapDe[statusArrowMatch[1].toLowerCase()] || statusArrowMatch[1]
            const to = statusMapDe[statusArrowMatch[2].toLowerCase()] || statusArrowMatch[2]
            return `Status geändert: ${from} → ${to}`
        }

        // "Reactivated (inactive → X)"
        const reactivatedMatch = trimmed.match(/^Reactivated\s*\(inactive\s*→\s*(\w+)\)$/i)
        if (reactivatedMatch) {
            const target = statusMapDe[reactivatedMatch[1].toLowerCase()] || reactivatedMatch[1]
            return `Reaktiviert (Inaktiv → ${target})`
        }

        // "Vehicle image updated"
        if (/^Vehicle image updated$/i.test(trimmed)) {
            return "Fahrzeugbild aktualisiert"
        }

        // "Expense/Earning of X added (Category / Subcategory)"
        const addedMatch = trimmed.match(/^(Expense|Earning)\s+of\s+([\d.,]+)\s+added\s+\((.*)\)$/i)
        if (addedMatch) {
            const type = addedMatch[1].toLowerCase() === "expense" ? "Ausgabe" : "Einnahme"
            return `${type} in Höhe von ${addedMatch[2]} hinzugefügt (${addedMatch[3]})`
        }

        // "Expense/Earning of X removed"
        const removedMatch = trimmed.match(/^(Expense|Earning)\s+of\s+([\d.,]+)\s+removed$/i)
        if (removedMatch) {
            const type = removedMatch[1].toLowerCase() === "expense" ? "Ausgabe" : "Einnahme"
            return `${type} in Höhe von ${removedMatch[2]} entfernt`
        }
    }

    return trimmed
}
