import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { UserCircle, Users, ArrowRight, Download } from "lucide-react"
import { isTauri, getDesktopDownloadUrl } from "@/lib/desktop/platform"

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
                <h1 className="text-xl font-bold text-gray-900 dark:text-foreground">{t('auth.selectLoginType', 'Select Login Type')}</h1>
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
                        </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
                </Link>
            </div>

            {/* Desktop App Download (Only visible on web) */}
            {!isTauri() && (
                <div className="pt-1">
                    <a
                        href={getDesktopDownloadUrl()}
                        download="DriveBase_Setup.exe"
                        className="w-full py-2.5 px-3 rounded-lg border border-dashed border-gray-300 dark:border-border hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center justify-center gap-2 transition-all group"
                    >
                        <Download className="h-4 w-4 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform" />
                        <span>{t("auth.downloadDesktopApp", "Download DriveBase for Windows (Desktop App)")}</span>
                    </a>
                </div>
            )}

            {/* Help & Register Links */}
            <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-border text-center">
                <p className="text-xs text-gray-500 dark:text-muted-foreground">
                    {t('auth.needHelp')}{" "}
                    <a href="mailto:support@drivebase.de" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
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
