import { Component, type ErrorInfo, type ReactNode } from "react"
import { AlertTriangle, Globe, Download, RotateCcw } from "lucide-react"
import { isTauri, getDesktopDownloadUrl, getWebAppUrl, openExternal } from "@/lib/desktop/platform"

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class DesktopErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[DesktopErrorBoundary] Uncaught application error:", error, errorInfo)
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleOpenBrowser = () => {
    openExternal(getWebAppUrl())
  }

  private handleDownloadApp = () => {
    openExternal(getDesktopDownloadUrl())
  }

  public render() {
    if (this.state.hasError) {
      const inDesktop = isTauri()

      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-white dark:bg-card border border-border rounded-xl shadow-lg p-6 text-center space-y-6">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-8 w-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">
                {inDesktop ? "Desktop Connection / Version Issue" : "An Unexpected Error Occurred"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {inDesktop
                  ? "DriveBase desktop encountered a system or network error. You can continue working immediately in your web browser or grab the latest update."
                  : "An unexpected error occurred while loading this view. You can reload the page or contact support if the issue persists."}
              </p>
            </div>

            {this.state.error && (
              <div className="bg-slate-100 dark:bg-muted p-3 rounded-md text-left overflow-auto max-h-28 text-xs font-mono text-slate-700 dark:text-slate-300">
                {this.state.error.message || "Unknown error"}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-colors"
              >
                <RotateCcw className="h-4 w-4" />
                Reload Page
              </button>

              {inDesktop && (
                <>
                  <button
                    type="button"
                    onClick={this.handleOpenBrowser}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors"
                  >
                    <Globe className="h-4 w-4" />
                    Open in Web Browser
                  </button>

                  <button
                    type="button"
                    onClick={this.handleDownloadApp}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    Download Latest App
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
