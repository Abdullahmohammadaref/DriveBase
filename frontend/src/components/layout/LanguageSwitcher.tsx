import { useNavigate, useParams, useLocation } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type SupportedLocale, type AnyLocale } from "@/lib/i18n"

// SVG Flag components matching the legacy design
const GermanFlag = () => (
    <svg viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0 rounded-xs">
        <path fill="#FFCD05" d="M0 27a4 4 0 0 0 4 4h28a4 4 0 0 0 4-4v-4H0v4z" />
        <path fill="#ED1F24" d="M0 14h36v9H0z" />
        <path fill="#141414" d="M32 5H4a4 4 0 0 0-4 4v5h36V9a4 4 0 0 0-4-4z" />
    </svg>
)

const EnglishFlag = () => (
    <svg viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0 rounded-xs">
        <path fill="#00247D" d="M0 9.059V13h5.628zM4.664 31H13v-5.837zM23 25.164V31h8.335zM0 23v3.941L5.63 23zM31.337 5H23v5.837zM36 26.942V23h-5.631zM36 13V9.059L30.371 13zM13 5H4.664L13 10.837z" />
        <path fill="#CF1B2B" d="M25.14 23l9.712 6.801a3.977 3.977 0 0 0 .99-1.749L28.627 23H25.14zM13 23h-2.141l-9.711 6.8c.521.53 1.189.909 1.938 1.085L13 23.943V23zm10-10h2.141l9.711-6.8a3.988 3.988 0 0 0-1.937-1.085L23 12.057V13zm-12.141 0L1.148 6.2a3.994 3.994 0 0 0-.991 1.749L7.372 13h3.487z" />
        <path fill="#EEE" d="M36 21H21v10h2v-5.836L31.335 31H32a3.99 3.99 0 0 0 2.852-1.199L25.14 23h3.487l7.215 5.052c.093-.337.158-.686.158-1.052v-.058L30.369 23H36v-2zM0 21v2h5.63L0 26.941V27c0 1.091.439 2.078 1.148 2.8l9.711-6.8H13v.943l-9.914 6.941c.294.07.598.116.914.116h.664L13 25.163V31h2V21H0zM36 9a3.983 3.983 0 0 0-1.148-2.8L25.141 13H23v-.943l9.915-6.942A4.001 4.001 0 0 0 32 5h-.663L23 10.837V5h-2v10h15v-2h-5.629L36 9.059V9zM13 5v5.837L4.664 5H4a3.985 3.985 0 0 0-2.852 1.2l9.711 6.8H7.372L.157 7.949A3.968 3.968 0 0 0 0 9v.059L5.628 13H0v2h15V5h-2z" />
        <path fill="#CF1B2B" d="M21 15V5h-6v10H0v6h15v10h6V21h15v-6z" />
    </svg>
)

const TurkishFlag = () => (
    <svg viewBox="-10 0 56 35" xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0 rounded-xs">
        <path fill="#E30917" d="M36 27a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V9a4 4 0 0 1 4-4h28a4 4 0 0 1 4 4v18z" />
        <path fill="#EEE" d="M16 24a6 6 0 1 1 0-12c1.31 0 2.52.425 3.507 1.138A7.332 7.332 0 0 0 14 10.647 7.353 7.353 0 0 0 6.647 18 7.353 7.353 0 0 0 14 25.354c2.195 0 4.16-.967 5.507-2.492A5.963 5.963 0 0 1 16 24zm3.913-5.77l2.44.562.22 2.493 1.288-2.146 2.44.561-1.644-1.888 1.287-2.147-2.303.98-1.644-1.889.22 2.494z" />
    </svg>
)

