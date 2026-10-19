import { Navigate, Outlet, useParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useAuth } from "@/lib/auth"
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type SupportedLocale } from "@/lib/i18n"

/**
 * Helper to construct the dashboard route respecting current locale
 */
export function getDashboardPath(businessSlug: string, locale?: string): string {
    const currentLocale = (locale && (SUPPORTED_LOCALES as readonly string[]).includes(locale))
        ? (locale as SupportedLocale)
        : DEFAULT_LOCALE
    return currentLocale === DEFAULT_LOCALE
        ? `/${businessSlug}/dashboard`
        : `/${businessSlug}/${currentLocale}/dashboard`
}

/**
 * Protected route wrapper that:
 * 1. Checks if user is authenticated
 * 2. Validates business_slug matches user's business
 * 3. Redirects to login if not authenticated
 * 4. Handles edge case where user has no business association
 */
export function ProtectedRoute() {
    const { isAuthenticated, isLoading, user } = useAuth()
    const { business_slug, locale } = useParams<{ business_slug: string; locale?: string }>()

    // Show loading state while checking auth
    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
                    <p className="text-muted-foreground">Loading...</p>
                </div>
            </div>
        )
    }

    // Not authenticated - redirect to login
    if (!isAuthenticated) {
        return <Navigate to="/login" replace />
    }

    // User has no business association - redirect to login with error
    if (user && !user.business_slug) {
        console.error("User has no business association. Redirecting to login.")
        return <Navigate to="/login" replace />
    }

    // Validate business slug matches user's business
    if (user && business_slug && user.business_slug) {
        const userSlug = user.business_slug.toLowerCase()
        const urlSlug = business_slug.toLowerCase()

        if (userSlug !== urlSlug) {
            // Wrong business - redirect to correct one
            const target = locale ? `/${userSlug}/${locale}/dashboard` : `/${userSlug}/dashboard`
            return <Navigate to={target} replace />
        }
    }

    // Authenticated and valid - render children
    return <Outlet />
}

/**
 * Redirect root path to dashboard if authenticated, otherwise to login
 */
export function RootRedirect() {
    const { isAuthenticated, isLoading, user } = useAuth()
    const { i18n } = useTranslation()

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    // If authenticated AND has a valid business, redirect to dashboard
    if (isAuthenticated && user && user.business_slug) {
        return <Navigate to={getDashboardPath(user.business_slug, i18n.language)} replace />
    }

    // Not authenticated or no business - redirect to login
    return <Navigate to="/login" replace />
}

/**
 * Route wrapper for public auth pages (login, register, recovery, etc.)
 * Redirects authenticated users back to their dashboard.
 */
export function PublicOnlyRoute() {
    const { isAuthenticated, isLoading, user } = useAuth()
    const { i18n } = useTranslation()

    // Show spinner inside auth container while checking authentication
    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    // If already authenticated with business, redirect to dashboard
    if (isAuthenticated && user && user.business_slug) {
        return <Navigate to={getDashboardPath(user.business_slug, i18n.language)} replace />
    }

    // Unauthenticated guest - render auth page
    return <Outlet />
}
