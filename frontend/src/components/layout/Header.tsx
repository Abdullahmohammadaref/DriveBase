import { useState, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { Moon, Sun, User, LogOut, ChevronDown, Building, Settings, ZoomIn, ZoomOut, UserCog, Download } from "lucide-react"
import { NotificationsDropdown } from "@/components/layout/NotificationsDropdown"
import { useAuth } from "@/lib/auth"
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher"
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type SupportedLocale } from "@/lib/i18n"
import { isTauri, getDesktopDownloadUrl } from "@/lib/desktop/platform"

interface HeaderProps {
    sidebarCollapsed: boolean
}

export function Header({ sidebarCollapsed }: HeaderProps) {
    const { user, logout } = useAuth()
    const navigate = useNavigate()
    const { t } = useTranslation()
    const { business_slug, locale } = useParams<{ business_slug: string; locale?: string }>()
    const [darkMode, setDarkMode] = useState(false)
    const [userMenuOpen, setUserMenuOpen] = useState(false)
    const [uiScale, setUiScale] = useState<number>(0.9)

    // Determine current locale
    const currentLocale = (locale && (SUPPORTED_LOCALES as readonly string[]).includes(locale))
        ? locale as SupportedLocale
        : DEFAULT_LOCALE

    // Build href with locale
    const buildHref = (path: string) => {
        if (currentLocale === DEFAULT_LOCALE) {
            return `/${business_slug}/${path}`
        }
        return `/${business_slug}/${currentLocale}/${path}`
    }

    // Initialize theme (Forced Light Mode per user requirement)
    useEffect(() => {
        /* =========================================================================
           DEACTIVATED FEATURE: Dark Mode System Preference & LocalStorage Check
           WARNING: DO NOT DELETE THIS COMMENTED CODE!
           The user requested light mode by default with no switching to dark mode.
           To restore dark mode in the future:
           1. Uncomment the lines below (const stored, prefersDark, isDark, etc.)
           2. Uncomment the dark mode toggle button in the JSX below (around line 145)
           3. Remove the classList.remove("dark") override
           ========================================================================= */
        /*
        const stored = localStorage.getItem("theme")
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
        const isDark = stored === "dark" || (!stored && prefersDark)
        setDarkMode(isDark)
        document.documentElement.classList.toggle("dark", isDark)
        */

        // Enforce light mode strictly:
        setDarkMode(false)
        document.documentElement.classList.remove("dark")
        localStorage.setItem("theme", "light")

        // Initialize UI scale (default 90%)
        const storedScale = localStorage.getItem("ui-scale")
        const scale = storedScale ? parseFloat(storedScale) : 0.9
        setUiScale(scale)
        ;(document.documentElement.style as any).zoom = ""
        document.documentElement.style.fontSize = `${16 * scale}px`
    }, [])

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

    // Toggle dark mode
    const toggleDarkMode = () => {
        const newDarkMode = !darkMode
        setDarkMode(newDarkMode)
        document.documentElement.classList.toggle("dark", newDarkMode)
        localStorage.setItem("theme", newDarkMode ? "dark" : "light")
    }

    // Keep references to prevent TypeScript unused variable errors while dark mode button is deactivated
    void darkMode; void toggleDarkMode; void Sun; void Moon;

    const handleLogout = () => {
        setUserMenuOpen(false)
        logout()
    }

    const handleNavigate = (path: string) => {
        setUserMenuOpen(false)
        navigate(buildHref(path))
    }

    return (
        <header
            className={cn(
                "fixed right-0 top-0 z-30 flex h-11 items-center justify-between border-b border-gray-200 dark:border-border bg-white dark:bg-card px-4 transition-all duration-300",
                sidebarCollapsed ? "left-14" : "left-56"
            )}
        >
            {/* Business Name / Page Title */}
            <div className="flex items-center gap-2">
                <Building className="h-3.5 w-3.5 text-gray-400 dark:text-muted-foreground" />
                <h1 className="text-xs font-semibold text-gray-800 dark:text-foreground">
                    {user?.business_name || t('common.vehicleManagement')}
                </h1>
            </div>

            {/* Right side actions */}
            <div className="flex items-center gap-1.5">
                {/* Notifications */}
                <NotificationsDropdown />

                {/* UI Scale Controls */}
                <div className="flex items-center h-7 px-2 border border-gray-200 dark:border-border rounded-md text-xs text-gray-700 dark:text-foreground bg-[#F8F9FA] dark:bg-muted/30 gap-1.5 shadow-xs">
                    <button
                        onClick={handleZoomOut}
                        className="text-gray-500 hover:text-gray-900 dark:text-muted-foreground dark:hover:text-foreground flex items-center justify-center transition-colors"
                        title="Zoom Out"
                    >
                        <ZoomOut className="h-3.5 w-3.5" />
                    </button>
                    <div className="h-3 w-[1px] bg-gray-200 dark:bg-border" />
                    <span
                        className="text-[11px] font-semibold text-gray-700 dark:text-foreground select-none min-w-[32px] text-center"
                        title={`Current Zoom: ${Math.round(uiScale * 100)}%`}
                    >
                        {Math.round(uiScale * 100)}%
                    </span>
                    <div className="h-3 w-[1px] bg-gray-200 dark:bg-border" />
                    <button
                        onClick={handleZoomIn}
                        className="text-gray-500 hover:text-gray-900 dark:text-muted-foreground dark:hover:text-foreground flex items-center justify-center transition-colors"
                        title="Zoom In"
                    >
                        <ZoomIn className="h-3.5 w-3.5" />
                    </button>
                </div>

                {/* 
                  ============================================================================
                  DEACTIVATED FEATURE: Dark Mode Toggle Button
                  WARNING: DO NOT DELETE THIS COMMENTED CODE!
                  This button is temporarily deactivated per user request and will be reactivated later.
                  See deactivated_features_docs.md for details and reactivation instructions.
                  ============================================================================
                */}
                {/*
                <button
                    onClick={toggleDarkMode}
                    className="h-7 px-2 border border-gray-200 dark:border-border rounded-md text-xs text-gray-700 dark:text-foreground bg-white dark:bg-card hover:bg-gray-50 dark:hover:bg-muted/50 flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                    title={darkMode ? t('common.switchToLight') : t('common.switchToDark')}
                >
                    {darkMode ? (
                        <Sun className="h-3.5 w-3.5 text-amber-500" />
                    ) : (
                        <Moon className="h-3.5 w-3.5 text-gray-600 dark:text-muted-foreground" />
                    )}
                </button>
                */}

                {/* Language Switcher */}
                <LanguageSwitcher />

                {/* User Menu */}
                <div className="relative">
                    <button
                        onClick={() => setUserMenuOpen(!userMenuOpen)}
                        className="h-7 px-2.5 border border-gray-200 dark:border-border rounded-md text-xs font-medium text-gray-700 dark:text-foreground bg-white dark:bg-card hover:bg-gray-50 dark:hover:bg-muted/50 flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
                    >
                        <div className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shrink-0">
                            <User className="h-3 w-3" />
                        </div>
                        <span className="hidden text-xs font-medium text-gray-900 dark:text-foreground md:inline-block max-w-[120px] truncate">
                            {user?.username || "User"}
                        </span>
                        <ChevronDown className="h-3.5 w-3.5 text-gray-400 dark:text-muted-foreground shrink-0" />
                    </button>

                    {/* Dropdown Menu */}
                    {userMenuOpen && (
                        <>
                            <div
                                className="fixed inset-0 z-40"
                                onClick={() => setUserMenuOpen(false)}
                            />
                            <div className="absolute right-0 top-full z-50 mt-1.5 w-64 rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card p-1.5 shadow-xl overflow-hidden">
                                <div className="px-3.5 py-3 border-b border-gray-100 dark:border-border mb-1">
                                    <p className="text-sm font-semibold text-gray-900 dark:text-foreground truncate leading-tight">
                                        {user?.email}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-muted-foreground truncate mt-1">
                                        {user?.business_name}
                                    </p>
                                </div>

                                {user?.is_manager && (
                                    <div className="border-b border-gray-100 dark:border-border mb-1 pb-1 space-y-0.5">
                                        <button
                                            onClick={() => handleNavigate("business-settings")}
                                            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-foreground hover:bg-gray-100/80 dark:hover:bg-muted/50 hover:text-gray-900 transition-colors cursor-pointer"
                                        >
                                            <Settings className="h-4 w-4 text-gray-500 dark:text-muted-foreground shrink-0" />
                                            <span>{t('user.businessSettings')}</span>
                                        </button>
                                        <button
                                            onClick={() => handleNavigate("user-settings")}
                                            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-foreground hover:bg-gray-100/80 dark:hover:bg-muted/50 hover:text-gray-900 transition-colors cursor-pointer"
                                        >
                                            <UserCog className="h-4 w-4 text-gray-500 dark:text-muted-foreground shrink-0" />
                                            <span>{t('user.userSettings', 'User Settings')}</span>
                                        </button>
                                    </div>
                                )}

                                {!isTauri() && (
                                    <div className="border-b border-gray-100 dark:border-border mb-1 pb-1">
                                        <a
                                            href={getDesktopDownloadUrl()}
                                            download="DriveBase_Setup.exe"
                                            onClick={() => setUserMenuOpen(false)}
                                            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors cursor-pointer"
                                        >
                                            <Download className="h-4 w-4 text-blue-500 shrink-0" />
                                            <span>{t('user.downloadDesktopApp', 'Download Desktop App')}</span>
                                        </a>
                                    </div>
                                )}

                                <button
                                    onClick={handleLogout}
                                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                                >
                                    <LogOut className="h-4 w-4 shrink-0" />
                                    <span>{t('user.logout')}</span>
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </header>
    )
}
