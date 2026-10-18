export interface StandardOptionItem {
    id?: string | number
    name: string
    vehicle_classes?: string[]
    [key: string]: any
}

/**
 * Intelligently finds the best matching standard/protected choice option in real time
 * based on user input, category synonyms, word boundaries, and substring matching.
 */
export function findMatchingStandardOption<T extends StandardOptionItem>(
    options: T[],
    text: string,
    category: string
): T | null {
    const raw = text.trim().toLowerCase()
    if (!raw || !options || options.length === 0) return null

    // 1. Exact match (case-insensitive)
    const exact = options.find((opt) => opt.name.toLowerCase() === raw)
    if (exact) return exact

    // 2. Normalize umlauts and special characters for comparison
    const normalize = (s: string) =>
        s.toLowerCase()
            .replace(/ä/g, "ae")
            .replace(/ö/g, "oe")
            .replace(/ü/g, "ue")
            .replace(/ß/g, "ss")
            .replace(/[^a-z0-9]/g, "")

    const normRaw = normalize(raw)
    const exactNorm = options.find((opt) => normalize(opt.name) === normRaw)
    if (exactNorm) return exactNorm

    // 3. Category-specific synonyms / aliases mapping to standard name keyword
    const SYNONYMS: Record<string, Record<string, string[]>> = {
        make: {
            "volkswagen": ["vw", "volks wagen"],
            "mercedes-benz": ["mercedes", "benz", "daimler", "amg"],
            "rolls-royce": ["rolls royce", "rolls"],
            "land rover": ["range rover", "defender"],
            "alfa romeo": ["alfa"],
            "harley-davidson": ["harley"],
            "aston martin": ["aston"],
        },
        body_type: {
            "kombi": ["estate", "touring", "avant", "t-modell", "station wagon", "shooting brake"],
            "limousine": ["sedan", "saloon", "stufenheck", "notchback"],
            "suv": ["crossover"],
            "geländewagen": ["offroad", "off-road", "allrad", "4x4"],
            "cabriolet": ["cabrio", "roadster", "convertible", "spider", "spyder", "targa"],
            "sportwagen": ["coupe", "coupé", "sport", "gt"],
            "van / kleinbus": ["van", "bus", "kasten", "transporter", "pritsche", "multivan", "minivan", "spaceback"],
            "kleinwagen": ["kompakt", "hatchback", "fließheck", "city", "micro"],
        },
        fuel_type: {
            "benzin": ["petrol", "gasoline", "otto", "super", "e10", "e5"],
            "diesel": ["tdi", "cdi", "dci", "d-4d", "crdi"],
            "elektro": ["electric", "strom", "ev", "bev"],
            "hybrid": ["mhev", "mild hybrid", "vollhybrid", "fhev"],
            "plug-in-hybrid": ["plug in", "phev", "plugin"],
            "autogas (lpg)": ["lpg", "autogas", "flüssiggas"],
            "erdgas (cng)": ["cng", "erdgas"],
            "wasserstoff": ["hydrogen", "h2", "fuel cell"],
        },
        color: {
            "schwarz": ["black", "nero", "noir", "schwarz metallic", "cosmosschwarz", "saphirschwarz", "obsidianschwarz"],
            "weiß": ["white", "bianco", "blanc", "polarweiß", "alpinweiß", "mineralweiß"],
            "grau": ["grey", "gray", "anthrazit", "daytonagrau", "nardo", "selenitgrau"],
            "silber": ["silver", "argent", "plata", "silber metallic", "iridiumsilber"],
            "blau": ["blue", "bleu", "azzurro", "estorilblau", "nachtblau"],
            "rot": ["red", "rosso", "rouge", "misanorot", "rubinrot"],
            "grün": ["green", "verde", "vert", "gruen", "smaragdgrün"],
            "gelb": ["yellow", "giallo", "jaune"],
            "braun": ["brown", "marron", "marrone"],
            "orange": ["arancione"],
            "beige": ["sand", "champagner"],
            "gold": ["golden"],
            "violett": ["purple", "lila", "violet", "viola"],
        },
        doors: {
            "2/3": ["2", "3", "2 türen", "3 türen", "two", "three", "2/3 türen"],
            "4/5": ["4", "5", "4 türen", "5 türen", "four", "five", "4/5 türen"],
            "6/7": ["6", "7", "6 türen", "7 türen", "six", "seven", "6/7 türen"],
        },
        vehicle_type: {
            "pkw": ["car", "auto", "personenkraftwagen"],
            "motorrad": ["bike", "scooter", "roller", "chopper", "motorrad/roller"],
            "wohnmobil / wohnwagen": ["wohnmobil", "wohnwagen", "caravan", "camper", "motorhome"],
            "transporter": ["kasten", "pritsche", "van"],
            "lkw": ["truck"],
            "sattelzugmaschine": ["sattelzug", "zugmaschine"],
            "anhänger": ["trailer"],
            "auflieger": ["sattelauflieger"],
            "baumaschine": ["bagger", "radlader"],
            "agrarfahrzeug": ["traktor", "schlepper"],
            "gabelstapler": ["stapler"],
            "bus": ["reisebus", "omnibus"],
            "e-bike": ["ebike", "pedelec"],
        }
    }

    const catSynonyms = SYNONYMS[category]
    if (catSynonyms) {
        for (const [targetName, keywords] of Object.entries(catSynonyms)) {
            for (const kw of keywords) {
                const pattern = new RegExp(`(^|\\b|\\s|_|-)${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\b|\\s|_|-)`, "i")
                if (pattern.test(raw) || raw.includes(kw)) {
                    const match = options.find((opt) => opt.name.toLowerCase() === targetName.toLowerCase())
                    if (match) return match
                }
            }
        }
    }

    // 4. Whole word / substring check against option name
    for (const opt of options) {
        const optName = opt.name.toLowerCase()
        if (optName.length < 2) continue
        const wordRegex = new RegExp(`(^|\\b|\\s|_|-)${optName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\b|\\s|_|-)`, "i")
        if (wordRegex.test(raw)) {
            return opt
        }
        if (optName.length >= 4 && raw.includes(optName)) {
            return opt
        }
    }

    // 5. Prefix match (if input length >= 3)
    if (raw.length >= 3) {
        const prefixMatch = options.find((opt) => opt.name.toLowerCase().startsWith(raw))
        if (prefixMatch) return prefixMatch
    }

    // 6. For vehicle_model: match numbers e.g. "320d" -> "320"
    if (category === "vehicle_model") {
        const numMatch = raw.match(/\d+/)
        if (numMatch) {
            const numStr = numMatch[0]
            const modelNumMatch = options.find((opt) => {
                const optNum = opt.name.match(/\d+/)
                return optNum && optNum[0] === numStr
            })
            if (modelNumMatch) return modelNumMatch
        }
    }

    return null
}
