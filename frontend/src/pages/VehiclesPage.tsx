import { useState, useCallback, useEffect } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { Plus, Search, X, BarChart3, ChevronDown, ChevronUp } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SortMenuButton } from "@/components/ui/SortMenuButton"
import { useVehicles, useDeleteVehicle, useChangeVehicleStatus } from "@/hooks/useVehicles"
import { VehicleCard } from "@/components/vehicles/VehicleCard"
import { VehicleFiltersSidebar } from "@/components/vehicles/VehicleFilters"
import { FinancialSummaryCard } from "@/components/vehicles/FinancialSummary"
import { ContractModal } from "@/components/vehicles/ContractModal"
import { SmartDeleteModal } from "@/components/common/SmartDeleteModal"
import { MobileDeListingModal } from "@/components/vehicles/MobileDeListingModal"
import { StickyFooter } from "@/components/StickyFooter"
import { PerPageInput } from "@/components/PerPageInput"
import { PageInput } from "@/components/PageInput"
import { getPagePref, savePagePref, getBoolPref, saveBoolPref } from "@/lib/paginationPrefs"
// import { getSplitWidth, saveSplitWidth } from "@/lib/paginationPrefs" // DEACTIVATED: SplitViewDivider

const PREF_SHOW_FINANCIAL_SUMMARY = "acar_pref_show_vehicles_summary"
// import { SplitViewDivider } from "@/components/SplitViewDivider" // DEACTIVATED: SplitViewDivider
import type { VehicleFilters, VehicleListItem } from "@/types/vehicle"



/**
 * Vehicles list page with cards, filters, and financial summary
 */
