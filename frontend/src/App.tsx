import { BrowserRouter, Routes, Route, Navigate, Link, useParams } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { AuthProvider, useAuth } from "@/lib/auth"
import { ProtectedRoute, PublicOnlyRoute, RootRedirect } from "@/components/layout/ProtectedRoute"
import { AuthLayout } from "@/components/auth/AuthLayout"
import { AppLayout } from "@/components/layout/AppLayout"
import { LoginPage } from "@/pages/auth/LoginPage"
import { EmployeeLoginPage } from "@/pages/auth/EmployeeLoginPage"
import { ManagerLoginPage } from "@/pages/auth/ManagerLoginPage"
import { ForgotPasswordPage, ForgotEmailPage } from "@/pages/auth/RecoveryPages"
import { CheckEmailPage } from "@/pages/auth/CheckEmailPage"
import { ApprovalPage, VerifyPage } from "@/pages/auth/ApprovalPages"
import { RegisterPage } from "@/pages/auth/RegisterPage"
import { DashboardPage } from "@/pages/DashboardPage"
import { VehiclesPage } from "@/pages/VehiclesPage"
import { VehicleFormPage } from "@/pages/VehicleFormPage"
import { TransactionsPage } from "@/pages/TransactionsPage"
import { AddTransactionPage } from "@/pages/AddTransactionPage"
import { EditTransactionPage } from "@/pages/EditTransactionPage"
import BusinessSettingsPage from "@/pages/BusinessSettingsPage"
import UserSettingsPage from "@/pages/UserSettingsPage"
import ChoicesManagementPage from "@/pages/ChoicesManagementPage"
import { LegalEntitiesPage } from "@/pages/LegalEntitiesPage"
import { ActivityLogsPage } from "@/pages/ActivityLogsPage"
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type SupportedLocale } from "@/lib/i18n"
import { ScrollToTop } from "@/components/ScrollToTop"
import { DesktopErrorBoundary } from "@/components/desktop/DesktopErrorBoundary"
import { DesktopWindowGuard } from "@/components/desktop/DesktopWindowGuard"

// Import i18n configuration (must be imported to initialize)
import "@/lib/i18n"

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
})

// Wrapper component that sets the locale based on URL
function LocaleWrapper({ children }: { children: React.ReactNode }) {
  const { locale } = useParams<{ locale?: string }>()
  const { i18n } = useTranslation()

  useEffect(() => {
    // Determine locale from URL parameter
    const detectedLocale = (locale && (SUPPORTED_LOCALES as readonly string[]).includes(locale))
      ? locale as SupportedLocale
      : DEFAULT_LOCALE

    // Only change language if different
    if (i18n.language !== detectedLocale) {
      i18n.changeLanguage(detectedLocale)
    }

    // Update document direction for RTL languages (Arabic)
    document.documentElement.dir = (detectedLocale as string) === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = detectedLocale
  }, [locale, i18n])

  return <>{children}</>
}


