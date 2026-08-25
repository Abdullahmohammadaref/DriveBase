import { useState, useEffect } from "react"
import { Link, Outlet } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Moon, Sun, Car, ZoomIn, ZoomOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SUPPORTED_LOCALES, LOCALE_CONFIG, DEFAULT_LOCALE, type SupportedLocale } from "@/lib/i18n"

// SVG Flag components matching the legacy design
const GermanFlag = () => (
    <svg viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5">
        <path fill="#FFCD05" d="M0 27a4 4 0 0 0 4 4h28a4 4 0 0 0 4-4v-4H0v4z" />
        <path fill="#ED1F24" d="M0 14h36v9H0z" />
        <path fill="#141414" d="M32 5H4a4 4 0 0 0-4 4v5h36V9a4 4 0 0 0-4-4z" />
    </svg>
)

const EnglishFlag = () => (
    <svg viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5">
        <path fill="#00247D" d="M0 9.059V13h5.628zM4.664 31H13v-5.837zM23 25.164V31h8.335zM0 23v3.941L5.63 23zM31.337 5H23v5.837zM36 26.942V23h-5.631zM36 13V9.059L30.371 13zM13 5H4.664L13 10.837z" />
        <path fill="#CF1B2B" d="M25.14 23l9.712 6.801a3.977 3.977 0 0 0 .99-1.749L28.627 23H25.14zM13 23h-2.141l-9.711 6.8c.521.53 1.189.909 1.938 1.085L13 23.943V23zm10-10h2.141l9.711-6.8a3.988 3.988 0 0 0-1.937-1.085L23 12.057V13zm-12.141 0L1.148 6.2a3.994 3.994 0 0 0-.991 1.749L7.372 13h3.487z" />
        <path fill="#EEE" d="M36 21H21v10h2v-5.836L31.335 31H32a3.99 3.99 0 0 0 2.852-1.199L25.14 23h3.487l7.215 5.052c.093-.337.158-.686.158-1.052v-.058L30.369 23H36v-2zM0 21v2h5.63L0 26.941V27c0 1.091.439 2.078 1.148 2.8l9.711-6.8H13v.943l-9.914 6.941c.294.07.598.116.914.116h.664L13 25.163V31h2V21H0zM36 9a3.983 3.983 0 0 0-1.148-2.8L25.141 13H23v-.943l9.915-6.942A4.001 4.001 0 0 0 32 5h-.663L23 10.837V5h-2v10h15v-2h-5.629L36 9.059V9zM13 5v5.837L4.664 5H4a3.985 3.985 0 0 0-2.852 1.2l9.711 6.8H7.372L.157 7.949A3.968 3.968 0 0 0 0 9v.059L5.628 13H0v2h15V5h-2z" />
        <path fill="#CF1B2B" d="M21 15V5h-6v10H0v6h15v10h6V21h15v-6z" />
    </svg>
)

const TurkishFlag = () => (
    <svg viewBox="-10 0 56 35" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5">
        <path fill="#E30917" d="M36 27a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V9a4 4 0 0 1 4-4h28a4 4 0 0 1 4 4v18z" />
        <path fill="#EEE" d="M16 24a6 6 0 1 1 0-12c1.31 0 2.52.425 3.507 1.138A7.332 7.332 0 0 0 14 10.647 7.353 7.353 0 0 0 6.647 18 7.353 7.353 0 0 0 14 25.354c2.195 0 4.16-.967 5.507-2.492A5.963 5.963 0 0 1 16 24zm3.913-5.77l2.44.562.22 2.493 1.288-2.146 2.44.561-1.644-1.888 1.287-2.147-2.303.98-1.644-1.889.22 2.494z" />
    </svg>
)

const ArabicFlag = () => (
    <svg viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5">
        <path fill="#006C35" d="M36 27a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4v-4h36v4z" />
        <path fill="#FFF" d="M0 14h36v9H0z" />
        <path fill="#006C35" d="M32 5H4a4 4 0 0 0-4 4v5h36V9a4 4 0 0 0-4-4z" />
    </svg>
)

const FLAGS: Record<SupportedLocale, React.ComponentType> = {
    de: GermanFlag,
    en: EnglishFlag,
    tr: TurkishFlag,
    ar: ArabicFlag,
}

// Get the next locale in cycle: DE → TR → EN → AR → DE
const getNextLocale = (current: SupportedLocale): SupportedLocale => {
    const order: SupportedLocale[] = ['de', 'tr', 'en', 'ar']
    const currentIndex = order.indexOf(current)
    return order[(currentIndex + 1) % order.length]
}

/**
 * Auth layout with header controls visible on all auth pages
 * Includes: Logo, Dark/Light mode toggle, Language selector
 */
