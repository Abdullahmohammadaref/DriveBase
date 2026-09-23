import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { ChevronDown, ChevronRight, Loader2, Plus, Search, Trash2, X } from "lucide-react"
import api from "@/lib/api"
import { Input } from "@/components/ui/input"
import { FilterSelect } from "@/components/ui/filter-select"
import { SortMenuButton } from "@/components/ui/SortMenuButton"

interface ChoiceItem {
    id: number
    name: string
    percentage?: number
    is_protected?: boolean
}

interface ChoiceType {
    name: string
    displayName: string
    active: ChoiceItem[]
    inactive: ChoiceItem[]
}

interface MakeWithModels {
    id: number
    name: string
    models_active: ChoiceItem[]
    models_inactive: ChoiceItem[]
}

interface CategoryWithSubcategories {
    id: number
    name: string
    subs_active: ChoiceItem[]
    subs_inactive: ChoiceItem[]
}

interface CountryWithCities {
    id: number
    name: string
    cities_active: ChoiceItem[]
    cities_inactive: ChoiceItem[]
}

interface ChoicesManagementData {
    choice_types: Record<string, ChoiceType>
    makes_with_models: MakeWithModels[]
    manufacturers_with_models?: MakeWithModels[]
    categories_with_subcategories: CategoryWithSubcategories[]
    countries_with_cities: CountryWithCities[]
}

type StatusFilterValue = "all" | "active" | "inactive"

const TAB_ORDER = [
    "make",
    "vehicle_model",
    "category",
    "subcategory",
    "country",
    "city",
    "vehicle_type",
    "body_type",
    "color",
    "fuel_type",
    "damage_type",
    "doors",
    "payment_method",
    "tax_percentage",
    "currency",
    "key_number",
] as const

type SortValue = "name" | "status" | "tax_amount"

const ACTIVE_ITEM_CLASS =
    "flex h-[34px] items-center justify-between rounded-md border border-gray-200 dark:border-border bg-white dark:bg-card px-3 text-xs shadow-2xs transition-all hover:border-gray-300 dark:hover:border-border hover:bg-gray-50/50 dark:hover:bg-muted/30 group"
const INACTIVE_ITEM_CLASS =
    "flex h-[34px] items-center justify-between rounded-md border border-gray-200/60 dark:border-border/60 bg-gray-50/60 dark:bg-zinc-900/30 px-3 text-xs opacity-75 transition-all hover:opacity-100 group"

function matchesSearch(name: string | undefined | null, searchValue: string) {
    if (!name) return false
    return name.toLowerCase().includes(searchValue.toLowerCase())
}

