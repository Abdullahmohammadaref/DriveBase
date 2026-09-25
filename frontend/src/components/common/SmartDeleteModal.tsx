import { useState, useEffect } from "react"
import { useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import {
    Trash2,
    Archive,
    AlertTriangle,
    ExternalLink,
    Car,
    Receipt,
    Wrench,
    Tag,
    Loader2,
    Unlink,
} from "lucide-react"

import api from "@/lib/api"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export interface LinkedItem {
    type: "vehicle" | "transaction" | "expense" | "choice"
    id: number
    title: string
    subtitle?: string
    url_path?: string
}

export interface SmartDeleteCheckResult {
    can_hard_delete: boolean
    action: "delete" | "deactivate"
    entity_name: string
    dependencies_count: number
    dependency_details: string[]
    recent_items: string[]
    linked_items?: LinkedItem[]
    message: string
}

export type SmartDeleteMode = "deactivate" | "unlink_delete" | "cascade"

export interface SmartDeleteConfirmOptions {
    mode: SmartDeleteMode
    forceCascade?: boolean
    unlinkDelete?: boolean
}

export interface SmartDeleteModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    entityType: "vehicle" | "transaction" | "legal_entity" | "choice"
    entityId: number | string | null
    choiceType?: string
    entityName?: string
    onConfirm: (optionsOrCascade?: boolean | SmartDeleteConfirmOptions) => Promise<void> | void
    isPending?: boolean
}