export function AuthLayout() {
    const [darkMode, setDarkMode] = useState(false)
    const [uiScale, setUiScale] = useState<number>(0.7)
    const { i18n, t } = useTranslation()

    const currentLocale = (SUPPORTED_LOCALES.includes(i18n.language as SupportedLocale))
        ? i18n.language as SupportedLocale
        : DEFAULT_LOCALE

    const nextLocale = getNextLocale(currentLocale)
    const NextFlag = FLAGS[nextLocale]

    // Initialize states from localStorage
    useEffect(() => {
        const stored = localStorage.getItem("theme")
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
        const isDark = stored === "dark" || (!stored && prefersDark)
        setDarkMode(isDark)
        document.documentElement.classList.toggle("dark", isDark)

        // Initialize UI scale
        const storedScale = localStorage.getItem("ui-scale")
        const scale = storedScale ? parseFloat(storedScale) : 0.7
        setUiScale(scale)
        ;(document.documentElement.style as any).zoom = ""
        document.documentElement.style.fontSize = `${16 * scale}px`
    }, [])

    // Toggle dark mode
    const toggleDarkMode = () => {
        const newDarkMode = !darkMode
        setDarkMode(newDarkMode)
        document.documentElement.classList.toggle("dark", newDarkMode)
        localStorage.setItem("theme", newDarkMode ? "dark" : "light")
    }

    const handleLanguageSwitch = () => {
        i18n.changeLanguage(nextLocale)
        // Update document direction for RTL languages (Arabic)
        document.documentElement.dir = nextLocale === 'ar' ? 'rtl' : 'ltr'
        document.documentElement.lang = nextLocale
    }

    const handleZoomIn = () => {
        const newScale = Math.min(Math.round((uiScale + 0.1) * 10) / 10, 3.0)
        setUiScale(newScale)
        ;(document.documentElement.style as any).zoom = ""
        document.documentElement.style.fontSize = `${16 * newScale}px`
        localStorage.setItem("ui-scale", newScale.toString())
    }

    const handleZoomOut = () => {
        const newScale = Math.max(Math.round((uiScale - 0.1) * 10) / 10, 0.2)
        setUiScale(newScale)
        ;(document.documentElement.style as any).zoom = ""
        document.documentElement.style.fontSize = `${16 * newScale}px`
        localStorage.setItem("ui-scale", newScale.toString())
    }

    return (
        <div className="min-h-screen bg-[#F8F9FA] dark:bg-background text-foreground">
            {/* Header */}
            <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3.5 bg-[#F8F9FA]/90 dark:bg-background/80 backdrop-blur-sm border-b border-gray-200 dark:border-border">
                {/* Logo */}
                <Link to="/login" className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-xs">
                        <Car className="h-5 w-5" />
                    </div>
                    <span className="text-lg font-bold text-gray-900 dark:text-foreground">ACAR</span>
                </Link>

                {/* Right Controls */}
                <div className="flex items-center gap-2">
                    {/* UI Scale Controls */}
                    <div className="flex items-center mx-1 border border-gray-200 dark:border-border rounded-lg overflow-hidden bg-white dark:bg-background">
                        <button
                            onClick={handleZoomOut}
                            className="flex h-8 w-8 items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-accent dark:text-muted-foreground transition-colors"
                            title="Zoom Out"
                        >
                            <ZoomOut className="h-3.5 w-3.5" />
                        </button>
                        <div className="h-3.5 w-[1px] bg-gray-200 dark:bg-border" />
                        <span
                            className="px-2 text-xs font-semibold text-gray-700 dark:text-foreground select-none min-w-[38px] text-center"
                            title={`Current Zoom: ${Math.round(uiScale * 100)}%`}
                        >
                            {Math.round(uiScale * 100)}%
                        </span>
                        <div className="h-3.5 w-[1px] bg-gray-200 dark:bg-border" />
                        <button
                            onClick={handleZoomIn}
                            className="flex h-8 w-8 items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-accent dark:text-muted-foreground transition-colors"
                            title="Zoom In"
                        >
                            <ZoomIn className="h-3.5 w-3.5" />
                        </button>
                    </div>

                    {/* Language Switcher - Flag button matching legacy design */}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleLanguageSwitch}
                        title={`Switch to ${LOCALE_CONFIG[nextLocale].name}`}
                        className="flex items-center justify-center h-8 w-8"
                    >
                        <NextFlag />
                    </Button>

                    {/* Theme Toggle */}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleDarkMode}
                        title={darkMode ? t('common.switchToLight') : t('common.switchToDark')}
                        className="h-8 w-8"
                    >
                        {darkMode ? (
                            <Sun className="h-4 w-4" />
                        ) : (
                            <Moon className="h-4 w-4" />
                        )}
                    </Button>
                </div>
            </header>

            {/* Content - centered with proper padding */}
            <main className="flex min-h-screen items-center justify-center pt-20 pb-16 px-4">
                <Outlet />
            </main>

            {/* Footer */}
            <footer className="fixed bottom-0 left-0 right-0 py-3 text-center text-xs text-gray-500 dark:text-muted-foreground bg-[#F8F9FA]/90 dark:bg-background/80 backdrop-blur-sm border-t border-gray-200 dark:border-border">
                © {new Date().getFullYear()} ACAR Vehicle Management
            </footer>
        </div>
    )
}
