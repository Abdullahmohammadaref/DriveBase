import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { UserCircle, Users, ArrowRight } from "lucide-react"

/**
 * Login Landing Page - Selection between Manager and Employee login
 * Route: /login
 */
export function LoginPage() {
    const { t } = useTranslation()

    return (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-sm max-w-md w-full p-8 mx-auto space-y-6">
            {/* Title */}
            <div className="text-center">
                <h1 className="text-xl font-bold text-gray-900 dark:text-foreground">{t('auth.welcomeBack')}</h1>
                <p className="mt-1 text-xs text-gray-500 dark:text-muted-foreground">
                    {t('auth.signInToManage')}
                </p>
            </div>

            {/* Login Options */}
            <div className="space-y-3">
                {/* Manager Login */}
                <Link
                    to="/login/manager"
                    className="bg-[#F8F9FA] dark:bg-muted/40 border border-gray-200 dark:border-border hover:border-gray-300 hover:bg-white dark:hover:bg-muted/60 p-4 rounded-lg flex items-center justify-between text-left transition-all group"
                >
                    <div className="flex items-center gap-3.5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                            <UserCircle className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-gray-900 dark:text-foreground">{t('auth.managerLogin')}</h2>
                            <p className="text-xs text-gray-500 dark:text-muted-foreground">
                                {t('auth.fullAccess')}
                            </p>
                        </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
                </Link>

                {/* Employee Login */}
                <Link
                    to="/login/employee"
                    className="bg-[#F8F9FA] dark:bg-muted/40 border border-gray-200 dark:border-border hover:border-gray-300 hover:bg-white dark:hover:bg-muted/60 p-4 rounded-lg flex items-center justify-between text-left transition-all group"
                >
                    <div className="flex items-center gap-3.5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-muted text-gray-600 dark:text-muted-foreground">
                            <Users className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-gray-900 dark:text-foreground">{t('auth.employeeLogin')}</h2>
                            <p className="text-xs text-gray-500 dark:text-muted-foreground">
                                {t('auth.loginLinkSent')}
                            </p>
                        </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
                </Link>
            </div>

            {/* Help & Register Links */}
            <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-border text-center">
                <p className="text-xs text-gray-500 dark:text-muted-foreground">
                    {t('auth.needHelp')}{" "}
                    <a href="mailto:support@acar.de" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                        {t('auth.contactSupport')}
                    </a>
                </p>
                <p className="text-xs text-gray-500 dark:text-muted-foreground">
                    {t("auth.dontHaveAccount", "Don't have an account?")}{" "}
                    <Link to="/register" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                        {t("auth.registerAsManager", "Register as Manager")}
                    </Link>
                </p>
            </div>
        </div>
    )
}