function AppRoutes() {
  return (
    <Routes>
      {/* Public auth routes with AuthLayout */}
      <Route element={<AuthLayout />}>
        {/* Guest-only routes: redirect authenticated users to dashboard */}
        <Route element={<PublicOnlyRoute />}>
          {/* /login -> Landing (Manager vs Employee selection) */}
          <Route path="/login" element={<LoginPage />} />

          {/* /login/employee -> Employee login form with polling */}
          <Route path="/login/employee" element={<EmployeeLoginPage />} />

          {/* /login/manager -> Manager login form */}
          <Route path="/login/manager" element={<ManagerLoginPage />} />

          {/* /register -> Manager registration */}
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        {/* Recovery, status & action routes: accessible even if logged in (e.g. from User Settings) */}
        {/* /login/forgot-password -> Password recovery */}
        <Route path="/login/forgot-password" element={<ForgotPasswordPage />} />

        {/* /login/forgot-email -> Email change flow */}
        <Route path="/login/forgot-email" element={<ForgotEmailPage />} />

        {/* /login/check-email -> Success/feedback page */}
        <Route path="/login/check-email" element={<CheckEmailPage />} />

        {/* /login/approve/:token -> Manager approves employee login */}
        <Route path="/login/approve/:token" element={<ApprovalPage />} />

        {/* /login/verify/:uid/:token -> Manager magic link verification */}
        <Route path="/login/verify/:uid/:token" element={<VerifyPage />} />
      </Route>

      {/* Protected routes - with explicit locale */}
      <Route path="/:business_slug/:locale/*" element={<ProtectedRoute />}>
        <Route element={<LocaleWrapper><AppLayout /></LocaleWrapper>}>
          {/* Dashboard */}
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />

          {/* Vehicles */}
          <Route path="vehicles" element={<VehiclesPage />} />
          <Route path="vehicles/new" element={<VehicleFormPage />} />
          <Route path="vehicles/:id/edit" element={<VehicleFormPage />} />

          {/* Transactions */}
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="transactions/new" element={<AddTransactionPage />} />
          <Route path="transactions/:id/edit" element={<EditTransactionPage />} />

          {/* Legal Entities */}
          <Route path="legal-entities" element={<LegalEntitiesPage />} />
          <Route path="settings" element={<PlaceholderPage title="Settings" />} />

          {/* Business Settings */}
          <Route path="business-settings" element={<BusinessSettingsPage />} />

          {/* User Settings (manager only) */}
          <Route path="user-settings" element={<UserSettingsPage />} />

          {/* Choices Management */}
          <Route path="choices" element={<ChoicesManagementPage />} />

          {/* Activity Logs */}
          <Route path="activity-logs" element={<ActivityLogsPage />} />
        </Route>
      </Route>

      {/* Protected routes - default locale (German, no locale in URL) */}
      <Route path="/:business_slug/*" element={<ProtectedRoute />}>
        <Route element={<LocaleWrapper><AppLayout /></LocaleWrapper>}>
          {/* Dashboard */}
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />

          {/* Vehicles */}
          <Route path="vehicles" element={<VehiclesPage />} />
          <Route path="vehicles/new" element={<VehicleFormPage />} />
          <Route path="vehicles/:id/edit" element={<VehicleFormPage />} />

          {/* Transactions */}
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="transactions/new" element={<AddTransactionPage />} />
          <Route path="transactions/:id/edit" element={<EditTransactionPage />} />

          {/* Legal Entities */}
          <Route path="legal-entities" element={<LegalEntitiesPage />} />
          <Route path="settings" element={<PlaceholderPage title="Settings" />} />

          {/* Business Settings */}
          <Route path="business-settings" element={<BusinessSettingsPage />} />

          {/* User Settings (manager only) */}
          <Route path="user-settings" element={<UserSettingsPage />} />

          {/* Choices Management */}
          <Route path="choices" element={<ChoicesManagementPage />} />

          {/* Activity Logs */}
          <Route path="activity-logs" element={<ActivityLogsPage />} />
        </Route>
      </Route>

      {/* Root redirect */}
      <Route path="/" element={<RootRedirect />} />

      {/* Catch-all 404 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

function PlaceholderPage({ title }: { title: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground mb-2">{title}</h1>
        <p className="text-muted-foreground">{t('common.comingSoon')}</p>
      </div>
    </div>
  )
}

function NotFoundPage() {
  const { t } = useTranslation()
  const { isAuthenticated, user } = useAuth()
  const homePath = isAuthenticated && user?.business_slug
    ? `/${user.business_slug}/dashboard`
    : "/login"

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-foreground mb-2">404</h1>
        <p className="text-muted-foreground mb-4">{t('common.pageNotFound')}</p>
        <Link to={homePath} className="text-primary hover:underline">
          {isAuthenticated ? t('nav.dashboard', 'Go to Dashboard') : t('common.goToLogin', 'Go to Login')}
        </Link>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <DesktopErrorBoundary>
      <DesktopWindowGuard />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ScrollToTop />
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </DesktopErrorBoundary>
  )
}