const ArabicFlag = () => (
    <svg viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0 rounded-xs">
        <path fill="#006C35" d="M0 5h36v18H0z" />
        <path fill="#006C35" d="M0 23h36v9H0z" />
        <path fill="#006C35" d="M0 0h36v36H0z" />
        <path fill="#FFF" d="M10 24h16v2H10z" />
        <path fill="#FFF" d="M12 26l2 2h-2zm12 0l-2 2h2z" />
        <path fill="#FFF" d="M14 12c-1 0-2 1-2 2s1 2 2 2 2-1 2-2-1-2-2-2zm5 0c-1 0-2 1-2 2s1 2 2 2 2-1 2-2-1-2-2-2zm5 0c-1 0-2 1-2 2s1 2 2 2 2-1 2-2-1-2-2-2z" />
        {/* Simplified Saudi Flag representation for icon size */}
        <rect width="36" height="36" fill="#006C35" rx="4" />
        <path fill="#FFF" d="M8 22h20v2H8zm3-3h14v-4H11v4zm4-7h6v2h-6v-2z" />
        <path fill="#FFF" d="M12 25l2 2h8l2-2H12z" />
    </svg>
)

const FLAGS: Record<AnyLocale, React.ComponentType> = {
    de: GermanFlag,
    en: EnglishFlag,
    tr: TurkishFlag,
    ar: ArabicFlag,
}

// ============================================================================
// DEACTIVATED FEATURE: Arabic ('ar') and Turkish ('tr') in language cycle
// WARNING: DO NOT DELETE THIS COMMENTED CODE!
// Preserved for future reactivation. See deactivated_features_docs.md.
// Previous 4-language cycle:
// const order: SupportedLocale[] = ['de', 'tr', 'en', 'ar']
// const currentIndex = order.indexOf(current)
// return order[(currentIndex + 1) % order.length]
// ============================================================================
// Toggle exclusively between German ('de', primary) and English ('en', secondary)
const getNextLocale = (current: SupportedLocale): SupportedLocale => {
    return current === 'de' ? 'en' : 'de'
}

export function LanguageSwitcher() {
    const { i18n } = useTranslation()
    const navigate = useNavigate()
    const location = useLocation()
    const { business_slug, locale } = useParams<{ business_slug: string; locale?: string }>()

    const currentLocale = (locale && (SUPPORTED_LOCALES as readonly string[]).includes(locale))
        ? locale as SupportedLocale
        : DEFAULT_LOCALE

    const nextLocale = getNextLocale(currentLocale)
    const NextFlag = FLAGS[nextLocale]

    const handleSwitch = () => {
        // Get the current path after locale
        let pathAfterLocale = location.pathname

        // Remove business_slug prefix
        if (business_slug) {
            pathAfterLocale = pathAfterLocale.replace(`/${business_slug}`, '')
        }

        // Remove current locale prefix if present
        if (locale && (SUPPORTED_LOCALES as readonly string[]).includes(locale)) {
            pathAfterLocale = pathAfterLocale.replace(`/${locale}`, '')
        }

        // Ensure path starts with /
        if (!pathAfterLocale.startsWith('/')) {
            pathAfterLocale = '/' + pathAfterLocale
        }

        // If path is just /, make it empty for dashboard
        if (pathAfterLocale === '/') {
            pathAfterLocale = '/dashboard'
        }

        // Build new URL
        let newPath: string
        if (nextLocale === DEFAULT_LOCALE) {
            // German (default) - no locale in URL
            newPath = `/${business_slug}${pathAfterLocale}`
        } else {
            // Other languages - include locale in URL
            newPath = `/${business_slug}/${nextLocale}${pathAfterLocale}`
        }

        // Update i18n language
        i18n.changeLanguage(nextLocale)

        // Navigate to new URL
        navigate(newPath)
    }

    return (
        <button
            onClick={handleSwitch}
            className="h-7 px-2 border border-gray-200 dark:border-border rounded-md text-xs text-gray-700 dark:text-foreground bg-white dark:bg-card hover:bg-gray-50 dark:hover:bg-muted/50 flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            title={nextLocale === 'de' ? "Zu Deutsch wechseln" : "Switch to English"}
        >
            <NextFlag />
            <span className="text-[11px] font-semibold uppercase">{nextLocale}</span>
        </button>
    )
}
