import { useState, useCallback, useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Plus, Search, X, Trash2, RefreshCw, Building2, User, ArrowUpDown, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

import {
    useLegalEntities,
    useCreateLegalEntity,
    useUpdateLegalEntity,
    useDeactivateLegalEntity,
    useActivateLegalEntity,
    type LegalEntity,
    type LegalEntityFilters,
    type LegalEntityCreatePayload,
} from "@/hooks/useLegalEntities"
import { EntityForm } from "@/components/legal-entities/EntityForm"
import { LegalEntityFiltersSidebar } from "@/components/legal-entities/LegalEntityFilters"
import { StickyFooter } from "@/components/StickyFooter"
import { PerPageInput } from "@/components/PerPageInput"
import { PageInput } from "@/components/PageInput"
import { getPagePref, savePagePref, getSplitWidth, saveSplitWidth } from "@/lib/paginationPrefs"
import { SplitViewDivider } from "@/components/SplitViewDivider"


/**
 * Legal Entities list page with filtering, CRUD operations.
 * Optimized for professional UI ('Amazing' search and layout).
 */
export function LegalEntitiesPage() {
    const { t } = useTranslation()
    const [searchParams] = useSearchParams()

    const typeFromUrl = searchParams.get("type") as "individual" | "company" | null
    const statusFromUrl = searchParams.get("status") as "active" | "inactive" | null

    // Filter state
    const [filters, setFilters] = useState<LegalEntityFilters>({
        page: 1,
        per_page: getPagePref("acar_entities_per_page", 20),
        type: typeFromUrl || undefined,
        status: statusFromUrl || undefined,
    })

    useEffect(() => {
        setFilters(prev => ({
            ...prev,
            type: typeFromUrl || undefined,
            status: statusFromUrl || undefined,
            page: 1, // Reset page when type filter changes
        }))
    }, [typeFromUrl, statusFromUrl])

    // Search state
    const [searchValue, setSearchValue] = useState("")

    // Dialog states
    const [addDialogOpen, setAddDialogOpen] = useState(false)
    const [editDialogOpen, setEditDialogOpen] = useState(false)
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [selectedEntity, setSelectedEntity] = useState<LegalEntity | null>(null)

    // Form state
    const [formData, setFormData] = useState<Partial<LegalEntityCreatePayload>>({
        type: "individual",
    })
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

    // Fetch legal entities
    const { data, isLoading, isFetching } = useLegalEntities(filters)

    // Split view preferences
    const [panelWidth, setPanelWidth] = useState(() => 
        getSplitWidth("acar_legalentities_filter_width", 260, 200, 500)
    )
    const [isDragging, setIsDragging] = useState(false)

    const handleDrag = (deltaX: number) => {
        setPanelWidth(prev => {
            const next = prev + deltaX // Positive deltaX increases left panel width
            return Math.min(500, Math.max(200, next))
        })
    }

    const handleDragEnd = () => {
        setIsDragging(false)
        saveSplitWidth("acar_legalentities_filter_width", panelWidth, 200, 500)
    }

    // Mutations
    const createMutation = useCreateLegalEntity()
    const updateMutation = useUpdateLegalEntity()
    const deactivateMutation = useDeactivateLegalEntity()
    const activateMutation = useActivateLegalEntity()

    // Handle search debounce
    useEffect(() => {
        const timer = setTimeout(() => {
            setFilters(prev => ({
                ...prev,
                search: searchValue.trim() || undefined,
                page: 1,
            }))
        }, 400)
        return () => clearTimeout(timer)
    }, [searchValue])


    const handleClearSearch = useCallback(() => {
        setSearchValue("")
        // The effect will handle resetting the filter
    }, [])

    const handlePerPageChange = useCallback((newPerPage: number) => {
        savePagePref("acar_entities_per_page", newPerPage)
        setFilters(prev => ({ ...prev, per_page: newPerPage, page: 1 }))
    }, [])

    // Handle type filter change
    const handleTypeFilter = useCallback((value: string) => {
        setFilters(prev => ({
            ...prev,
            type: value === "all" ? undefined : value as "individual" | "company",
            page: 1,
        }))
    }, [])

    // Handle status filter change
    const handleStatusFilter = useCallback((value: string) => {
        setFilters(prev => ({
            ...prev,
            status: value === "all" ? undefined : value as "active" | "inactive",
            page: 1,
        }))
    }, [])

    // Handle page change
    const handlePageChange = useCallback((page: number) => {
        setFilters(prev => ({ ...prev, page }))
    }, [])

    // Handle sort
    const handleSort = useCallback((column: string) => {
        setFilters(prev => {
            const newOrder = prev.sort === column && prev.order === 'asc' ? 'desc' : 'asc'
            return { ...prev, sort: column, order: newOrder, page: 1 }
        })
    }, [])

    const getSortIndicator = (column: string) => {
        if (filters.sort !== column) {
            return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />
        }
        return filters.order === 'asc'
            ? <ChevronUp className="ml-1 h-3 w-3" />
            : <ChevronDown className="ml-1 h-3 w-3" />
    }

    // Open add dialog
    const handleAddClick = useCallback(() => {
        setFormData({ type: "individual" })
        setValidationErrors({})
        setAddDialogOpen(true)
    }, [])

    // Open edit dialog
    const handleEditClick = useCallback((entity: LegalEntity) => {
        setSelectedEntity(entity)
        setFormData({
            name: entity.name,
            type: entity.type,
            address_street: entity.address_street || "",
            address_street_number: entity.address_street_number?.toString() || "",
            address_postal_code: entity.address_postal_code || "",
            address_city_id: entity.address_city_id || null,
            address_country_id: entity.address_country_id || null,
            email: entity.email || "",
            phone_number: entity.phone_number || "",
            tax_identification_number: entity.tax_identification_number || "",
        })
        setValidationErrors({})
        setEditDialogOpen(true)
    }, [])

    // Open delete dialog
    const handleDeleteClick = useCallback((entity: LegalEntity) => {
        setSelectedEntity(entity)
        setDeleteDialogOpen(true)
    }, [])

    // Validate form fields helper
    const validateForm = useCallback((data: Partial<LegalEntityCreatePayload>) => {
        const errors: Record<string, string> = {}
        if (!data.name?.trim()) {
            errors.name = t("errors.fieldRequired", "This field is required")
        }
        if (!data.type) {
            errors.type = t("errors.fieldRequired", "This field is required")
        }
        if (data.type === "company" && !data.tax_identification_number?.trim()) {
            errors.tax_identification_number = t("errors.fieldRequired", "This field is required")
        }
        if (!data.address_street?.trim()) {
            errors.address_street = t("errors.fieldRequired", "This field is required")
        }
        if (!data.address_street_number?.trim()) {
            errors.address_street_number = t("errors.fieldRequired", "This field is required")
        }
        if (!data.address_postal_code?.trim()) {
            errors.address_postal_code = t("errors.fieldRequired", "This field is required")
        }
        if (!data.address_country_id) {
            errors.address_country_id = t("errors.fieldRequired", "This field is required")
        }
        if (!data.address_city_id) {
            errors.address_city_id = t("errors.fieldRequired", "This field is required")
        }
        return errors
    }, [t])

    // Create entity
    const handleCreate = useCallback(async () => {
        const errors = validateForm(formData)
        if (Object.keys(errors).length > 0) {
            setValidationErrors(errors)
            return
        }
        setValidationErrors({})
        try {
            await createMutation.mutateAsync(formData as LegalEntityCreatePayload)
            setAddDialogOpen(false)
            setFormData({ type: "individual" })
        } catch (error) {
            console.error("Failed to create:", error)
        }
    }, [formData, createMutation, validateForm])

    // Update entity
    const handleUpdate = useCallback(async () => {
        if (!selectedEntity) return
        const errors = validateForm(formData)
        if (Object.keys(errors).length > 0) {
            setValidationErrors(errors)
            return
        }
        setValidationErrors({})
        try {
            await updateMutation.mutateAsync({
                internalId: selectedEntity.internal_id,
                payload: formData,
            })
            setEditDialogOpen(false)
            setSelectedEntity(null)
        } catch (error) {
            console.error("Failed to update:", error)
        }
    }, [selectedEntity, formData, updateMutation, validateForm])

    // Deactivate entity
    const handleDeactivate = useCallback(async () => {
        if (!selectedEntity) return
        try {
            await deactivateMutation.mutateAsync(selectedEntity.internal_id)
            setDeleteDialogOpen(false)
            setSelectedEntity(null)
        } catch (error) {
            console.error("Failed to deactivate:", error)
        }
    }, [selectedEntity, deactivateMutation])

    // Activate entity
    const handleActivate = useCallback(async (entity: LegalEntity) => {
        try {
            await activateMutation.mutateAsync(entity.internal_id)
        } catch (error) {
            console.error("Failed to activate:", error)
        }
    }, [activateMutation])

    // Get page title based on type filter
    const getPageTitle = () => {
        if (filters.type === "individual") return t("legalEntities.privatePeople", "Private Persons")
        if (filters.type === "company") return t("legalEntities.companies", "Companies")
        return t("legalEntities.title", "Legal Entities")
    }

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)]">
            {/* Main Content Area - Scrollable */}
            <div className="flex-1 overflow-auto p-3 pb-24 space-y-3">
                {/* Page Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-border pb-2">
                    <div>
                        <h1 className="text-base font-semibold tracking-tight text-gray-900 dark:text-foreground">{getPageTitle()}</h1>
                        <p className="text-xs text-muted-foreground">
                            {data?.total || 0} {t("legalEntities.totalEntries", "total entries")}
                        </p>
                    </div>
                    <Button onClick={handleAddClick} size="sm" className="h-7.5 px-3 text-xs gap-1.5 rounded-md shadow-xs">
                        <Plus className="h-3.5 w-3.5" />
                        {t("legalEntities.addNew", "Add New Legal Entity")}
                    </Button>
                </div>

                {/* Main Layout */}
                <div className="flex flex-col lg:flex-row relative lg:items-start">
                    {/* Left Sidebar (Mobile) */}
                    <div className="w-full lg:hidden shrink-0 order-2 mb-4">
                        <LegalEntityFiltersSidebar
                            filters={filters}
                            onTypeFilterChange={handleTypeFilter}
                            onStatusFilterChange={handleStatusFilter}
                            onCountryFilterChange={(value) => setFilters(prev => ({ ...prev, country_id: value, city_id: undefined, page: 1 }))}
                            onCityFilterChange={(value) => setFilters(prev => ({ ...prev, city_id: value, page: 1 }))}
                            onResetFilters={() => {
                                setFilters({
                                    page: 1,
                                    per_page: filters.per_page,
                                    type: typeFromUrl || undefined,
                                    status: statusFromUrl || undefined,
                                })
                            }}
                        />
                    </div>

                    {/* Left Sidebar (Desktop) */}
                    <div 
                        className={`hidden lg:block shrink-0 order-1 ${isDragging ? 'pointer-events-none' : ''}`}
                        style={{ width: `${panelWidth}px` }}
                    >
                        <LegalEntityFiltersSidebar
                            filters={filters}
                            onTypeFilterChange={handleTypeFilter}
                            onStatusFilterChange={handleStatusFilter}
                            onCountryFilterChange={(value) => setFilters(prev => ({ ...prev, country_id: value, city_id: undefined, page: 1 }))}
                            onCityFilterChange={(value) => setFilters(prev => ({ ...prev, city_id: value, page: 1 }))}
                            onResetFilters={() => {
                                setFilters({
                                    page: 1,
                                    per_page: filters.per_page,
                                    type: typeFromUrl || undefined,
                                    status: statusFromUrl || undefined,
                                })
                            }}
                        />
                    </div>

                    {/* Draggable Divider */}
                    <SplitViewDivider 
                        onDrag={handleDrag}
                        onDragStart={() => setIsDragging(true)}
                        onDragEnd={handleDragEnd}
                        className="hidden lg:flex order-2"
                        handlePosition="top"
                    />

                    {/* Right Content */}
                    <div className={`flex-1 min-w-0 order-1 lg:order-3 flex flex-col gap-3 mb-4 lg:mb-0 ${isDragging ? 'pointer-events-none' : ''}`}>
                        {/* Toolbar */}
                        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                            {/* Search bar */}
                            <div className="relative flex-1">
                                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    placeholder={t("legalEntities.searchPlaceholder", "Search across ID, name, address, email, phone, tax ID...")}
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
                        </div>

                        {/* Table */}
                        <div className="rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden shadow-xs">
                            <Table>
                                <TableHeader>
                                    <TableRow className="h-7 bg-gray-50/80 dark:bg-secondary hover:bg-gray-50/80 border-b border-gray-200 dark:border-border">
                                        <TableHead
                                            className="w-[80px] h-7 px-3 py-0.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
                                            onClick={() => handleSort('internal_id')}
                                        >
                                            <span className="flex items-center">
                                                {t("legalEntities.id", "ID")}
                                                {getSortIndicator("internal_id")}
                                            </span>
                                        </TableHead>
                                        <TableHead
                                            className="h-7 px-3 py-0.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
                                            onClick={() => handleSort('name')}
                                        >
                                            <span className="flex items-center">
                                                {t("legalEntities.name", "Name")}
                                                {getSortIndicator("name")}
                                            </span>
                                        </TableHead>
                                        <TableHead
                                            className="w-[120px] h-7 px-3 py-0.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
                                            onClick={() => handleSort('type')}
                                        >
                                            <span className="flex items-center">
                                                {t("legalEntities.type", "Type")}
                                                {getSortIndicator("type")}
                                            </span>
                                        </TableHead>
                                        <TableHead
                                            className="h-7 px-3 py-0.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
                                            onClick={() => handleSort('address_city_id')}
                                        >
                                            <span className="flex items-center">
                                                {t("legalEntities.city", "City")}
                                                {getSortIndicator("address_city_id")}
                                            </span>
                                        </TableHead>
                                        <TableHead
                                            className="w-[100px] h-7 px-3 py-0.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
                                            onClick={() => handleSort('status')}
                                        >
                                            <span className="flex items-center">
                                                {t("legalEntities.status", "Status")}
                                                {getSortIndicator("status")}
                                            </span>
                                        </TableHead>
                                        <TableHead className="w-[80px] h-7 px-3 py-0.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider text-right">{t("legalEntities.actions", "Actions")}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                                        <div className="flex flex-col items-center gap-2">
                                            <RefreshCw className="h-8 w-8 animate-spin opacity-20" />
                                            <span>{t("common.loading", "Loading...")}</span>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : data?.items && data.items.length > 0 ? (
                                data.items.map((entity) => (
                                    <TableRow
                                        key={entity.id}
                                        className="group cursor-pointer hover:bg-muted/50 transition-colors duration-150"
                                        onClick={() => handleEditClick(entity)}
                                    >
                                        <TableCell className="font-mono text-xs opacity-70">{entity.internal_id}</TableCell>
                                        <TableCell>
                                            <span className="font-medium text-foreground">
                                                {entity.name}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            {entity.type === "individual" ? (
                                                <Badge variant="secondary" className="bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 gap-1 border-blue-100 dark:border-blue-500/20">
                                                    <User className="h-3 w-3" />
                                                    {t("legalEntities.individual", "Individual")}
                                                </Badge>
                                            ) : (
                                                <Badge variant="secondary" className="bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400 gap-1 border-purple-100 dark:border-purple-500/20">
                                                    <Building2 className="h-3 w-3" />
                                                    {t("legalEntities.company", "Company")}
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">{entity.address_city_name || "-"}</TableCell>
                                        <TableCell>
                                            {entity.status === "active" ? (
                                                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                                                    {t("legalEntities.active", "Active")}
                                                </Badge>
                                            ) : (
                                                <Badge variant="secondary" className="bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-500/10 dark:text-zinc-400 dark:border-zinc-500/20">
                                                    {t("legalEntities.inactive", "Inactive")}
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                {entity.status === "active" ? (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            handleDeleteClick(entity)
                                                        }}
                                                        className="text-red-500 hover:bg-red-50 hover:text-red-600 dark:text-red-400 dark:hover:bg-red-900/20"
                                                        title={t("legalEntities.deactivate", "Deactivate")}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            handleActivate(entity)
                                                        }}
                                                        className="text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                                                        title={t("legalEntities.activate", "Activate")}
                                                    >
                                                        <RefreshCw className="h-4 w-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
                                        <div className="flex flex-col items-center gap-2">
                                            <Search className="h-10 w-10 opacity-10 mb-2" />
                                            <p>{t("legalEntities.noEntities", "No legal entities found.")}</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
            </div>
            </div>

            {/* Sticky Footer Pagination */}
            <StickyFooter>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground font-medium">
                    {t("common.showing", "Showing")}
                    <PerPageInput
                        value={filters.per_page || 20}
                        onChange={handlePerPageChange}
                        label=""
                    />
                    {t("common.of", "of")}
                    <span className="text-foreground">{data?.total || 0}</span>
                    {t("legalEntities.entities", "entities")}
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!data || data.page <= 1 || isFetching}
                        onClick={() => handlePageChange((data?.page ?? 1) - 1)}
                        className="h-9"
                    >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        {t("common.previous", "Previous")}
                    </Button>
                    <span className="text-sm text-muted-foreground px-2 font-medium flex items-center gap-1.5">
                        {t("common.page", "Page")}{" "}
                        <PageInput
                            currentPage={data?.page ?? 1}
                            totalPages={data?.pages ?? 1}
                            onPageChange={handlePageChange}
                            disabled={isFetching}
                        />
                        {" "}{t("common.of", "of")}{" "}
                        <span className="text-foreground">{data?.pages ?? 1}</span>
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!data || data.page >= data.pages || isFetching}
                        onClick={() => handlePageChange((data?.page ?? 1) + 1)}
                        className="h-9"
                    >
                        {t("common.next", "Next")}
                        <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                </div>
            </StickyFooter>

            {/* Add Dialog */}
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-xl">{t("legalEntities.addNew", "Add New Legal Entity")}</DialogTitle>
                        <DialogDescription>
                            {t("legalEntities.addDescription", "Fill in the details to create a new legal entity.")}
                        </DialogDescription>
                    </DialogHeader>
                    <EntityForm
                        data={formData}
                        onChange={setFormData}
                        isNew
                        errors={validationErrors}
                    />
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="ghost" onClick={() => {
                            setAddDialogOpen(false)
                            setValidationErrors({})
                        }}>
                            {t("common.cancel", "Cancel")}
                        </Button>
                        <Button onClick={handleCreate} disabled={createMutation.isPending} className="shadow-sm">
                            {createMutation.isPending ? t("common.creating", "Creating...") : t("legalEntities.create", "Create Legal Entity")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={editDialogOpen} onOpenChange={(open) => {
                setEditDialogOpen(open)
                if (!open) setValidationErrors({})
            }}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-xl">{t("legalEntities.editTitle", "Edit Legal Entity")}</DialogTitle>
                        <DialogDescription>
                            ID: <span className="font-mono text-xs">{selectedEntity?.internal_id}</span>
                        </DialogDescription>
                    </DialogHeader>
                    <EntityForm
                        data={formData}
                        onChange={setFormData}
                        errors={validationErrors}
                    />
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="ghost" onClick={() => {
                            setEditDialogOpen(false)
                            setValidationErrors({})
                        }}>
                            {t("common.cancel", "Cancel")}
                        </Button>
                        <Button onClick={handleUpdate} disabled={updateMutation.isPending} className="shadow-sm">
                            {updateMutation.isPending ? t("common.saving", "Saving...") : t("common.saveChanges", "Save Changes")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Deactivate Dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-xl text-red-600">{t("legalEntities.deactivateTitle", "Deactivate Legal Entity")}</DialogTitle>
                        <DialogDescription className="text-base py-4 text-foreground/80">
                            {t("legalEntities.deactivateConfirm", "Are you sure you want to deactivate")} <span className="font-bold underline">"{selectedEntity?.name}"</span>?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>
                            {t("common.cancel", "Cancel")}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeactivate}
                            disabled={deactivateMutation.isPending}
                            className="shadow-sm"
                        >
                            {deactivateMutation.isPending ? t("common.deactivating", "Deactivating...") : t("legalEntities.deactivate", "Deactivate")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

export default LegalEntitiesPage
