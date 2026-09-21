import { useState } from "react"
import { Link, useLocation, useSearchParams, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import {
    Car,
    LayoutDashboard,
    Receipt,
    Users,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Circle,
    Settings,
} from "lucide-react"
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type SupportedLocale } from "@/lib/i18n"
import { useAuth } from "@/lib/auth"

interface NavItem {
    titleKey: string
    path: string
    icon: React.ComponentType<{ className?: string }>
    children?: { titleKey: string; path: string; status?: string }[]
}

const navItems: NavItem[] = [
    {
        titleKey: "nav.dashboard",
        path: "dashboard",
        icon: LayoutDashboard,
    },
    {
        titleKey: "nav.vehicles",
        path: "vehicles",
        icon: Car,
        children: [
            { titleKey: "nav.allVehicles", path: "vehicles" },
            { titleKey: "nav.purchased", path: "vehicles?status=purchased", status: "purchased" },
            { titleKey: "nav.readyForSale", path: "vehicles?status=ready_for_sale", status: "ready_for_sale" },
            { titleKey: "nav.reserved", path: "vehicles?status=reserved", status: "reserved" },
            { titleKey: "nav.sold", path: "vehicles?status=sold", status: "sold" },
            { titleKey: "nav.inactive", path: "vehicles?status=inactive", status: "inactive" },
        ],
    },
    {
        titleKey: "nav.transactions",
        path: "transactions",
        icon: Receipt,
        children: [
            { titleKey: "nav.all_transactions", path: "transactions" },
            { titleKey: "nav.confirmed", path: "transactions?status=confirmed", status: "confirmed" },
            { titleKey: "nav.in_review", path: "transactions?status=review_required", status: "review_required" },
            { titleKey: "nav.inactive", path: "transactions?status=inactive", status: "inactive" },
        ],
    },
    {
        titleKey: "nav.legalEntities",
        path: "legal-entities",
        icon: Users,
        children: [
            { titleKey: "nav.all_entities", path: "legal-entities" },
            { titleKey: "nav.private", path: "legal-entities?type=individual", status: "individual" },
            { titleKey: "nav.companies", path: "legal-entities?type=company", status: "company" },
            { titleKey: "nav.inactive_entities", path: "legal-entities?status=inactive", status: "inactive_entity" },
        ],
    },
    {
        titleKey: "nav.choices_management",
        path: "choices",
        icon: Settings,
    },
]

const statusColors: Record<string, string> = {
    purchased: "text-green-500",
    ready_for_sale: "text-orange-500",
    reserved: "text-blue-500",
    sold: "text-red-500",
    inactive: "text-gray-500",
    confirmed: "text-green-500",
    review_required: "text-red-500",
    individual: "text-blue-500",
    company: "text-purple-500",
    inactive_entity: "text-zinc-400",
}

interface SidebarProps {
    collapsed: boolean
    onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
    const { user } = useAuth()
    const location = useLocation()
    const [searchParams] = useSearchParams()
    const { business_slug, locale } = useParams<{ business_slug: string; locale?: string }>()
    const { t } = useTranslation()
    const [expandedItems, setExpandedItems] = useState<string[]>(["nav.vehicles"])

    const currentLocale = (locale && (SUPPORTED_LOCALES as readonly string[]).includes(locale))
        ? locale as SupportedLocale
        : DEFAULT_LOCALE

    const buildHref = (path: string) => {
        if (currentLocale === DEFAULT_LOCALE) {
            return `/${business_slug}/${path}`
        }
        return `/${business_slug}/${currentLocale}/${path}`
    }

    const toggleExpanded = (titleKey: string) => {
        setExpandedItems((prev) =>
            prev.includes(titleKey)
                ? prev.filter((t) => t !== titleKey)
                : [...prev, titleKey]
        )
    }

    const isPlainLeftClick = (event: React.MouseEvent<HTMLAnchorElement>) =>
        event.button === 0 && !event.metaKey && !event.altKey && !event.ctrlKey && !event.shiftKey

    const handleParentLinkClick = (event: React.MouseEvent<HTMLAnchorElement>, titleKey: string) => {
        if (!isPlainLeftClick(event)) return
        if (collapsed) {
            event.preventDefault()
            return
        }
        toggleExpanded(titleKey)
    }

    const isActive = (path: string, status?: string) => {
        const [pathBase, pathQuery] = path.split("?")
        const fullPath = buildHref(pathBase)

        if (location.pathname !== fullPath) return false

        if (status) {
            if (path.includes("legal-entities")) {
                if (pathQuery?.includes("type=")) {
                    return searchParams.get("type") === status
                }
                if (pathQuery?.includes("status=") && status === "inactive_entity") {
                    return searchParams.get("status") === "inactive"
                }
            }
            return searchParams.get("status") === status
        }

        if (pathQuery) {
            const itemParams = new URLSearchParams(pathQuery)
            for (const [key, value] of itemParams.entries()) {
                if (searchParams.get(key) !== value) return false
            }
            return true
        }

        const filterKeys = ["status", "type"]
        if (filterKeys.some(key => searchParams.has(key))) {
            return false
        }

        return true
    }

    const filteredNavItems = navItems.filter((item) => {
        if (item.titleKey === "nav.transactions" && user && !user.is_manager && !user.transactions_access) {
            return false
        }
        if (item.titleKey === "nav.choices_management" && user && !user.is_manager) {
            return false
        }
        return true
    })