export function VehiclesPage() {
    const { t } = useTranslation()
    const [searchParams] = useSearchParams()

    // Filter state - initialize from URL
    const [filters, setFilters] = useState<VehicleFilters>(() => {
        const statusFromUrl = searchParams.get("status")
        return {
            page: 1,
            per_page: getPagePref("acar_vehicles_per_page", 20),
            order: "desc",
            sort: "internal_id",
            status: statusFromUrl || undefined,
        }
    })

    // Quick search (debounced)
    const [searchValue, setSearchValue] = useState("")

    // Persistent toggle for financial summary (default: collapsed/hidden, remembered via cookie & localStorage)
    const [showFinancialSummary, setShowFinancialSummary] = useState<boolean>(() =>
        getBoolPref(PREF_SHOW_FINANCIAL_SUMMARY, false)
    )

    // Update filters when URL changes (sidebar navigation)
    useEffect(() => {
        const statusFromUrl = searchParams.get("status")
        setFilters(prev => ({
            ...prev,
            status: statusFromUrl || undefined,
            page: 1, // Reset to first page when filter changes
        }))
    }, [searchParams])



    // Delete confirmation dialog
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [vehicleToDelete, setVehicleToDelete] =
        useState<VehicleListItem | null>(null)

    // Contract modal state
    const [contractModalOpen, setContractModalOpen] = useState(false)
    const [vehicleForContract, setVehicleForContract] =
        useState<VehicleListItem | null>(null)

    // mobile.de Listing Modal state & credentials check
    const [mobileDeModalOpen, setMobileDeModalOpen] = useState(false)
    const [vehicleForMobileDe, setVehicleForMobileDe] =
        useState<VehicleListItem | null>(null)

    const { data: mobileDeSettings } = useQuery<{ is_configured: boolean }>({
        queryKey: ["mobile-de-settings"],
        queryFn: async () => {
            const res = await api.get("/settings/mobile-de")
            return res.data
        },
    })

    // Fetch vehicles
    const { data, isLoading, isFetching } = useVehicles(filters)

    /*
     * =========================================================================
     * DEACTIVATED FEATURE: Draggable SplitViewDivider on Vehicles Page
     * To reactivate:
     * 1. Uncomment the panelWidth/handleDrag code below.
     * 2. Re-enable <SplitViewDivider /> in the JSX.
     * See docs/DEACTIVATED_FEATURES.md for full details.
     * =========================================================================
     */
    /*
    const [panelWidth, setPanelWidth] = useState(() => 
        getSplitWidth("acar_vehicles_filter_width", 260, 200, 500)
    )
    const [isDragging, setIsDragging] = useState(false)

    const handleDrag = (deltaX: number) => {
        setPanelWidth(prev => {
            const next = prev + deltaX
            return Math.min(500, Math.max(200, next))
        })
    }

    const handleDragEnd = () => {
        setIsDragging(false)
        saveSplitWidth("acar_vehicles_filter_width", panelWidth, 200, 500)
    }
    */

    // Mutations
    const deleteMutation = useDeleteVehicle()
    const statusMutation = useChangeVehicleStatus()



    // Handle page change
    const handlePageChange = useCallback((page: number) => {
        setFilters((prev) => ({ ...prev, page }))
    }, [])

    // Handle filter apply
    const handleApplyFilters = useCallback((newFilters: VehicleFilters) => {
        setFilters((prev) => ({
            ...newFilters,
            page: 1, // Reset to first page on filter change
            per_page: prev.per_page,
        }))
    }, [])

    const handleSortChange = useCallback((sort: string) => {
        setFilters((prev) => ({
            ...prev,
            sort,
            page: 1,
        }))
    }, [])

    const handleSortOrderChange = useCallback((order: "asc" | "desc") => {
        setFilters((prev) => ({
            ...prev,
            order,
            page: 1,
        }))
    }, [])

    // Handle search debounce
    useEffect(() => {
        const timer = setTimeout(() => {
            setFilters((prev) => ({
                ...prev,
                search: searchValue.trim() || undefined,
                page: 1,
            }))
        }, 400)
        return () => clearTimeout(timer)
    }, [searchValue])

    // Clear search
    const handleClearSearch = useCallback(() => {
        setSearchValue("")
    }, [])

    // Handle per page
    const handlePerPageChange = useCallback((newPerPage: number) => {
        savePagePref("acar_vehicles_per_page", newPerPage)
        setFilters(prev => ({ ...prev, per_page: newPerPage, page: 1 }))
    }, [])

    // Handle delete click
    const handleDeleteClick = useCallback((vehicle: VehicleListItem) => {
        setVehicleToDelete(vehicle)
        setDeleteDialogOpen(true)
    }, [])

    // Confirm delete
    const handleConfirmDelete = useCallback(async (optsOrCascade?: boolean | { forceCascade?: boolean; unlinkDelete?: boolean; mode?: string }) => {
        if (vehicleToDelete?.internal_id) {
            const isObj = typeof optsOrCascade === "object" && optsOrCascade !== null
            const forceCascade = isObj ? (optsOrCascade.forceCascade || optsOrCascade.mode === "cascade") : Boolean(optsOrCascade)
            const unlinkDelete = isObj ? (optsOrCascade.unlinkDelete || optsOrCascade.mode === "unlink_delete") : false
            const deleteMode = isObj ? optsOrCascade.mode : (forceCascade ? "cascade" : "deactivate")

            await deleteMutation.mutateAsync({
                internalId: vehicleToDelete.internal_id,
                forceCascade,
                unlinkDelete,
                deleteMode,
            })
            setDeleteDialogOpen(false)
            setVehicleToDelete(null)
        }
    }, [vehicleToDelete, deleteMutation])

    const sortOptions = [
        { value: "internal_id", label: t("sort.vehicleId", "Vehicle ID") },
        { value: "make", label: t("sort.make", "Make") },
        { value: "status", label: t("sort.status", "Status") },
        { value: "buy_price", label: t("sort.buyPrice", "Buy Price") },
        { value: "sale_price", label: t("sort.salePrice", "Sale Price") },
        { value: "buy_date", label: t("sort.buyDate", "Buy Date") },
        { value: "sale_date", label: t("sort.saleDate", "Sale Date") },
        { value: "kilometer", label: t("sort.kilometers", "Kilometers") },
        { value: "year_of_construction", label: t("sort.year", "Year") },
    ]

    return (
        <div className="space-y-3">
            {/* Page Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-border pb-2">
                <div>
                    <h1 className="text-base font-semibold tracking-tight text-gray-900 dark:text-foreground">
                        {t("vehicles.title", "Vehicles")}
                    </h1>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            const next = !showFinancialSummary
                            setShowFinancialSummary(next)
                            saveBoolPref(PREF_SHOW_FINANCIAL_SUMMARY, next)
                        }}
                        className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground border-border/80"
                        title={showFinancialSummary ? t("vehicles.hideSummaryTooltip", "Hide financial summary") : t("vehicles.showSummaryTooltip", "Show financial summary")}
                    >
                        <BarChart3 className="h-3.5 w-3.5 text-primary" />
                        <span>{showFinancialSummary ? t("vehicles.hideSummary", "Hide Summary") : t("vehicles.summary", "Summary")}</span>
                        {showFinancialSummary ? <ChevronUp className="h-3 w-3 opacity-60" /> : <ChevronDown className="h-3 w-3 opacity-60" />}
                    </Button>
                    <Link
                        to="new"
                        className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-xs hover:bg-primary/90"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        {t("vehicles.addVehicle", "Add Vehicle")}
                    </Link>
                </div>
            </div>

            {/* Financial Summary (Collapsible) */}
            {showFinancialSummary && (
                <div className="animate-in fade-in-0 duration-200">
                    <FinancialSummaryCard
                        summary={data?.financial_summary}
                        isLoading={isLoading}
                    />
                </div>
            )}

            {/* Main Layout */}
            <div className="flex flex-col lg:flex-row relative lg:items-start gap-3.5">
                {/* Left Sidebar (Mobile) */}
                <div className="w-full lg:hidden shrink-0 order-2 mb-4">
                    <VehicleFiltersSidebar
                        filters={filters}
                        onApplyFilters={handleApplyFilters}
                    />
                </div>

                {/* Left Sidebar (Desktop) - Fixed comfortable width */}
                <div className="hidden lg:block shrink-0 order-1 w-[295px]">
                    <VehicleFiltersSidebar
                        filters={filters}
                        onApplyFilters={handleApplyFilters}
                    />
                </div>

                {/* Draggable Divider - Deactivated for now (see docs/DEACTIVATED_FEATURES.md) */}
                {/* <SplitViewDivider 
                    onDrag={handleDrag}
                    onDragStart={() => setIsDragging(true)}
                    onDragEnd={handleDragEnd}
                    className="hidden lg:flex order-2"
                    handlePosition="top"
                /> */}

                {/* Right Content */}
                <div className="flex-1 min-w-0 order-1 lg:order-2 flex flex-col gap-3 mb-4 lg:mb-0">
                    {/* Toolbar */}
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                        {/* Search */}
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                type="text"
                                placeholder={t("vehicles.searchPlaceholder", "Search by Make, Model, ID, VIN...")}
                                className="pl-8 pr-8 h-8 text-xs"
                                value={searchValue}
                                onChange={(e) => setSearchValue(e.target.value)}
                            />
                            {searchValue && (
                                <button
                                    onClick={handleClearSearch}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <SortMenuButton
                                options={sortOptions}
                                sort={filters.sort || "internal_id"}
                                order={filters.order || "desc"}
                                onSortChange={handleSortChange}
                                onOrderChange={handleSortOrderChange}
                            />
                        </div>
                    </div>

                    {/* Vehicle Cards Grid */}
                    <div className="space-y-2.5">
                {isLoading ? (
                    // Loading skeleton
                    Array.from({ length: 5 }).map((_, i) => (
                        <div
                            key={i}
                            className="h-36 animate-pulse rounded-lg bg-muted"
                        />
                    ))
                ) : data?.vehicles?.items?.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border p-12 text-center">
                        <p className="text-muted-foreground">{t("vehicles.noVehiclesFound", "No vehicles found")}</p>
                    </div>
                ) : (
                    data?.vehicles?.items?.map((vehicle) => (
                        <VehicleCard
                            key={vehicle.id}
                            vehicle={vehicle}
                            isMobileDeConfigured={!!mobileDeSettings?.is_configured}
                            onDelete={handleDeleteClick}
                            onStatusChange={(v, status) => {
                                if (v.internal_id) {
                                    statusMutation.mutate({ internalId: v.internal_id, status })
                                }
                            }}
                            onGenerateContract={(v) => {
                                setVehicleForContract(v)
                                setContractModalOpen(true)
                            }}
                            onOpenMobileDe={(v) => {
                                setVehicleForMobileDe(v)
                                setMobileDeModalOpen(true)
                            }}
                        />
                    ))
                )}
            </div>
            </div>
            </div>

            {/* Padding to prevent sticky footer overlap */}
            <div className="pb-24" />

            {/* Pagination Sticky Footer */}
            <StickyFooter>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground font-medium">
                    {t("common.showing", "Showing")}
                    <PerPageInput
                        value={filters.per_page || 20}
                        onChange={handlePerPageChange}
                        total={data?.vehicles?.total}
                        label=""
                    />
                    {t("common.of", "of")}{" "}
                    <span className="text-foreground">{data?.vehicles?.total || 0}</span>{" "}
                    {t("vehicles.vehicles", "vehicles")}
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!data?.vehicles || data.vehicles.page <= 1}
                        onClick={() => handlePageChange((data?.vehicles?.page || 1) - 1)}
                    >
                        {t("common.previous", "Previous")}
                    </Button>
                    <span className="text-sm text-muted-foreground px-2 font-medium flex items-center gap-1.5">
                        {t("common.page", "Page")}{" "}
                        <PageInput
                            currentPage={data?.vehicles?.page || 1}
                            totalPages={data?.vehicles?.total ? Math.ceil(data.vehicles.total / (filters.per_page || 20)) : 1}
                            onPageChange={handlePageChange}
                            disabled={isFetching}
                        />
                        {" "}{t("common.of", "of")}{" "}
                        <span className="text-foreground">{data?.vehicles?.total ? Math.ceil(data.vehicles.total / (filters.per_page || 20)) : 1}</span>
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!data?.vehicles || data.vehicles.page >= Math.ceil((data?.vehicles?.total || 1) / (filters.per_page || 20))}
                        onClick={() => handlePageChange((data?.vehicles?.page || 1) + 1)}
                    >
                        {t("common.next", "Next")}
                    </Button>
                </div>
            </StickyFooter>

            {/* Loading overlay */}
            {isFetching && !isLoading && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/50">
                    <div className="text-sm text-muted-foreground">{t("vehicles.updating", "Updating...")}</div>
                </div>
            )}



            {/* Smart Delete Confirmation Dialog */}
            <SmartDeleteModal
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
                entityType="vehicle"
                entityId={vehicleToDelete?.internal_id ?? null}
                entityName={vehicleToDelete ? `${vehicleToDelete.make_name || ""} ${vehicleToDelete.model_name || ""}`.trim() || `#${vehicleToDelete.internal_id}` : ""}
                onConfirm={handleConfirmDelete}
                isPending={deleteMutation.isPending}
            />

            {/* Contract Generation Modal */}
            <ContractModal
                open={contractModalOpen}
                onOpenChange={setContractModalOpen}
                vehicle={vehicleForContract}
            />

            {/* mobile.de Listing & Sync Modal */}
            {vehicleForMobileDe?.internal_id && (
                <MobileDeListingModal
                    vehicleInternalId={vehicleForMobileDe.internal_id}
                    vehicleTitle={`${vehicleForMobileDe.make_name || ""} ${vehicleForMobileDe.model_name || ""}`.trim() || `#${vehicleForMobileDe.internal_id}`}
                    open={mobileDeModalOpen}
                    onOpenChange={setMobileDeModalOpen}
                />
            )}
        </div>
    )
}