export default function ChoicesManagementPage() {
    const { t } = useTranslation()
    const queryClient = useQueryClient()

    const [activeTab, setActiveTab] = useState<string>("make")
    const [expandedMakes, setExpandedMakes] = useState<Set<number>>(new Set())
    const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set())
    const [expandedCountries, setExpandedCountries] = useState<Set<number>>(new Set())
    const [searchValue, setSearchValue] = useState("")
    const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all")
    const [sortBy, setSortBy] = useState<SortValue>("name")
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc")

    const [modalOpen, setModalOpen] = useState(false)
    const [modalMode, setModalMode] = useState<"add" | "edit">("add")
    const [modalEditId, setModalEditId] = useState<number | null>(null)
    const [modalChoiceType, setModalChoiceType] = useState("")
    const [modalTitle, setModalTitle] = useState("")
    const [modalName, setModalName] = useState("")
    const [modalPercentage, setModalPercentage] = useState("")
    const [modalParentId, setModalParentId] = useState<number | null>(null)
    const [modalError, setModalError] = useState<string | null>(null)

    const { data, isLoading, error } = useQuery<ChoicesManagementData>({
        queryKey: ["choices-management"],
        queryFn: async () => {
            const response = await api.get("/choices/management")
            return response.data
        },
    })

    const choiceTypes = data?.choice_types ?? {}
    const makesWithModels = data?.makes_with_models ?? data?.manufacturers_with_models ?? []
    const categoriesWithSubcategories = data?.categories_with_subcategories ?? []
    const countriesWithCities = data?.countries_with_cities ?? []

    const addMutation = useMutation({
        mutationFn: async (params: {
            choiceType: string
            name: string
            percentage?: string
            parentId?: number | null
        }) => {
            const formData = new FormData()
            formData.append("name", params.name)

            if (params.choiceType === "tax_percentage" && params.percentage) {
                formData.append("percentage", params.percentage)
            }
            if (params.choiceType === "vehicle_model" && params.parentId) {
                formData.append("make_id", params.parentId.toString())
            }
            if (params.choiceType === "subcategory" && params.parentId) {
                formData.append("category_id", params.parentId.toString())
            }
            if (params.choiceType === "city" && params.parentId) {
                formData.append("country_id", params.parentId.toString())
            }

            const response = await api.post(`/choices/${params.choiceType}`, formData, {
                headers: { "Content-Type": "multipart/form-data" },
            })
            return response.data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["choices-management"] })
            queryClient.invalidateQueries({ queryKey: ["choices"] })
            closeModal()
        },
        onError: (error: any) => {
            console.error("Add failed:", error)
            const message = error.response?.data?.detail || error.response?.data?.message || t("choices.errorAdd", "Failed to add choice.")
            setModalError(message)
        },
    })
    const updateMutation = useMutation({
        mutationFn: async (params: {
            choiceType: string
            choiceId: number
            name: string
            percentage?: string
        }) => {
            const payload = {
                name: params.name,
                ...(params.percentage && { percentage: parseFloat(params.percentage) })
            }
            const response = await api.patch(`/choices/${params.choiceType}/${params.choiceId}`, payload)
            return response.data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["choices-management"] })
            queryClient.invalidateQueries({ queryKey: ["choices"] })
            closeModal()
        },
        onError: (error: any) => {
            console.error("Update failed:", error)
            const message = error.response?.data?.detail || error.response?.data?.message || t("choices.updateError", "Failed to update choice.")
            setModalError(message)
        },
    })

    const deactivateMutation = useMutation({
        mutationFn: async (params: { choiceType: string; choiceId: number }) => {
            const response = await api.post(`/choices/${params.choiceType}/${params.choiceId}/deactivate`)
            return response.data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["choices-management"] })
            queryClient.invalidateQueries({ queryKey: ["choices"] })
        },
        onError: (error) => {
            console.error("Deactivation failed:", error)
            alert(t("choices.deactivateError", "Failed to deactivate. This item may be in use by an active vehicle or transaction."))
        },
    })

    const reactivateMutation = useMutation({
        mutationFn: async (params: { choiceType: string; choiceId: number }) => {
            const response = await api.post(`/choices/${params.choiceType}/${params.choiceId}/reactivate`)
            return response.data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["choices-management"] })
            queryClient.invalidateQueries({ queryKey: ["choices"] })
        },
        onError: (error) => {
            console.error("Reactivation failed:", error)
            alert(t("choices.reactivateError", "Failed to reactivate. Please try again."))
        },
    })

    const normalizedSearch = searchValue.trim().toLowerCase()

    const sortItems = <T extends { name: string; is_active?: boolean; percentage?: number }>(items: T[]) =>
        [...(items || [])].sort((a, b) => {
            if (sortBy === "status") {
                const statusA = a.is_active === false ? 0 : 1
                const statusB = b.is_active === false ? 0 : 1
                return sortOrder === "asc" ? statusA - statusB : statusB - statusA
            }
            if (sortBy === "tax_amount") {
                const valA = a.percentage ?? 0
                const valB = b.percentage ?? 0
                return sortOrder === "asc" ? valA - valB : valB - valA
            }
            
            // Numeric sorting for key numbers to prevent e.g. "10" coming before "2"
            if (activeTab === "key_number") {
                const numA = parseInt(a.name, 10)
                const numB = parseInt(b.name, 10)
                if (!isNaN(numA) && !isNaN(numB)) {
                    return sortOrder === "asc" ? numA - numB : numB - numA
                }
            }

            return sortOrder === "asc"
                ? a.name.localeCompare(b.name)
                : b.name.localeCompare(a.name)
        })

    const filterItems = <T extends { name: string }>(items: T[]) => {
        if (!normalizedSearch) {
            return items || []
        }
        return (items || []).filter((item) => matchesSearch(item.name, normalizedSearch))
    }

    const getTabDisplayName = (key: string) => {
        if (key === "make") return t("choices.manufacturers", "Manufacturers")
        if (key === "vehicle_model") return t("choices.manufacturerModels", "Manufacturer Models")
        if (key === "subcategory") return t("choices.subcategories", "Subcategories")
        if (key === "country") return t("choices.countries", "Countries")
        if (key === "city") return t("choices.cities", "Cities")
        if (key === "key_number") return t("choices.keyNumbers", "Key Numbers")
        return choiceTypes[key]?.name || key
    }

    const getSortOptions = () => {
        const options = [
            { 
                value: "name", 
                label: activeTab === "key_number" 
                    ? t("choices.sortNumber", "Number") 
                    : t("choices.sortName", "Name") 
            },
            { value: "status", label: t("choices.sortStatus", "Status") },
        ]
        if (activeTab === "tax_percentage") {
            options.push({ value: "tax_amount", label: t("choices.sortTaxAmount", "Tax Amount") })
        }
        return options
    }

    // Reset sort when switching tabs if current sort is not applicable
    const handleTabChange = (tab: string) => {
        setActiveTab(tab)
        if (tab !== "tax_percentage" && sortBy === "tax_amount") {
            setSortBy("name")
        }
    }

    const openAddModal = (choiceType: string, title: string, parentId: number | null = null) => {
        setModalMode("add")
        setModalEditId(null)
        setModalChoiceType(choiceType)
        setModalTitle(title)
        setModalName("")
        setModalPercentage("")
        setModalParentId(parentId)
        setModalOpen(true)
    }

    const openEditModal = (choiceType: string, item: ChoiceItem) => {
        setModalMode("edit")
        setModalEditId(item.id)
        setModalChoiceType(choiceType)
        setModalTitle(t("choices.editOption", "Edit Option"))
        setModalName(item.name)
        setModalPercentage(item.percentage?.toString() || "")
        setModalParentId(null)
        setModalOpen(true)
    }

    const closeModal = () => {
        setModalOpen(false)
        setModalMode("add")
        setModalEditId(null)
        setModalName("")
        setModalPercentage("")
        setModalParentId(null)
        setModalError(null)
    }

    const handleAddChoice = (event: React.FormEvent) => {
        event.preventDefault()
        if (!modalName.trim()) {
            return
        }

        if (modalChoiceType === "key_number") {
            const val = Number(modalName.trim())
            if (!Number.isInteger(val) || val <= 0) {
                setModalError(t("choices.keyNumberError", "Key number must be a positive integer without zero."))
                return
            }
        }

        setModalError(null)

        if (modalMode === "edit" && modalEditId) {
            updateMutation.mutate({
                choiceType: modalChoiceType,
                choiceId: modalEditId,
                name: modalName.trim(),
                percentage: modalPercentage,
            })
        } else {
            addMutation.mutate({
                choiceType: modalChoiceType,
                name: modalName.trim(),
                percentage: modalPercentage,
                parentId: modalParentId,
            })
        }
    }

    const handleDeactivate = (choiceType: string, choiceId: number) => {
        deactivateMutation.mutate({ choiceType, choiceId })
    }

    const handleReactivate = (choiceType: string, choiceId: number) => {
        reactivateMutation.mutate({ choiceType, choiceId })
    }

    const visibleTabKeys = TAB_ORDER.filter(
        (key) => {
            if (key === "vehicle_model") return true
            if (key === "subcategory") return true
            if (key === "city") return true
            return Boolean(choiceTypes[key])
        }
    )

    const filteredMakesWithModels = sortItems(makesWithModels)
        .map((makeGroup) => {
            const parentMatches = normalizedSearch
                ? matchesSearch(makeGroup.name, normalizedSearch)
                : true

            const activeModelsBase = statusFilter === "inactive" ? [] : sortItems(makeGroup.models_active)
            const inactiveModelsBase = statusFilter === "active" ? [] : sortItems(makeGroup.models_inactive)

            const activeModels = parentMatches ? activeModelsBase : filterItems(activeModelsBase)
            const inactiveModels = parentMatches ? inactiveModelsBase : filterItems(inactiveModelsBase)

            const isVisible = !normalizedSearch || parentMatches || activeModels.length > 0 || inactiveModels.length > 0

            return {
                ...makeGroup,
                filteredActive: activeModels,
                filteredInactive: inactiveModels,
                isVisible,
            }
        })
        .filter((makeGroup) => makeGroup.isVisible)

    const filteredCategoriesWithSubcategories = sortItems(categoriesWithSubcategories)
        .map((categoryGroup) => {
            const parentMatches = normalizedSearch
                ? matchesSearch(categoryGroup.name, normalizedSearch)
                : true

            const activeSubsBase = statusFilter === "inactive" ? [] : sortItems(categoryGroup.subs_active)
            const inactiveSubsBase = statusFilter === "active" ? [] : sortItems(categoryGroup.subs_inactive)

            const activeSubs = parentMatches ? activeSubsBase : filterItems(activeSubsBase)
            const inactiveSubs = parentMatches ? inactiveSubsBase : filterItems(inactiveSubsBase)

            const isVisible = !normalizedSearch || parentMatches || activeSubs.length > 0 || inactiveSubs.length > 0

            return {
                ...categoryGroup,
                filteredActive: activeSubs,
                filteredInactive: inactiveSubs,
                isVisible,
            }
        })
        .filter((categoryGroup) => categoryGroup.isVisible)

    const filteredCountriesWithCities = sortItems(countriesWithCities)
        .map((countryGroup) => {
            const parentMatches = normalizedSearch
                ? matchesSearch(countryGroup.name, normalizedSearch)
                : true

            const activeCitiesBase = statusFilter === "inactive" ? [] : sortItems(countryGroup.cities_active)
            const inactiveCitiesBase = statusFilter === "active" ? [] : sortItems(countryGroup.cities_inactive)

            const activeCities = parentMatches ? activeCitiesBase : filterItems(activeCitiesBase)
            const inactiveCities = parentMatches ? inactiveCitiesBase : filterItems(inactiveCitiesBase)

            const isVisible = !normalizedSearch || parentMatches || activeCities.length > 0 || inactiveCities.length > 0

            return {
                ...countryGroup,
                filteredActive: activeCities,
                filteredInactive: inactiveCities,
                isVisible,
            }
        })
        .filter((countryGroup) => countryGroup.isVisible)

    const renderChoiceTypeContent = (typeKey: string, typeData: ChoiceType | undefined) => {
        if (!typeData) return null
        const activeItems = statusFilter === "inactive" ? [] : sortItems(filterItems(typeData.active || []).map(i => ({ ...i, is_active: true })))
        const inactiveItems = statusFilter === "active" ? [] : sortItems(filterItems(typeData.inactive || []).map(i => ({ ...i, is_active: false })))
        const hasVisibleItems = activeItems.length > 0 || inactiveItems.length > 0

        return (
            <div>
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-medium text-foreground">{getTabDisplayName(typeKey)}</h3>
                    <button
                        type="button"
                        onClick={() => openAddModal(typeKey, `${t("choices.addNew", "Add New")} ${getTabDisplayName(typeKey)}`)}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >
                        <Plus className="h-4 w-4" />
                        {t("choices.addNew", "Add New")}
                    </button>
                </div>

                {!hasVisibleItems ? (
                    <p className="text-sm italic text-muted-foreground">
                        {normalizedSearch
                            ? t("choices.noMatchingItems", "No matching items found.")
                            : t("choices.noItems", "No items available.")}
                    </p>
                ) : (
                    <div className="space-y-6">
                        {statusFilter !== "inactive" && (
                            <div>
                                <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
                                    {t("choices.active", "Active")} ({activeItems.length})
                                </h4>
                                <div className="space-y-2">
                                    {activeItems.length > 0 ? (
                                        activeItems.map((item) => (
                                            <div key={item.id} className={ACTIVE_ITEM_CLASS}>
                                                <button
                                                    onClick={() => openEditModal(typeKey, item)}
                                                    className="font-medium text-foreground hover:text-primary transition-colors text-left flex-1"
                                                >
                                                    {item.name}
                                                    {item.percentage !== undefined && (
                                                        <span className="ml-2 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                                            {item.percentage}%
                                                        </span>
                                                    )}
                                                    {(item as any).vehicle_name && (
                                                        <span className="ml-2 text-xs text-muted-foreground italic">
                                                            — {(item as any).vehicle_name}
                                                        </span>
                                                    )}
                                                </button>
                                                {item.is_protected ? (
                                                    <span className="text-xs italic text-muted-foreground">
                                                        {t("choices.protected", "Protected")}
                                                    </span>
                                                ) : (
                                                    <button
                                                        onClick={() => handleDeactivate(typeKey, item.id)}
                                                        disabled={deactivateMutation.isPending}
                                                        className="text-xs font-semibold text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 disabled:opacity-50 transition-colors"
                                                    >
                                                        {t("choices.deactivate", "Deactivate")}
                                                    </button>
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-sm italic text-muted-foreground">
                                            {t("choices.noActiveItems", "No active items")}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {statusFilter !== "active" && (
                            <div>
                                <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
                                    {t("choices.inactive", "Inactive")} ({inactiveItems.length})
                                </h4>
                                <div className="space-y-2">
                                    {inactiveItems.length > 0 ? (
                                        inactiveItems.map((item) => (
                                            <div key={item.id} className={INACTIVE_ITEM_CLASS}>
                                                <button
                                                    onClick={() => openEditModal(typeKey, item)}
                                                    className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors text-left flex-1"
                                                >
                                                    {item.name}
                                                </button>
                                                <button
                                                    onClick={() => handleReactivate(typeKey, item.id)}
                                                    disabled={reactivateMutation.isPending}
                                                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300 disabled:opacity-50 transition-colors"
                                                >
                                                    {t("choices.reactivate", "Reactivate")}
                                                </button>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-sm italic text-muted-foreground">
                                            {t("choices.noInactiveItems", "No inactive items")}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        )
    }

    const renderVehicleModelContent = () => (
        <div>
            <div className="mb-4">
                <h3 className="text-lg font-medium text-foreground">
                    {t("choices.manufacturerModels", "Manufacturer Models")}
                </h3>
                <p className="text-sm text-muted-foreground">
                    {t("choices.selectManufacturerToManage", "Select a manufacturer to manage its models")}
                </p>
            </div>

            {filteredMakesWithModels.length > 0 ? (
                <div className="space-y-2">
                    {filteredMakesWithModels.map((makeGroup) => {
                        const isExpanded = expandedMakes.has(makeGroup.id)
                        const activeModels = makeGroup.filteredActive || []
                        const inactiveModels = makeGroup.filteredInactive || []
                        const visibleChildrenCount = activeModels.length + inactiveModels.length

                        return (
                            <div key={makeGroup.id} className="mb-4 rounded-lg border border-border">
                                <button
                                    onClick={() =>
                                        setExpandedMakes((previous) => {
                                            const next = new Set(previous)
                                            if (next.has(makeGroup.id)) {
                                                next.delete(makeGroup.id)
                                            } else {
                                                next.add(makeGroup.id)
                                            }
                                            return next
                                        })
                                    }
                                    className="flex w-full items-center justify-between rounded-lg bg-muted/50 px-4 py-3 text-left hover:bg-muted"
                                >
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            openEditModal("make", makeGroup as any)
                                        }}
                                        className="font-medium text-foreground hover:text-primary transition-colors text-left"
                                    >
                                        {makeGroup.name}
                                    </button>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-muted-foreground">
                                            {visibleChildrenCount} {t("choices.visibleItems", "visible")}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                handleDeactivate(activeTab === "vehicle_model" ? "make" : "category", activeTab === "vehicle_model" ? (makeGroup as any).id : (makeGroup as any).id)
                                            }}
                                            disabled={deactivateMutation.isPending}
                                            className="h-7 w-7 flex items-center justify-center rounded-md text-rose-500 hover:bg-rose-500/10 transition-colors"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                        {isExpanded ? (
                                            <ChevronDown className="h-5 w-5" />
                                        ) : (
                                            <ChevronRight className="h-5 w-5" />
                                        )}
                                    </div>
                                </button>

                                {isExpanded && (
                                    <div className="border-t border-border px-4 py-3">
                                        <div className="mb-3 flex justify-end">
                                            <button
                                                onClick={() =>
                                                    openAddModal(
                                                        "vehicle_model",
                                                        `${t("choices.addModelFor", "Add Model for")} ${makeGroup.name}`,
                                                        makeGroup.id
                                                    )
                                                }
                                                className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                                            >
                                                <Plus className="h-3 w-3" />
                                                {t("choices.addModel", "Add Model")}
                                            </button>
                                        </div>

                                        <div className="space-y-2">
                                            {statusFilter !== "inactive" &&
                                                makeGroup.filteredActive.map((model) => (
                                                    <div key={model.id} className={ACTIVE_ITEM_CLASS}>
                                                        <button
                                                            onClick={() => openEditModal("vehicle_model", model)}
                                                            className="text-sm font-medium text-foreground hover:text-primary transition-colors text-left flex-1"
                                                        >
                                                            {model.name}
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeactivate("vehicle_model", model.id)}
                                                            disabled={deactivateMutation.isPending}
                                                            className="text-xs font-semibold text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 disabled:opacity-50 transition-colors"
                                                        >
                                                            {t("choices.deactivate", "Deactivate")}
                                                        </button>
                                                    </div>
                                                ))}

                                            {statusFilter !== "active" &&
                                                makeGroup.filteredInactive.map((model) => (
                                                    <div key={model.id} className={INACTIVE_ITEM_CLASS}>
                                                        <button
                                                            onClick={() => openEditModal("vehicle_model", model)}
                                                            className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors text-left flex-1"
                                                        >
                                                            <span className="line-through">{model.name}</span>
                                                        </button>
                                                        <button
                                                            onClick={() => handleReactivate("vehicle_model", model.id)}
                                                            disabled={reactivateMutation.isPending}
                                                            className="text-xs text-green-600 hover:text-green-500 disabled:opacity-50"
                                                        >
                                                            {t("choices.reactivate", "Reactivate")}
                                                        </button>
                                                    </div>
                                                ))}

                                            {visibleChildrenCount === 0 && (
                                                <p className="text-sm italic text-muted-foreground">
                                                    {normalizedSearch
                                                        ? t("choices.noMatchingItems", "No matching items found.")
                                                        : t("choices.noModels", "No models")}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            ) : (
                <p className="text-sm italic text-muted-foreground">
                    {normalizedSearch
                        ? t("choices.noMatchingItems", "No matching items found.")
                        : t("choices.noManufacturers", "No manufacturers found. Please add manufacturers first.")}
                </p>
            )}
        </div>
    )

    const renderSubcategoriesContent = () => (
        <div>
            <div className="mb-4">
                <h3 className="text-lg font-medium text-foreground">
                    {t("choices.subcategories", "Subcategories")}
                </h3>
                <p className="text-sm text-muted-foreground">
                    {t("choices.selectCategoryToManage", "Select a category to manage its subcategories")}
                </p>
            </div>

            {filteredCategoriesWithSubcategories.length > 0 ? (
                <div className="space-y-2">
                    {filteredCategoriesWithSubcategories.map((categoryGroup) => {
                        const isExpanded = expandedCategories.has(categoryGroup.id)
                        const activeSubs = categoryGroup.filteredActive || []
                        const inactiveSubs = categoryGroup.filteredInactive || []
                        const visibleChildrenCount = activeSubs.length + inactiveSubs.length

                        return (
                            <div key={categoryGroup.id} className="mb-4 rounded-lg border border-border">
                                <button
                                    onClick={() =>
                                        setExpandedCategories((previous) => {
                                            const next = new Set(previous)
                                            if (next.has(categoryGroup.id)) {
                                                next.delete(categoryGroup.id)
                                            } else {
                                                next.add(categoryGroup.id)
                                            }
                                            return next
                                        })
                                    }
                                    className="flex w-full items-center justify-between rounded-lg bg-muted/50 px-4 py-3 text-left hover:bg-muted"
                                >
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            openEditModal("category", categoryGroup as any)
                                        }}
                                        className="font-medium text-foreground hover:text-primary transition-colors text-left"
                                    >
                                        {categoryGroup.name}
                                    </button>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-muted-foreground">
                                            {visibleChildrenCount} {t("choices.visibleItems", "visible")}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                handleDeactivate("category", categoryGroup.id)
                                            }}
                                            disabled={deactivateMutation.isPending}
                                            className="h-7 w-7 flex items-center justify-center rounded-md text-rose-500 hover:bg-rose-500/10 transition-colors"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                        {isExpanded ? (
                                            <ChevronDown className="h-5 w-5" />
                                        ) : (
                                            <ChevronRight className="h-5 w-5" />
                                        )}
                                    </div>
                                </button>

                                {isExpanded && (
                                    <div className="border-t border-border px-4 py-3">
                                        <div className="mb-3 flex justify-end">
                                            <button
                                                onClick={() =>
                                                    openAddModal(
                                                        "subcategory",
                                                        `${t("choices.addSubcategoryFor", "Add Subcategory for")} ${categoryGroup.name}`,
                                                        categoryGroup.id
                                                    )
                                                }
                                                className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                                            >
                                                <Plus className="h-3 w-3" />
                                                {t("choices.addSubcategory", "Add Subcategory")}
                                            </button>
                                        </div>

                                        <div className="space-y-2">
                                            {statusFilter !== "inactive" &&
                                                categoryGroup.filteredActive.map((sub) => (
                                                    <div key={sub.id} className={ACTIVE_ITEM_CLASS}>
                                                        <button
                                                            onClick={() => openEditModal("subcategory", sub)}
                                                            className="text-sm font-medium text-foreground hover:text-primary transition-colors text-left flex-1"
                                                        >
                                                            {sub.name}
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeactivate("subcategory", sub.id)}
                                                            disabled={deactivateMutation.isPending}
                                                            className="text-xs font-semibold text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 disabled:opacity-50 transition-colors"
                                                        >
                                                            {t("choices.deactivate", "Deactivate")}
                                                        </button>
                                                    </div>
                                                ))}

                                            {statusFilter !== "active" &&
                                                categoryGroup.filteredInactive.map((sub) => (
                                                    <div key={sub.id} className={INACTIVE_ITEM_CLASS}>
                                                        <button
                                                            onClick={() => openEditModal("subcategory", sub)}
                                                            className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors text-left flex-1"
                                                        >
                                                            <span className="line-through">{sub.name}</span>
                                                        </button>
                                                        <button
                                                            onClick={() => handleReactivate("subcategory", sub.id)}
                                                            disabled={reactivateMutation.isPending}
                                                            className="text-xs font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300 disabled:opacity-50 transition-colors"
                                                        >
                                                            {t("choices.reactivate", "Reactivate")}
                                                        </button>
                                                    </div>
                                                ))}

                                            {visibleChildrenCount === 0 && (
                                                <p className="text-sm italic text-muted-foreground">
                                                    {normalizedSearch
                                                        ? t("choices.noMatchingItems", "No matching items found.")
                                                        : t("choices.noSubcategories", "No subcategories")}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            ) : (
                <p className="text-sm italic text-muted-foreground">
                    {normalizedSearch
                        ? t("choices.noMatchingItems", "No matching items found.")
                        : t("choices.noCategories", "No categories found. Please add categories first.")}
                </p>
            )}
        </div>
    )

    const renderCitiesContent = () => (
        <div className="space-y-4">
            <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-medium text-foreground">{t("choices.countriesAndCities", "Countries & Cities")}</h3>
                <button
                    onClick={() => openAddModal("country", t("choices.addNewCountry", "Add New Country"))}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 shadow-sm transition-colors"
                >
                    <Plus className="h-4 w-4" />
                    {t("choices.addCountry", "Add Country")}
                </button>
            </div>

            {filteredCountriesWithCities.length > 0 ? (
                <div className="rounded-lg border border-border bg-card shadow-sm p-4">
                    {filteredCountriesWithCities.map((countryGroup) => {
                        const isExpanded = expandedCountries.has(countryGroup.id)
                        const activeCities = countryGroup.filteredActive || []
                        const inactiveCities = countryGroup.filteredInactive || []
                        const visibleChildrenCount = activeCities.length + inactiveCities.length

                        return (
                            <div key={`country-${countryGroup.id}`} className="mb-4 rounded-lg border border-border">
                                <button
                                    onClick={() =>
                                        setExpandedCountries((previous) => {
                                            const next = new Set(previous)
                                            if (next.has(countryGroup.id)) {
                                                next.delete(countryGroup.id)
                                            } else {
                                                next.add(countryGroup.id)
                                            }
                                            return next
                                        })
                                    }
                                    className="flex w-full items-center justify-between rounded-lg bg-muted/50 px-4 py-3 text-left hover:bg-muted"
                                >
                                    <div className="flex flex-1 items-center gap-4">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                openEditModal("country", countryGroup as any)
                                            }}
                                            className="font-medium text-foreground hover:text-primary transition-colors text-left"
                                        >
                                            {countryGroup.name}
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-muted-foreground">
                                            {visibleChildrenCount} {t("choices.visibleCities", "visible")}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                handleDeactivate("country", countryGroup.id)
                                            }}
                                            disabled={deactivateMutation.isPending}
                                            className="h-7 w-7 flex items-center justify-center rounded-md text-rose-500 hover:bg-rose-500/10 transition-colors"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                        {isExpanded ? (
                                            <ChevronDown className="h-5 w-5" />
                                        ) : (
                                            <ChevronRight className="h-5 w-5" />
                                        )}
                                    </div>
                                </button>

                                {isExpanded && (
                                    <div className="border-t border-border px-4 py-3">
                                        <div className="mb-3 flex justify-end">
                                            <button
                                                onClick={() =>
                                                    openAddModal(
                                                        "city",
                                                        `${t("choices.addCityFor", "Add City for")} ${countryGroup.name}`,
                                                        countryGroup.id
                                                    )
                                                }
                                                className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                                            >
                                                <Plus className="h-3 w-3" />
                                                {t("choices.addCity", "Add City")}
                                            </button>
                                        </div>

                                        <div className="space-y-2">
                                            {statusFilter !== "inactive" &&
                                                activeCities.map((city) => (
                                                    <div key={`active-city-${city.id}`} className={ACTIVE_ITEM_CLASS}>
                                                        <button
                                                            onClick={() => openEditModal("city", city as any)}
                                                            className="text-sm font-medium text-foreground hover:text-primary transition-colors text-left flex-1"
                                                        >
                                                            {city.name}
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeactivate("city", city.id)}
                                                            disabled={deactivateMutation.isPending}
                                                            className="text-xs font-semibold text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 disabled:opacity-50 transition-colors"
                                                        >
                                                            {t("choices.deactivate", "Deactivate")}
                                                        </button>
                                                    </div>
                                                ))}

                                            {statusFilter !== "active" &&
                                                inactiveCities.map((city) => (
                                                    <div key={`inactive-city-${city.id}`} className={INACTIVE_ITEM_CLASS}>
                                                        <button
                                                            onClick={() => openEditModal("city", city as any)}
                                                            className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors text-left flex-1"
                                                        >
                                                            <span className="line-through">{city.name}</span>
                                                        </button>
                                                        <button
                                                            onClick={() => handleReactivate("city", city.id)}
                                                            disabled={reactivateMutation.isPending}
                                                            className="text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-500 dark:hover:text-emerald-400 disabled:opacity-50 transition-colors"
                                                        >
                                                            {t("choices.activate", "Activate")}
                                                        </button>
                                                    </div>
                                                ))}
                                                
                                            {visibleChildrenCount === 0 && (
                                                <p className="text-sm italic text-muted-foreground py-2 text-center">
                                                    {normalizedSearch
                                                        ? t("choices.noMatchingCities", "No matching cities found for this country.")
                                                        : t("choices.noCitiesInCountry", "No cities found in this country.")}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            ) : (
                <p className="text-sm italic text-muted-foreground">
                    {normalizedSearch
                        ? t("choices.noMatchingItems", "No matching items found.")
                        : t("choices.noCountries", "No countries found. Please add countries first.")}
                </p>
            )}
        </div>
    )

    if (isLoading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    if (error || !data) {
        return (
            <div className="p-6">
                <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-destructive">
                    {t("choices.errorLoading", "Failed to load choices data")}
                </div>
            </div>
        )
    }

    return (
        <div className="p-3 md:p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-border pb-2">
                <div>
                    <h1 className="text-base font-semibold tracking-tight text-gray-900 dark:text-foreground">
                        {t("choices.title", "Manage Choices")}
                    </h1>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-3 h-[calc(100vh-10rem)] min-h-[500px]">
                {/* Left Sidebar (Tabs) */}
                <div className="w-full md:w-56 flex-shrink-0 flex flex-col rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden shadow-xs">
                    <div className="px-3 py-2 border-b border-gray-200 dark:border-border bg-gray-50/50 dark:bg-muted/30">
                        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-700 dark:text-foreground">Categories</h3>
                    </div>
                    <nav className="flex-1 overflow-y-auto p-1.5 space-y-0.5" aria-label="Tabs">
                        {visibleTabKeys.map((key) => (
                            <button
                                key={key}
                                onClick={() => handleTabChange(key)}
                                className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === key
                                    ? "bg-secondary font-semibold text-heading"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                    }`}
                            >
                                {getTabDisplayName(key)}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Right Content Area */}
                <div className="flex-1 flex flex-col min-w-0 rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden shadow-xs">
                    {/* Sticky Header with Search and Filters */}
                    <div className="sticky top-0 z-10 border-b border-gray-200 dark:border-border bg-white/95 dark:bg-card/95 backdrop-blur-xs p-2.5">
                        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
                            <div className="relative flex-1">
                                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={searchValue}
                                    onChange={(event) => setSearchValue(event.target.value)}
                                    placeholder={t("choices.searchPlaceholder", "Search choices in this tab...")}
                                    className="pl-8 pr-8 h-8 text-xs"
                                />
                                {searchValue && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchValue("")}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>

                            <div className="w-full lg:w-48">
                                <FilterSelect
                                    options={[
                                        { value: "active", label: t("choices.active", "Active") },
                                        { value: "inactive", label: t("choices.inactive", "Inactive") },
                                    ]}
                                    value={statusFilter === "all" ? undefined : statusFilter}
                                    onChange={(value) => setStatusFilter((value as StatusFilterValue | undefined) ?? "all")}
                                    placeholder={t("choices.allStatuses", "All statuses")}
                                    allLabel={t("choices.allStatuses", "All statuses")}
                                    searchPlaceholder={t("choices.searchStatuses", "Search statuses...")}
                                />
                            </div>

                            <SortMenuButton
                                options={getSortOptions()}
                                sort={sortBy}
                                order={sortOrder}
                                onSortChange={(value) => setSortBy(value as SortValue)}
                                onOrderChange={setSortOrder}
                            />
                        </div>
                    </div>

                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto p-4">
                        {activeTab === "vehicle_model"
                            ? renderVehicleModelContent()
                            : activeTab === "subcategory"
                                ? renderSubcategoriesContent()
                                : activeTab === "city"
                                    ? renderCitiesContent()
                                    : choiceTypes[activeTab]
                                        ? renderChoiceTypeContent(activeTab, choiceTypes[activeTab])
                                        : null}
                    </div>
                </div>
            </div>

            {modalOpen && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex min-h-screen items-center justify-center p-4">
                        <div className="fixed inset-0 bg-black/50" onClick={closeModal} />
                        <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
                            <button
                                onClick={closeModal}
                                className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
                            >
                                <X className="h-5 w-5" />
                            </button>

                            <h3 className="mb-4 text-lg font-semibold text-foreground">{modalTitle}</h3>

                            <form onSubmit={handleAddChoice}>
                                <div className="mb-4">
                                    <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                                        {modalChoiceType === "key_number"
                                            ? t("choices.number", "Number")
                                            : t("choices.name", "Name")}
                                    </label>
                                    <input
                                        type="text"
                                        value={modalName}
                                        onChange={(event) => {
                                            setModalName(event.target.value)
                                            setModalError(null)
                                        }}
                                        required
                                        className={`w-full rounded-lg border border-input bg-transparent px-4 py-2.5 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 ${modalError ? 'border-destructive' : ''}`}
                                        placeholder={modalChoiceType === "key_number"
                                            ? t("choices.enterNumber", "Enter number...")
                                            : t("choices.enterName", "Enter name...")}
                                        autoFocus
                                    />
                                </div>

                                {modalChoiceType === "tax_percentage" && (
                                    <div className="mb-4">
                                        <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                                            {t("choices.taxPercentage", "Tax Percentage")}
                                        </label>
                                        <input
                                            type="number"
                                            value={modalPercentage}
                                            onChange={(event) => setModalPercentage(event.target.value)}
                                            step="0.01"
                                            min="0"
                                            max="100"
                                            required
                                            className="w-full rounded-lg border border-input bg-transparent px-4 py-2.5 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                                            placeholder="e.g. 19.00"
                                        />
                                    </div>
                                )}

                                <div className="flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={closeModal}
                                        className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                                    >
                                        {t("common.cancel", "Cancel")}
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={addMutation.isPending || updateMutation.isPending}
                                        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                    >
                                        {addMutation.isPending || updateMutation.isPending ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : modalMode === "edit" ? (
                                            t("common.save", "Save")
                                        ) : (
                                            t("choices.add", "Add")
                                        )}
                                    </button>
                                </div>

                                {modalError && (
                                    <p className="mt-3 text-sm text-destructive">
                                        {modalError}
                                    </p>
                                )}
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