export function SmartDeleteModal({
    open,
    onOpenChange,
    entityType,
    entityId,
    choiceType,
    entityName,
    onConfirm,
    isPending = false,
}: SmartDeleteModalProps) {
    const { t } = useTranslation()
    const { business_slug, locale } = useParams<{ business_slug?: string; locale?: string }>()
    
    // Deletion mode: "deactivate" (soft), "unlink_delete" (standalone delete), "cascade" (purge all)
    const [selectedMode, setSelectedMode] = useState<SmartDeleteMode>("deactivate")
    const [showSecondaryConfirm, setShowSecondaryConfirm] = useState(false)

    const isPeerEntity = entityType === "vehicle" || entityType === "transaction"

    // Reset local state when modal closes or opens
    useEffect(() => {
        if (!open) {
            setSelectedMode("deactivate")
            setShowSecondaryConfirm(false)
        }
    }, [open])

    // Fetch pre-flight check when modal opens
    const { data: checkData, isLoading: isChecking } = useQuery<SmartDeleteCheckResult>({
        queryKey: ["delete-check", entityType, entityId, choiceType],
        queryFn: async () => {
            if (!entityId) throw new Error("No entity ID")
            const params: Record<string, any> = {
                entity_type: entityType,
                entity_id: entityId,
            }
            if (choiceType) params.choice_type = choiceType

            const response = await api.get("/delete-check", { params })
            return response.data
        },
        enabled: open && entityId !== null && entityId !== undefined,
        staleTime: 0,
    })

    // If zero history exists, default to unlink_delete (which acts as a direct delete)
    useEffect(() => {
        if (checkData?.can_hard_delete) {
            setSelectedMode("unlink_delete")
        } else {
            setSelectedMode("deactivate")
        }
    }, [checkData?.can_hard_delete])

    const isHardDelete = checkData?.can_hard_delete ?? false
    const displayName = entityName || checkData?.entity_name || ""

    // Resolve URL for a linked item
    const getLinkedItemUrl = (item: LinkedItem): string | null => {
        if (!business_slug) return null
        const basePath = locale ? `/${business_slug}/${locale}` : `/${business_slug}`
        if (item.url_path) return `${basePath}/${item.url_path}`
        if (item.type === "vehicle") return `${basePath}/vehicles/${item.id}/edit`
        if (item.type === "transaction") return `${basePath}/transactions/${item.id}/edit`
        return null
    }

    const getItemIcon = (type: string) => {
        switch (type) {
            case "vehicle":
                return <Car className="h-3.5 w-3.5 text-blue-500 shrink-0" />
            case "transaction":
                return <Receipt className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            case "expense":
                return <Wrench className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            default:
                return <Tag className="h-3.5 w-3.5 text-purple-500 shrink-0" />
        }
    }

    const linkedItems = checkData?.linked_items || []
    const fallbackRecentItems = checkData?.recent_items || []

    const handleExecuteConfirm = async () => {
        const payload: SmartDeleteConfirmOptions = {
            mode: selectedMode,
            forceCascade: selectedMode === "cascade",
            unlinkDelete: selectedMode === "unlink_delete",
        }
        await onConfirm(payload)
        setShowSecondaryConfirm(false)
        onOpenChange(false)
    }

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader className="space-y-2.5">
                        <div className="flex items-center justify-between gap-3 pr-7">
                            <div className="flex items-center gap-2.5">
                                {selectedMode === "cascade" ? (
                                    <div className="h-9 w-9 rounded-full bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0 shadow-2xs">
                                        <Trash2 className="h-4 w-4" />
                                    </div>
                                ) : selectedMode === "unlink_delete" ? (
                                    <div className="h-9 w-9 rounded-full bg-blue-100 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 shadow-2xs">
                                        <Unlink className="h-4 w-4" />
                                    </div>
                                ) : (
                                    <div className="h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 shadow-2xs">
                                        <Archive className="h-4 w-4" />
                                    </div>
                                )}
                                <DialogTitle className="text-base font-semibold">
                                    {selectedMode === "cascade"
                                        ? t("common.smartDelete.cascadePurgeTitle", "Cascade Purge All")
                                        : selectedMode === "unlink_delete"
                                        ? isHardDelete
                                            ? t("common.deletePermanently", "Delete Permanently")
                                            : t("common.smartDelete.unlinkDeleteTitle", "Unlink All and Delete")
                                        : t("common.deactivate", "Deactivate")}
                                </DialogTitle>
                            </div>

                            {!isChecking && (
                                <Badge
                                    variant="outline"
                                    className={
                                        selectedMode === "cascade"
                                            ? "text-[11px] font-medium border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300"
                                            : selectedMode === "unlink_delete"
                                            ? "text-[11px] font-medium border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
                                            : "text-[11px] font-medium border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
                                    }
                                >
                                    {selectedMode === "cascade"
                                        ? t("common.smartDelete.badgeCascade", "Cascade Purge")
                                        : selectedMode === "unlink_delete"
                                        ? isHardDelete
                                            ? t("common.permanentDeletion", "Permanent Deletion")
                                            : t("common.smartDelete.badgeUnlinkDelete", "Unlink & Delete")
                                        : t("common.safeDeactivation", "Safe Deactivation")}
                                </Badge>
                            )}
                        </div>

                        <DialogDescription className="text-xs text-muted-foreground text-left space-y-1.5 pt-0.5">
                            {displayName ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-muted text-foreground border border-border/60">
                                    {displayName}
                                </span>
                            ) : null}

                            {isChecking ? (
                                <span className="flex items-center gap-2 py-2">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    <span>{t("common.smartDelete.checking", "Checking dependencies...")}</span>
                                </span>
                            ) : isHardDelete ? (
                                <span className="block text-foreground/90">
                                    {t(
                                        "common.smartDelete.hardDeleteDesc",
                                        "This record has no linked transactions, expenses, or history. It will be permanently removed from your database."
                                    )}
                                </span>
                            ) : (
                                <span className="block text-foreground/90">
                                    {t(
                                        "common.smartDelete.chooseOptionPrompt",
                                        "Choose how you want to handle this record and its linked dependencies:"
                                    )}
                                </span>
                            )}
                        </DialogDescription>
                    </DialogHeader>

                    {/* Linked Records Summary Section (when dependencies exist) */}
                    {!isChecking && !isHardDelete && checkData && (checkData.dependencies_count > 0 || checkData.dependency_details.length > 0) && (
                        <div className="rounded-lg border border-amber-200/90 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 p-3 text-xs space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 font-medium text-amber-900 dark:text-amber-200">
                                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                                    <span>{t("common.linkedRecords", "Linked Business Records")}</span>
                                </div>

                                <div className="flex flex-wrap gap-1.5">
                                    {checkData.dependency_details.map((detail, idx) => (
                                        <span
                                            key={idx}
                                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300"
                                        >
                                            ● {detail}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Interactive Clickable List of Linked Items */}
                            {(linkedItems.length > 0 || fallbackRecentItems.length > 0) && (
                                <div className="bg-background/80 dark:bg-background/60 rounded-md border border-amber-200/70 dark:border-amber-900/40 p-2">
                                    <div className="max-h-40 overflow-y-auto space-y-1.5 pr-3">
                                        {linkedItems.length > 0
                                            ? linkedItems.map((item, idx) => {
                                                  const url = getLinkedItemUrl(item)
                                                  return (
                                                      <div
                                                          key={idx}
                                                          className="flex items-center justify-between gap-3 px-2 py-1 rounded-md hover:bg-muted/50 transition-colors text-left"
                                                      >
                                                          <div className="flex items-center gap-2 min-w-0">
                                                              {getItemIcon(item.type)}
                                                              <div className="min-w-0">
                                                                  <p className="text-xs font-medium text-foreground truncate">
                                                                      {item.title}
                                                                  </p>
                                                                  {item.subtitle && (
                                                                      <p className="text-[11px] text-muted-foreground truncate">
                                                                          {item.subtitle}
                                                                      </p>
                                                                  )}
                                                              </div>
                                                          </div>

                                                          {url ? (
                                                              <a
                                                                  href={url}
                                                                  target="_blank"
                                                                  rel="noopener noreferrer"
                                                                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded border border-border/80 bg-background text-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0 shadow-2xs mr-1"
                                                                  title={t("common.smartDelete.viewRecord", "Open record in new tab")}
                                                              >
                                                                  <span>{t("common.view", "View")}</span>
                                                                  <ExternalLink className="h-3 w-3" />
                                                              </a>
                                                          ) : null}
                                                      </div>
                                                  )
                                              })
                                            : fallbackRecentItems.map((strItem, idx) => (
                                                  <div
                                                      key={idx}
                                                      className="p-1 text-xs text-muted-foreground"
                                                  >
                                                      • {strItem}
                                                  </div>
                                              ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Mode Selector Options */}
                    {!isChecking && !isHardDelete && (
                        <div className="space-y-2">
                            {/* Option 1: Deactivate (All entity types) */}
                            <label
                                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                    selectedMode === "deactivate"
                                        ? "border-amber-400 bg-amber-50/70 dark:border-amber-700 dark:bg-amber-950/30 ring-1 ring-amber-400"
                                        : "border-border hover:bg-muted/40"
                                }`}
                            >
                                <input
                                    type="radio"
                                    name="smart_delete_mode"
                                    value="deactivate"
                                    checked={selectedMode === "deactivate"}
                                    onChange={() => setSelectedMode("deactivate")}
                                    className="mt-0.5 h-4 w-4 text-amber-600 focus:ring-amber-500 accent-amber-600"
                                />
                                <div className="space-y-0.5 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                            <Archive className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                            {t("common.smartDelete.optionDeactivateTitle", "Deactivate (Safe Archive)")}
                                        </span>
                                        <Badge variant="outline" className="text-[10px] border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-900/30 py-0">
                                            {t("common.smartDelete.badgeSafe", "Safe / Reversible")}
                                        </Badge>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                                        {isPeerEntity
                                            ? t("common.smartDelete.optionDeactivateDesc", "Soft-deactivate and hide from active views. All links and financial records remain intact.")
                                            : t("common.smartDelete.optionDeactivateMasterDesc", "Soft-deactivate this item. It will be hidden from future selection menus while preserving references in historical records.")}
                                    </p>
                                </div>
                            </label>

                            {/* Option 2: Unlink All and Delete (Vehicles and Transactions ONLY) */}
                            {isPeerEntity && (
                                <label
                                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                        selectedMode === "unlink_delete"
                                            ? "border-blue-400 bg-blue-50/70 dark:border-blue-700 dark:bg-blue-950/30 ring-1 ring-blue-400"
                                            : "border-border hover:bg-muted/40"
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="smart_delete_mode"
                                        value="unlink_delete"
                                        checked={selectedMode === "unlink_delete"}
                                        onChange={() => setSelectedMode("unlink_delete")}
                                        className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500 accent-blue-600"
                                    />
                                    <div className="space-y-0.5 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                                <Unlink className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                                                {t("common.smartDelete.optionUnlinkDeleteTitle", "Unlink All and Delete")}
                                            </span>
                                            <Badge variant="outline" className="text-[10px] border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 bg-blue-100/60 dark:bg-blue-900/30 py-0">
                                                {t("common.smartDelete.badgePreserve", "Preserves Counterpart")}
                                            </Badge>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                                            {entityType === "vehicle"
                                                ? t("common.smartDelete.optionUnlinkDeleteVehicleDesc", "Permanently delete this vehicle only. All connected transactions will be detached and safely preserved as standalone records in your general ledger.")
                                                : t("common.smartDelete.optionUnlinkDeleteTxDesc", "Permanently delete this transaction only. The associated vehicle will remain completely intact.")}
                                        </p>
                                    </div>
                                </label>
                            )}

                            {/* Option 3 (or Option 2 for Legal Entities/Choices): Cascade Purge All */}
                            <label
                                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                    selectedMode === "cascade"
                                        ? "border-rose-400 bg-rose-50/70 dark:border-rose-700 dark:bg-rose-950/30 ring-1 ring-rose-400"
                                        : "border-border hover:bg-muted/40"
                                }`}
                            >
                                <input
                                    type="radio"
                                    name="smart_delete_mode"
                                    value="cascade"
                                    checked={selectedMode === "cascade"}
                                    onChange={() => setSelectedMode("cascade")}
                                    className="mt-0.5 h-4 w-4 text-rose-600 focus:ring-rose-500 accent-rose-600"
                                />
                                <div className="space-y-0.5 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-semibold text-xs text-rose-950 dark:text-rose-200 flex items-center gap-1.5">
                                            <AlertTriangle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                                            {t("common.smartDelete.optionCascadeTitle", "Cascade Purge All")}
                                        </span>
                                        <Badge variant="outline" className="text-[10px] border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 bg-rose-100/60 dark:bg-rose-900/30 py-0">
                                            {t("common.smartDelete.badgeManagerDanger", "Manager Override / Irreversible")}
                                        </Badge>
                                    </div>
                                    <p className="text-[11px] text-rose-700/90 dark:text-rose-300/80 leading-relaxed font-normal">
                                        {entityType === "vehicle"
                                            ? t("common.smartDelete.optionCascadeVehicleDesc", "Permanently delete this vehicle AND permanently destroy all connected transactions and expenses from the database. Irreversible.")
                                            : entityType === "transaction"
                                            ? t("common.smartDelete.optionCascadeTxDesc", "Permanently delete this transaction and any linked dependencies from the database.")
                                            : t("common.smartDelete.optionCascadeMasterDesc", "Permanently delete this item and purge or nullify all referencing records across the database.")}
                                    </p>
                                </div>
                            </label>
                        </div>
                    )}

                    <DialogFooter className="flex flex-row items-center justify-end gap-3 pt-3">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onOpenChange(false)}
                            disabled={isPending}
                            className="px-4"
                        >
                            {t("common.cancel", "Cancel")}
                        </Button>

                        <Button
                            type="button"
                            size="sm"
                            disabled={isChecking || isPending}
                            onClick={async () => {
                                if (isHardDelete) {
                                    // Zero history: execute directly
                                    await handleExecuteConfirm()
                                    return
                                }
                                if (selectedMode === "unlink_delete" || selectedMode === "cascade") {
                                    // Destructive modes require secondary confirmation
                                    setShowSecondaryConfirm(true)
                                    return
                                }
                                // Deactivate mode executes directly
                                await handleExecuteConfirm()
                            }}
                            className={`px-4 font-medium shadow-xs transition-colors ${
                                selectedMode === "cascade"
                                    ? "bg-rose-600 hover:bg-rose-700 text-white"
                                    : selectedMode === "unlink_delete"
                                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                                    : "bg-amber-600 hover:bg-amber-700 text-white"
                            }`}
                        >
                            {isPending ? (
                                <span className="flex items-center gap-1.5">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    <span>
                                        {selectedMode === "deactivate"
                                            ? t("common.deactivating", "Deactivating...")
                                            : t("common.deleting", "Deleting...")}
                                    </span>
                                </span>
                            ) : isHardDelete ? (
                                t("common.deletePermanently", "Delete Permanently")
                            ) : selectedMode === "unlink_delete" ? (
                                entityType === "vehicle"
                                    ? t("common.smartDelete.unlinkDeleteVehicleBtn", "Unlink All & Delete Vehicle")
                                    : t("common.smartDelete.unlinkDeleteTxBtn", "Delete Transaction Only")
                            ) : selectedMode === "cascade" ? (
                                t("common.smartDelete.cascadePurgeBtn", "Cascade Purge All")
                            ) : (
                                t("common.deactivate", "Deactivate")
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Secondary Final Confirmation Dialog for Destructive Actions (Unlink & Delete OR Cascade Purge) */}
            <Dialog open={showSecondaryConfirm} onOpenChange={setShowSecondaryConfirm}>
                <DialogContent className={`sm:max-w-md shadow-xl ${
                    selectedMode === "cascade"
                        ? "border-rose-300 dark:border-rose-900"
                        : "border-blue-300 dark:border-blue-900"
                }`}>
                    <DialogHeader className="space-y-3">
                        <div className="flex items-center gap-3">
                            <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                                selectedMode === "cascade"
                                    ? "bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400"
                                    : "bg-blue-100 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400"
                            }`}>
                                {selectedMode === "cascade" ? (
                                    <AlertTriangle className="h-5 w-5" />
                                ) : (
                                    <Unlink className="h-5 w-5" />
                                )}
                            </div>
                            <div>
                                <DialogTitle className={`text-base font-bold ${
                                    selectedMode === "cascade"
                                        ? "text-rose-950 dark:text-rose-100"
                                        : "text-foreground"
                                }`}>
                                    {selectedMode === "unlink_delete"
                                        ? entityType === "vehicle"
                                            ? t("common.smartDelete.confirmVehicleDeleteTitle", "Final Confirmation: Delete Vehicle")
                                            : t("common.smartDelete.confirmTxDeleteTitle", "Final Confirmation: Delete Transaction")
                                        : t("common.smartDelete.confirmCascadeTitle", "Final Confirmation: Cascade Deletion")}
                                </DialogTitle>
                                <p className={`text-xs font-medium ${
                                    selectedMode === "cascade"
                                        ? "text-rose-700/80 dark:text-rose-300/80"
                                        : "text-muted-foreground"
                                }`}>
                                    {selectedMode === "unlink_delete"
                                        ? entityType === "vehicle"
                                            ? t("common.smartDelete.confirmVehicleDeleteSubtitle", "Vehicle Deletion & Ledger Preservation")
                                            : t("common.smartDelete.confirmTxDeleteSubtitle", "Transaction Removal")
                                        : t("common.smartDelete.confirmCascadeSubtitle", "Irreversible Administrative Action")}
                                </p>
                            </div>
                        </div>

                        <DialogDescription className="text-xs text-foreground/90 space-y-2.5 pt-1 text-left">
                            <p>
                                {t("common.smartDelete.confirmTargetEntity", "You are about to permanently delete:")}{" "}
                                <strong className="text-foreground font-semibold underline">{displayName}</strong>
                            </p>

                            {selectedMode === "unlink_delete" ? (
                                entityType === "vehicle" ? (
                                    <div className="p-2.5 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-blue-900 dark:text-blue-200 text-xs space-y-1">
                                        <p className="font-semibold flex items-center gap-1.5">
                                            <Unlink className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                            {t("common.smartDelete.vehicleUnlinkNoticeTitle", "Safe Ledger Preservation:")}
                                        </p>
                                        <p className="text-[11px] leading-relaxed">
                                            {t("common.smartDelete.vehicleUnlinkNoticeDesc", "All linked transactions will be preserved in your general ledger as standalone records. Only the vehicle asset will be deleted.")}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="p-2.5 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-blue-900 dark:text-blue-200 text-xs">
                                        <p className="text-[11px] leading-relaxed">
                                            {t("common.smartDelete.txUnlinkNoticeDesc", "The linked vehicle will remain completely intact. Only this transaction will be deleted.")}
                                        </p>
                                    </div>
                                )
                            ) : (
                                /* Cascade Danger Details */
                                <>
                                    {checkData && (checkData.dependencies_count > 0 || checkData.dependency_details.length > 0) ? (
                                        <div className="p-2.5 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-200 text-xs">
                                            <p className="font-semibold mb-1">
                                                {t("common.smartDelete.purgingRecordsList", "Connected records that will be permanently destroyed:")}
                                            </p>
                                            <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                                                {checkData.dependency_details.map((detail, idx) => (
                                                    <li key={idx} className="font-medium">{detail}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    ) : null}
                                    <p className="text-rose-600 dark:text-rose-400 font-medium leading-relaxed">
                                        {t("common.smartDelete.confirmCascadeWarning", "This action cannot be undone. Accounting history and relations will be erased immediately.")}
                                    </p>
                                </>
                            )}
                        </DialogDescription>
                    </DialogHeader>

                    <DialogFooter className="flex flex-row items-center justify-end gap-2.5 pt-3">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShowSecondaryConfirm(false)}
                            disabled={isPending}
                        >
                            {t("common.smartDelete.goBack", "Go Back")}
                        </Button>

                        <Button
                            type="button"
                            size="sm"
                            disabled={isPending}
                            onClick={handleExecuteConfirm}
                            className={`font-semibold shadow-xs ${
                                selectedMode === "cascade"
                                    ? "bg-rose-600 hover:bg-rose-700 text-white"
                                    : "bg-blue-600 hover:bg-blue-700 text-white"
                            }`}
                        >
                            {isPending ? (
                                <span className="flex items-center gap-1.5">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    <span>{t("common.deleting", "Deleting...")}</span>
                                </span>
                            ) : selectedMode === "unlink_delete" ? (
                                entityType === "vehicle"
                                    ? t("common.smartDelete.confirmDeleteVehicleBtn", "Yes, Unlink All & Delete Vehicle")
                                    : t("common.smartDelete.confirmDeleteTxBtn", "Yes, Delete Transaction Only")
                            ) : (
                                t("common.smartDelete.confirmCascadeButton", "Yes, Permanently Delete All")
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
