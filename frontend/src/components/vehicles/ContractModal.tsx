import { useState } from "react"
import { useTranslation } from "react-i18next"
import { FileText, Globe, ArrowLeft, Receipt, ClipboardList, FileSignature, AlertCircle } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import type { VehicleListItem } from "@/types/vehicle"

interface ContractModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    vehicle: VehicleListItem | null
}

interface PdfEntry {
    label: string        // e.g. "Sales Agreement", "Identity Check"
    url: string          // full API URL, e.g. /api/vehicles/5/pdf/sale-agreement
}

type ModalStep = "choose-type" | "sale-region" | "sale-documents" | "download-ready"
type SaleRegion = "eu" | "non-eu"

/**
 * Contract generation modal with:
 * - Buy: Immediate PDF generation
 * - Sale: EU/Non-EU wizard with 3 document options
 *
 * PDFs are generated via backend API endpoints at /api/vehicles/{id}/pdf/{type}
 * and opened directly in a new browser tab.
 *
 * After the user picks a document option, a "download-ready" step renders individual
 * download buttons for each PDF as a guaranteed fallback against popup blockers.
 * The modal also attempts to open tabs programmatically (best-effort).
 */
export function ContractModal({
    open,
    onOpenChange,
    vehicle,
}: ContractModalProps) {
    const { t } = useTranslation()
    const [step, setStep] = useState<ModalStep>("choose-type")
    const [saleRegion, setSaleRegion] = useState<SaleRegion | null>(null)
    const [pendingPdfs, setPendingPdfs] = useState<PdfEntry[]>([])
    const [originStep, setOriginStep] = useState<ModalStep>("choose-type")

    // Helper to get missing fields for Buy Contract
    const getMissingBuyFields = () => {
        if (!vehicle) return []
        const missing: string[] = []
        const v = vehicle as any
        
        if (!v.buy_price) missing.push(t("contracts.missingFields.buyPriceGross", "Buy Price (Gross)"))
        if (!v.buy_date) missing.push(t("contracts.missingFields.buyDate", "Buy Date"))
        if (!v.buy_payment_method_id && !v.buy_payment_method) missing.push(t("contracts.missingFields.paymentMethod", "Payment Method"))
        if (!v.seller_id && !v.seller_name && !v.seller) missing.push(t("contracts.missingFields.seller", "Seller (Legal Entity)"))
        
        return missing
    }

    // Helper to get missing fields for Sale Documents
    const getMissingSaleFields = () => {
        if (!vehicle) return []
        const missing: string[] = []
        const v = vehicle as any
        
        if (!v.sale_price) missing.push(t("contracts.missingFields.salePriceGross", "Sale Price (Gross)"))
        if (!v.sale_date) missing.push(t("contracts.missingFields.saleDate", "Sale Date"))
        if (!v.sale_payment_method_id && !v.sale_payment_method) missing.push(t("contracts.missingFields.paymentMethod", "Payment Method"))
        if (!v.buyer_id && !v.buyer_name && !v.buyer) missing.push(t("contracts.missingFields.buyer", "Buyer (Legal Entity)"))
        
        return missing
    }


    // Reset state when modal closes
    const handleOpenChange = (isOpen: boolean) => {
        if (!isOpen) {
            setStep("choose-type")
            setSaleRegion(null)
            setPendingPdfs([])
            setOriginStep("choose-type")
        }
        onOpenChange(isOpen)
    }

    // Helper: build API PDF URL
    const pdfUrl = (type: string, params?: Record<string, string>) => {
        let url = `/api/vehicles/${vehicle?.internal_id}/pdf/${type}`
        if (params) {
            const query = new URLSearchParams(params).toString()
            if (query) url += `?${query}`
        }
        return url
    }

    /**
     * Core PDF generation handler.
     * 1. Attempts to open each PDF in a new tab (best-effort — may be blocked).
     * 2. Always transitions to the "download-ready" step with individual download buttons.
     */
    const triggerPdfGeneration = (pdfs: PdfEntry[], fromStep: ModalStep) => {
        if (!vehicle?.internal_id) return

        // Best-effort: try to open all tabs at once
        // Browsers will block all but the first — that's expected, the buttons are the real fallback
        pdfs.forEach((pdf, index) => {
            const link = document.createElement("a")
            link.href = pdf.url
            link.target = `pdf-tab-${Date.now()}-${index}`
            link.rel = "noopener noreferrer"
            link.style.display = "none"
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
        })

        // Always show the download-ready step regardless of whether tabs opened
        setOriginStep(fromStep)
        setPendingPdfs(pdfs)
        setStep("download-ready")
    }

    const handleBuyContract = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (!vehicle?.internal_id) return
        triggerPdfGeneration([
            { label: t("contracts.purchaseContract", "Purchase Contract"), url: pdfUrl("buy-contract") },
        ], step)
    }

    // Start sale contract wizard
    const handleSaleContract = () => {
        setStep("sale-region")
    }

    // Select EU/Non-EU region
    const handleSelectRegion = (region: SaleRegion) => {
        setSaleRegion(region)
        setStep("sale-documents")
    }

    const handleSalesAgreement = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (!vehicle?.internal_id) return
        triggerPdfGeneration([
            { label: t("contracts.salesAgreement", "Sales Agreement"), url: pdfUrl("sale-agreement") },
            { label: t("contracts.identityCheck", "Identity Check"), url: pdfUrl("identity-check") },
        ], step)
    }

    const handleReceipt = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (!vehicle?.internal_id) return
        const backendRegion = saleRegion === "non-eu" ? "outside_eu" : "eu"
        triggerPdfGeneration([
            { label: t("contracts.receipt", "Receipt"), url: pdfUrl("receipt", { region: backendRegion }) },
            { label: t("contracts.identityCheck", "Identity Check"), url: pdfUrl("identity-check") },
        ], step)
    }

    const handleBindingOrder = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (!vehicle?.internal_id) return
        triggerPdfGeneration([
            { label: t("contracts.bindingOrder", "Binding Order"), url: pdfUrl("binding-order") },
        ], step)
    }

    // Go back one step
    const handleBack = () => {
        if (step === "download-ready") {
            setStep(originStep)
            setPendingPdfs([])
        } else if (step === "sale-documents") {
            setStep("sale-region")
            setSaleRegion(null)
        } else if (step === "sale-region") {
            setStep("choose-type")
        }
    }

    if (!vehicle) return null

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[450px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {step !== "choose-type" && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 mr-1"
                                onClick={handleBack}
                            >
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        )}
                        <FileText className="h-5 w-5" />
                        {t("contracts.generateDocuments", "Generate Documents")}
                    </DialogTitle>
                </DialogHeader>

                <div className="mt-2">
                    {/* Vehicle Info */}
                    <p className="text-sm text-muted-foreground mb-4">
                        {t("contracts.vehicleHeader", "Vehicle: {{make}} {{model}} (ID: {{id}})", {
                            make: vehicle.make_name || "",
                            model: vehicle.model_name || "",
                            id: vehicle.internal_id,
                        })}
                    </p>

                    {/* Step 1: Choose Type (Buy vs Sale) */}
                    {step === "choose-type" && (
                        <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">{t("contracts.selectDocumentType", "Select document type:")}</p>
                            <div className="grid grid-cols-2 gap-4 items-start">
                                <div className="flex flex-col gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full h-auto flex-col gap-2 p-4 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950"
                                        onClick={handleBuyContract}
                                        disabled={!vehicle.can_generate_buy_contract}
                                    >
                                        <FileText className="h-8 w-8 text-blue-500" />
                                        <span className="font-medium">{t("contracts.purchaseContract", "Purchase Contract")}</span>
                                        <span className="text-xs text-muted-foreground">
                                            {vehicle.can_generate_buy_contract ? t("contracts.opensPdf", "Opens PDF") : t("contracts.notAvailable", "Not available")}
                                        </span>
                                    </Button>
                                    {!vehicle.can_generate_buy_contract && (
                                        <div className="mt-1 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300 bg-amber-500/10 rounded-md border border-amber-500/20">
                                            <p className="font-semibold mb-1 flex items-center gap-1">
                                                <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                                                <span>{t("contracts.toUnlockFillIn", "To unlock, fill in:")}</span>
                                            </p>
                                            <div className="space-y-0.5 ml-1 text-muted-foreground dark:text-gray-400">
                                                {getMissingBuyFields().map((f, i) => (
                                                    <span key={i} className="block">• {f}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-col gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full h-auto flex-col gap-2 p-4 hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-950"
                                        onClick={handleSaleContract}
                                        disabled={!vehicle.can_generate_sale_contract}
                                    >
                                        <FileText className="h-8 w-8 text-green-500" />
                                        <span className="font-medium">{t("contracts.saleDocuments", "Sale Documents")}</span>
                                        <span className="text-xs text-muted-foreground">
                                            {vehicle.can_generate_sale_contract ? t("contracts.chooseOptions", "Choose options") : t("contracts.notAvailable", "Not available")}
                                        </span>
                                    </Button>
                                    {!vehicle.can_generate_sale_contract && (
                                        <div className="mt-1 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300 bg-amber-500/10 rounded-md border border-amber-500/20">
                                            <p className="font-semibold mb-1 flex items-center gap-1">
                                                <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                                                <span>{t("contracts.toUnlockFillIn", "To unlock, fill in:")}</span>
                                            </p>
                                            <div className="space-y-0.5 ml-1 text-muted-foreground dark:text-gray-400">
                                                {getMissingSaleFields().map((f, i) => (
                                                    <span key={i} className="block">• {f}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Sale Region (EU vs Non-EU) */}
                    {step === "sale-region" && (
                        <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">{t("contracts.selectSaleDestination", "Select the sale destination:")}</p>
                            <div className="grid grid-cols-2 gap-4">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-auto flex-col gap-2 p-4 hover:border-primary hover:bg-primary/5"
                                    onClick={() => handleSelectRegion("eu")}
                                >
                                    <Globe className="h-8 w-8 text-primary" />
                                    <span className="font-medium">{t("contracts.saleToEuCountry", "Sale to EU Country")}</span>
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-auto flex-col gap-2 p-4 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950"
                                    onClick={() => handleSelectRegion("non-eu")}
                                >
                                    <Globe className="h-8 w-8 text-orange-500" />
                                    <span className="font-medium">{t("contracts.saleOutsideEu", "Sale Outside EU")}</span>
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Document Selection */}
                    {step === "sale-documents" && (
                        <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                                {saleRegion === "eu" ? t("contracts.saleToEuCountry", "Sale to EU Country") : t("contracts.saleOutsideEu", "Sale Outside EU")} - {t("contracts.selectDocumentType", "Select document:")}
                            </p>
                            <div className="space-y-3">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full justify-start gap-3 h-auto p-3 hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-950"
                                    onClick={handleSalesAgreement}
                                >
                                    <FileSignature className="h-6 w-6 text-green-500 flex-shrink-0" />
                                    <div className="text-left">
                                        <span className="font-medium">{t("contracts.salesAgreement", "Sales Agreement")}</span>
                                        <p className="text-xs text-muted-foreground">{t("contracts.generatesTwoPdfs", "Generates 2 PDFs")}</p>
                                    </div>
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full justify-start gap-3 h-auto p-3 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950"
                                    onClick={handleReceipt}
                                >
                                    <Receipt className="h-6 w-6 text-blue-500 flex-shrink-0" />
                                    <div className="text-left">
                                        <span className="font-medium">{t("contracts.receipt", "Receipt")}</span>
                                        <p className="text-xs text-muted-foreground">{t("contracts.generatesTwoPdfs", "Generates 2 PDFs")}</p>
                                    </div>
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full justify-start gap-3 h-auto p-3 hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-950"
                                    onClick={handleBindingOrder}
                                >
                                    <ClipboardList className="h-6 w-6 text-purple-500 flex-shrink-0" />
                                    <div className="text-left">
                                        <span className="font-medium">{t("contracts.bindingOrder", "Binding Order")}</span>
                                        <p className="text-xs text-muted-foreground">{t("contracts.generatesOnePdf", "Generates 1 PDF")}</p>
                                    </div>
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Step 4: Download Ready — PDF buttons + popup hint */}
                    {step === "download-ready" && (
                        <div className="space-y-3">
                            <p className="text-sm text-muted-foreground">
                                {pendingPdfs.length === 1
                                    ? t("contracts.docReadySingle", "Your document is ready. Click below to open it.")
                                    : t("contracts.docReadyMultiple", "Your {{count}} documents are ready. Open each one below.", { count: pendingPdfs.length })}
                            </p>

                            {/* One download button per PDF */}
                            <div className="space-y-2">
                                {pendingPdfs.map((pdf, index) => (
                                    <a
                                        key={index}
                                        href={pdf.url}
                                        target={`pdf-download-${index}`}
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-3 w-full rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/50 hover:border-primary/40 transition-colors"
                                    >
                                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                        <span>{pdf.label}</span>
                                        <span className="ml-auto text-xs text-muted-foreground">{t("contracts.openPdfLink", "Open PDF →")}</span>
                                    </a>
                                ))}
                            </div>

                            {/* Quiet popup hint — only shown if there are multiple PDFs */}
                            {pendingPdfs.length > 1 && (
                                <p className="text-xs text-muted-foreground pt-1 border-t border-border">
                                    {t("contracts.popupHint", "If a PDF didn't open automatically, use the buttons above. You may need to allow pop-ups for this site in your browser settings.")}
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