    return (
        <aside
            className={cn(
                "fixed left-0 top-0 z-40 h-screen border-r border-gray-200 dark:border-border bg-white dark:bg-card transition-all duration-300 flex flex-col justify-between py-2",
                collapsed ? "w-14" : "w-56"
            )}
        >
            <div className="flex flex-col flex-1 min-h-0">
                {/* Logo box */}
                <div className="flex h-11 items-center justify-between border-b border-gray-200 dark:border-border px-3 shrink-0 mb-2">
                    {!collapsed && (
                        <Link to={buildHref("dashboard")} className="flex flex-1 items-center justify-center overflow-hidden">
                            {user?.business_logo ? (
                                <img
                                    src={user.business_logo}
                                    alt={user.business_name || "Logo"}
                                    className="h-7 w-auto max-w-full object-contain"
                                />
                            ) : (
                                <span className="text-sm font-bold text-gray-900 dark:text-foreground truncate text-center w-full">
                                    {user?.business_name || "ACAR"}
                                </span>
                            )}
                        </Link>
                    )}
                    {collapsed && (
                        <div className="mx-auto flex h-7 w-7 items-center justify-center rounded-md bg-blue-600">
                            {user?.business_logo ? (
                                <img
                                    src={user.business_logo}
                                    alt="Logo"
                                    className="h-6 w-6 object-contain rounded-md bg-white"
                                />
                            ) : (
                                <Car className="h-4 w-4 text-white" />
                            )}
                        </div>
                    )}
                </div>

                {/* Navigation items */}
                <nav className="flex-1 flex flex-col gap-0.5 px-2 overflow-y-auto">
                    {filteredNavItems.map((item) => {
                        const Icon = item.icon
                        const hasChildren = item.children && item.children.length > 0
                        const isExpanded = expandedItems.includes(item.titleKey)
                        const isItemActive = isActive(item.path) ||
                            (hasChildren && item.children?.some((child) => isActive(child.path, child.status)))

                        return (
                            <div key={item.path}>
                                {/* Main nav item */}
                                {hasChildren ? (
                                    <Link
                                        to={buildHref(item.children?.[0]?.path ?? item.path)}
                                        onClick={(event) => handleParentLinkClick(event, item.titleKey)}
                                        className={cn(
                                            "flex h-8 w-full items-center gap-2 rounded-md px-2.5 py-1 text-xs transition-colors",
                                            isItemActive
                                                ? "bg-gray-100 dark:bg-muted text-gray-900 dark:text-foreground font-semibold"
                                                : "text-gray-600 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-muted/50 hover:text-gray-900 dark:hover:text-foreground font-medium",
                                            collapsed && "justify-center px-1"
                                        )}
                                        title={collapsed ? t(item.titleKey) : undefined}
                                    >
                                        <Icon className="h-4 w-4 shrink-0" />
                                        {!collapsed && (
                                            <>
                                                <span className="flex-1 text-left truncate">{t(item.titleKey)}</span>
                                                <ChevronDown
                                                    className={cn(
                                                        "h-3.5 w-3.5 transition-transform opacity-60",
                                                        isExpanded && "rotate-180"
                                                    )}
                                                />
                                            </>
                                        )}
                                    </Link>
                                ) : (
                                    <Link
                                        to={buildHref(item.path)}
                                        className={cn(
                                            "flex h-8 items-center gap-2 rounded-md px-2.5 py-1 text-xs transition-colors",
                                            isActive(item.path)
                                                ? "bg-gray-100 dark:bg-muted text-gray-900 dark:text-foreground font-semibold"
                                                : "text-gray-600 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-muted/50 hover:text-gray-900 dark:hover:text-foreground font-medium",
                                            collapsed && "justify-center px-1"
                                        )}
                                        title={collapsed ? t(item.titleKey) : undefined}
                                    >
                                        <Icon className="h-4 w-4 shrink-0" />
                                        {!collapsed && <span className="truncate">{t(item.titleKey)}</span>}
                                    </Link>
                                )}

                                {/* Sub items */}
                                {hasChildren && !collapsed && isExpanded && (
                                    <div className="mt-0.5 space-y-0.5">
                                        {item.children?.map((child) => (
                                            <Link
                                                key={child.path}
                                                to={buildHref(child.path)}
                                                className={cn(
                                                    "flex h-7 items-center gap-1.5 rounded-md pl-6 pr-2 text-[11px] transition-colors",
                                                    isActive(child.path, child.status)
                                                        ? "bg-gray-100 dark:bg-muted text-gray-900 dark:text-foreground font-semibold"
                                                        : "text-gray-500 dark:text-muted-foreground hover:text-gray-800 dark:hover:text-foreground hover:bg-gray-50/80 dark:hover:bg-muted/40 font-medium"
                                                )}
                                            >
                                                {child.status ? (
                                                    <Circle
                                                        className={cn(
                                                            "h-1.5 w-1.5 fill-current shrink-0",
                                                            statusColors[child.status]
                                                        )}
                                                    />
                                                ) : (
                                                    <span className="w-1.5" />
                                                )}
                                                <span className="truncate">{t(child.titleKey)}</span>
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </nav>
            </div>

            {/* Collapse Toggle */}
            <button
                onClick={onToggle}
                className="absolute -right-2.5 top-12 flex h-5 w-5 items-center justify-center rounded-full border border-gray-200 dark:border-border bg-white dark:bg-card text-gray-500 hover:text-gray-900 dark:text-muted-foreground dark:hover:text-foreground shadow-xs hover:bg-gray-50 dark:hover:bg-muted transition-colors"
            >
                {collapsed ? (
                    <ChevronRight className="h-3 w-3" />
                ) : (
                    <ChevronLeft className="h-3 w-3" />
                )}
            </button>
        </aside>
    )
}
