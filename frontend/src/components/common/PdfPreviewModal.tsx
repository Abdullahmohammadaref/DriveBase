import { useState, useEffect, useRef, useCallback } from "react"
import { useTranslation } from "react-i18next"
import {
  Printer,
  FileText,
  Loader2,
  AlertCircle,
  RefreshCw,
  ArrowLeft,
  DownloadCloud,
  X,
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import api from "@/lib/api"
import { getApiRelativePath } from "@/lib/desktop/pdfHandler"
import { downloadBlob } from "@/lib/desktop/platform"
import { cn } from "@/lib/utils"
import { PDFDocument } from "pdf-lib"
import JSZip from "jszip"

export interface PdfPreviewItem {
  label: string
  url: string
}

interface PdfPreviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onBack?: () => void
  title?: string
  documents: PdfPreviewItem[]
  initialIndex?: number
}

export function PdfPreviewModal({
  open,
  onOpenChange,
  onBack,
  title,
  documents,
  initialIndex = 0,
}: PdfPreviewModalProps) {
  const { t } = useTranslation()
  const [activeIndex, setActiveIndex] = useState(initialIndex)
  const [blobs, setBlobs] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(false)
  const [isPrintingAll, setIsPrintingAll] = useState(false)
  const [isZippingAll, setIsZippingAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Listen for window close interception from DesktopWindowGuard
  useEffect(() => {
    if (!open) return
    const handleCloseFromGuard = () => {
      onOpenChange(false)
    }
    window.addEventListener("drivebase:close-active-modal", handleCloseFromGuard)
    return () => window.removeEventListener("drivebase:close-active-modal", handleCloseFromGuard)
  }, [open, onOpenChange])

  // Reset activeIndex when modal opens or documents change
  useEffect(() => {
    if (open) {
      setActiveIndex(initialIndex >= 0 && initialIndex < documents.length ? initialIndex : 0)
    }
  }, [open, initialIndex, documents.length])

  // Fetch document blobs
  useEffect(() => {
    if (!open || documents.length === 0) return

    let isMounted = true

    const fetchActive = async () => {
      const currentDoc = documents[activeIndex]
      if (!currentDoc) return

      // If already cached in memory, no need to show loading
      if (blobs[activeIndex]) {
        setError(null)
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const apiPath = getApiRelativePath(currentDoc.url)
        const response = await api.get(apiPath, { responseType: "blob" })

        if (!isMounted) return

        const blob = new Blob([response.data], { type: "application/pdf" })
        const blobUrl = URL.createObjectURL(blob)

        setBlobs((prev) => ({ ...prev, [activeIndex]: blobUrl }))
      } catch (err: unknown) {
        if (!isMounted) return
        let msg = t("contracts.loadFailed", "Failed to load document")
        const axiosErr = err as { response?: { data?: Blob | string } }
        if (axiosErr.response?.data instanceof Blob) {
          try {
            const text = await axiosErr.response.data.text()
            if (text) msg = text
          } catch {}
        } else if (err instanceof Error) {
          msg = err.message
        }
        console.error("[PdfPreviewModal] Failed to load PDF:", err)
        setError(msg)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchActive()

    // Pre-fetch all other documents in background for zero-latency tab switching
    documents.forEach(async (doc, idx) => {
      if (idx === activeIndex || blobs[idx]) return
      try {
        const apiPath = getApiRelativePath(doc.url)
        const response = await api.get(apiPath, { responseType: "blob" })
        if (!isMounted) return
        const blob = new Blob([response.data], { type: "application/pdf" })
        const blobUrl = URL.createObjectURL(blob)
        setBlobs((prev) => ({ ...prev, [idx]: blobUrl }))
      } catch (bgErr) {
        console.warn(`[PdfPreviewModal] Background preload failed for document ${doc.label}:`, bgErr)
      }
    })

    return () => {
      isMounted = false
    }
  }, [open, activeIndex, documents, blobs, t])

  // Cleanup blob URLs on close to avoid memory leaks
  useEffect(() => {
    if (!open) {
      Object.values(blobs).forEach((url) => {
        try {
          URL.revokeObjectURL(url)
        } catch {}
      })
      setBlobs({})
      setError(null)
    }
  }, [open])

  // Helper to ensure a document blob is loaded into memory
  const getDocumentArrayBuffer = async (index: number): Promise<ArrayBuffer> => {
    let blobUrl = blobs[index]
    if (!blobUrl) {
      const apiPath = getApiRelativePath(documents[index].url)
      const response = await api.get(apiPath, { responseType: "blob" })
      const blob = new Blob([response.data], { type: "application/pdf" })
      blobUrl = URL.createObjectURL(blob)
      setBlobs((prev) => ({ ...prev, [index]: blobUrl }))
    }
    const res = await fetch(blobUrl)
    return await res.arrayBuffer()
  }

  // Single document print (for 1-document packages)
  const handlePrintSingle = useCallback(() => {
    const currentBlob = blobs[activeIndex]
    if (!currentBlob) return

    const iframe = iframeRef.current
    if (iframe?.contentWindow) {
      try {
        iframe.contentWindow.focus()
        iframe.contentWindow.postMessage({ type: "print" }, "*")
        iframe.contentWindow.print()
        return
      } catch (err) {
        console.warn("[PdfPreviewModal] Direct iframe print failed, trying print helper:", err)
      }
    }

    // Hidden iframe fallback
    try {
      const printFrame = document.createElement("iframe")
      printFrame.style.position = "fixed"
      printFrame.style.right = "0"
      printFrame.style.bottom = "0"
      printFrame.style.width = "0"
      printFrame.style.height = "0"
      printFrame.style.border = "0"
      printFrame.src = currentBlob
      document.body.appendChild(printFrame)

      printFrame.onload = () => {
        setTimeout(() => {
          try {
            printFrame.contentWindow?.focus()
            printFrame.contentWindow?.print()
          } catch (e) {
            console.warn("[PdfPreviewModal] Hidden iframe print error:", e)
          }
          setTimeout(() => {
            if (document.body.contains(printFrame)) {
              document.body.removeChild(printFrame)
            }
          }, 60000)
        }, 300)
      }
    } catch (fallbackErr) {
      console.error("[PdfPreviewModal] Single print failed:", fallbackErr)
    }
  }, [blobs, activeIndex])

  // Print All: Merges all document PDFs into ONE combined PDF in memory and sends it to the printer
  const handlePrintAll = useCallback(async () => {
    if (documents.length === 0 || isPrintingAll) return

    if (documents.length === 1) {
      handlePrintSingle()
      return
    }

    try {
      setIsPrintingAll(true)
      const mergedPdf = await PDFDocument.create()

      for (let i = 0; i < documents.length; i++) {
        const buffer = await getDocumentArrayBuffer(i)
        const doc = await PDFDocument.load(buffer)
        const copiedPages = await mergedPdf.copyPages(doc, doc.getPageIndices())
        copiedPages.forEach((page) => mergedPdf.addPage(page))
      }

      const mergedBytes = await mergedPdf.save()
      const mergedBlob = new Blob([mergedBytes.buffer as ArrayBuffer], { type: "application/pdf" })
      const mergedUrl = URL.createObjectURL(mergedBlob)

      const printFrame = document.createElement("iframe")
      printFrame.style.position = "fixed"
      printFrame.style.right = "0"
      printFrame.style.bottom = "0"
      printFrame.style.width = "0"
      printFrame.style.height = "0"
      printFrame.style.border = "0"
      printFrame.src = `${mergedUrl}#toolbar=0`
      document.body.appendChild(printFrame)

      printFrame.onload = () => {
        setTimeout(() => {
          try {
            printFrame.contentWindow?.focus()
            printFrame.contentWindow?.postMessage({ type: "print" }, "*")
            printFrame.contentWindow?.print()
          } catch (e) {
            console.warn("[PdfPreviewModal] Print all error:", e)
          }
          setTimeout(() => {
            if (document.body.contains(printFrame)) {
              document.body.removeChild(printFrame)
            }
            URL.revokeObjectURL(mergedUrl)
          }, 60000)
        }, 300)
      }
    } catch (err) {
      console.error("[PdfPreviewModal] Failed to merge and print all documents:", err)
    } finally {
      setIsPrintingAll(false)
    }
  }, [documents, isPrintingAll, handlePrintSingle])

  // Save All: Packages all document PDFs into a single clean .zip file and prompts with native Save As dialog
  const handleSaveAllZip = useCallback(async () => {
    if (documents.length === 0 || isZippingAll) return

    try {
      setIsZippingAll(true)
      const zip = new JSZip()
      const safeTitle = (title || "Fahrzeug").replace(/[^a-zA-Z0-9_\-]/g, "_")

      for (let i = 0; i < documents.length; i++) {
        const buffer = await getDocumentArrayBuffer(i)
        const safeDocLabel = documents[i].label.replace(/[^a-zA-Z0-9_\-]/g, "_")
        const fileName = `${String(i + 1).padStart(2, "0")}_${safeDocLabel}.pdf`
        zip.file(fileName, buffer)
      }

      const zipBlob = await zip.generateAsync({ type: "blob" })
      const fileName = `${safeTitle}_Dokumente.zip`
      await downloadBlob(fileName, zipBlob)
    } catch (err: unknown) {
      console.error("[PdfPreviewModal] Failed to generate ZIP:", err)
    } finally {
      setIsZippingAll(false)
    }
  }, [documents, isZippingAll, title])

  const handleRetry = () => {
    setBlobs((prev) => {
      const next = { ...prev }
      delete next[activeIndex]
      return next
    })
  }

  // Keyboard shortcut: Ctrl+P / Cmd+P to print
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "p" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        if (documents.length > 1) {
          handlePrintAll()
        } else {
          handlePrintSingle()
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open, documents.length, handlePrintAll, handlePrintSingle])

  const currentDoc = documents[activeIndex]
  const currentBlob = blobs[activeIndex]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[96vw] md:max-w-[94vw] lg:max-w-[92vw] h-[94vh] flex flex-col p-3 sm:p-4 gap-2"
      >
        <DialogHeader className="flex-row items-center justify-between pb-2 border-b border-border space-y-0">
          <div className="flex items-center gap-2.5 truncate pr-4">
            {onBack && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onBack}
                className="h-8 px-2 gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                title={t("contracts.backToOptions", "Back to Options")}
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">{t("contracts.backToOptions", "Back to Options")}</span>
              </Button>
            )}

            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex-shrink-0">
              <FileText className="h-4 w-4" />
            </div>

            <div className="truncate">
              <DialogTitle className="text-sm font-semibold truncate flex items-center gap-2">
                <span>{title || t("contracts.documentPreview", "Document Preview")}</span>
                {currentDoc && (
                  <span className="text-xs font-normal text-muted-foreground hidden md:inline">
                    — {currentDoc.label}
                  </span>
                )}
              </DialogTitle>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Multi-document package: "Print All" and "Save All (ZIP)" */}
            {documents.length > 1 ? (
              <>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={handlePrintAll}
                  disabled={loading || isPrintingAll}
                  className="h-8 gap-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shadow-xs"
                  title={t("contracts.printAll", "Print all documents in one combined PDF")}
                >
                  {isPrintingAll ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Printer className="h-3.5 w-3.5" />
                  )}
                  <span>{t("contracts.printAll", "Alle drucken")}</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSaveAllZip}
                  disabled={loading || isZippingAll}
                  className="h-8 gap-1.5 text-xs font-medium cursor-pointer"
                  title={t("contracts.downloadAllZip", "Download all documents as a ZIP file")}
                >
                  {isZippingAll ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <DownloadCloud className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  )}
                  <span>{t("contracts.downloadAllZip", "Alle speichern (ZIP)")}</span>
                </Button>
              </>
            ) : (
              /* Single document package: Print button (single save is inside the viewer toolbar) */
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handlePrintSingle}
                disabled={!currentBlob || loading}
                className="h-8 gap-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shadow-xs"
                title={t("common.print", "Print")}
              >
                <Printer className="h-3.5 w-3.5" />
                <span>{t("common.print", "Print")}</span>
              </Button>
            )}

            {/* Explicit Close Button (prevents confusing desktop titlebar close) */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
              title={t("common.close", "Schließen")}
            >
              <X className="h-3.5 w-3.5" />
              <span>{t("common.close", "Schließen")}</span>
            </Button>
          </div>
        </DialogHeader>

        {/* Access-style Multi-Document Tabs */}
        {documents.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-border/60">
            {documents.map((doc, idx) => {
              const isActive = idx === activeIndex

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveIndex(idx)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-md flex items-center gap-2 transition-all cursor-pointer border whitespace-nowrap",
                    isActive
                      ? "bg-primary text-primary-foreground border-primary shadow-xs font-semibold"
                      : "bg-muted/40 text-muted-foreground border-transparent hover:bg-muted hover:text-foreground"
                  )}
                >
                  <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>
                    {idx + 1}. {doc.label}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Main Document Viewer Viewport */}
        <div className="flex-1 w-full relative min-h-0 bg-slate-100 dark:bg-slate-900/60 rounded-lg overflow-hidden border border-border">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-xs z-10">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-xs font-medium text-muted-foreground">
                {t("contracts.loadingDocument", "Loading document preview...")}
              </p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center z-10 bg-background/95">
              <div className="h-12 w-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
                <AlertCircle className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-foreground">
                {t("contracts.loadFailed", "Failed to load document")}
              </p>
              <p className="text-xs text-muted-foreground max-w-sm whitespace-pre-line">{error}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRetry}
                className="mt-2 gap-1.5 text-xs cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t("common.retry", "Retry")}
              </Button>
            </div>
          )}

          {currentBlob && (
            <iframe
              ref={iframeRef}
              src={`${currentBlob}#toolbar=1&navpanes=0`}
              className="w-full h-full border-0 rounded-lg bg-white"
              title={currentDoc?.label || "PDF Viewer"}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
