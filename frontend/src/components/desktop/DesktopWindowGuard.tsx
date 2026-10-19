import { useState, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { exit } from "@tauri-apps/api/app"
import { isTauri } from "@/lib/desktop/platform"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"

/**
 * DesktopWindowGuard
 * 
 * Protects the DriveBase Desktop application against accidental closure:
 * 1. When any modal/dialog (such as the PDF viewer or contract wizard) is open,
 *    clicking the Windows titlebar close button (✕) closes ONLY the modal, NOT the application.
 * 2. When on the main screen, asks for confirmation using a themed DriveBase dialog
 *    instead of a native browser confirm popup (eliminating "localhost:5173 says").
 * 3. On confirmation, safely terminates the desktop application process.
 */
export function DesktopWindowGuard() {
  const { t } = useTranslation()
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const isExitingRef = useRef(false)

  useEffect(() => {
    if (!isTauri()) return

    let isMounted = true
    let unlistenFn: (() => void) | undefined

    const setupGuard = async () => {
      try {
        const currentWin = getCurrentWindow()
        const unlisten = await currentWin.onCloseRequested(async (event) => {
          // If already confirmed exit, allow close event to pass through
          if (isExitingRef.current) {
            return
          }

          // Check if any modal or dialog is open in the DOM
          const activeModal = document.querySelector('[data-slot="dialog-content"]')

          if (activeModal) {
            // Intercept window close — do not close DriveBase!
            event.preventDefault()

            // Close the active modal
            window.dispatchEvent(new CustomEvent("drivebase:close-active-modal"))
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
            return
          }

          // If no modal is open (main application view), intercept close and display DriveBase dialog
          event.preventDefault()
          setShowExitConfirm(true)
        })

        if (isMounted) {
          unlistenFn = unlisten
        } else {
          unlisten()
        }
      } catch (err) {
        console.warn("[DesktopWindowGuard] Failed to register close handler:", err)
      }
    }

    setupGuard()

    return () => {
      isMounted = false
      if (unlistenFn) {
        unlistenFn()
      }
    }
  }, [])

  if (!isTauri()) return null

  const handleConfirmExit = async () => {
    isExitingRef.current = true
    try {
      // 1. Try clean app-level exit first
      await exit(0)
    } catch (appExitErr) {
      console.warn("[DesktopWindowGuard] exit(0) failed, trying window destroy:", appExitErr)
      try {
        // 2. Fall back to window destroy
        await getCurrentWindow().destroy()
      } catch (destroyErr) {
        console.warn("[DesktopWindowGuard] destroy() failed, trying window close:", destroyErr)
        try {
          // 3. Fall back to window close
          await getCurrentWindow().close()
        } catch (closeErr) {
          console.error("[DesktopWindowGuard] All exit mechanisms failed:", closeErr)
        }
      }
    }
  }

  return (
    <AlertDialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
      <AlertDialogContent className="max-w-md bg-white border border-slate-200 shadow-xl rounded-xl p-6">
        <AlertDialogHeader className="space-y-2">
          <AlertDialogTitle className="text-lg font-bold text-slate-900 tracking-tight">
            {t("common.exitDriveBase", "Exit DriveBase")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-slate-600 leading-relaxed">
            {t("common.confirmExitApp", "Are you sure you want to close the application?")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-5 gap-2 sm:gap-2">
          <AlertDialogCancel
            className="border-slate-200 text-slate-700 hover:bg-slate-50 font-medium"
            onClick={() => setShowExitConfirm(false)}
          >
            {t("common.cancel", "Cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
            onClick={handleConfirmExit}
          >
            {t("common.exit", "Exit")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
