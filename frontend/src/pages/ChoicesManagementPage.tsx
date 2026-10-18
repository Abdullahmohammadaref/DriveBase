import React, { useState, useMemo, useCallback, useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { ChevronDown, ChevronRight, ChevronUp, Loader2, Lock, Plus, Search, Trash2, X, Car, FileText, Globe, CreditCard, Key, Pencil } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SortMenuButton } from "@/components/ui/SortMenuButton"
import { SmartDeleteModal } from "@/components/common/SmartDeleteModal"
import { PerPageInput } from "@/components/PerPageInput"
import { PageInput } from "@/components/PageInput"
import { getPagePref, savePagePref } from "@/lib/paginationPrefs"
import { cn } from "@/lib/utils"
import { findMatchingStandardOption } from "@/lib/choiceMatching"

interface ChoiceItem {
    id: number
    name: string
    percentage?: number
    is_protected?: boolean
    mobile_de_mapping?: string | null
    mapped_to_name?: string | null
    vehicle_classes?: string[]
    applies_to_buy?: boolean
    applies_to_sale?: boolean
    applies_to_transactions?: boolean
    usage_count?: number
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
    is_protected?: boolean
    mobile_de_mapping?: string | null
    mapped_to_name?: string | null
    vehicle_classes?: string[]
    usage_count?: number
    models_active: ChoiceItem[]
    models_inactive: ChoiceItem[]
}

interface CategoryWithSubcategories {
    id: number
    name: string
    is_protected?: boolean
    usage_count?: number
    subs_active: ChoiceItem[]
    subs_inactive: ChoiceItem[]
}

interface CountryWithCities {
    id: number
    name: string
    is_protected?: boolean
    usage_count?: number
    cities_active: ChoiceItem[]
    cities_inactive: ChoiceItem[]
}

interface MarketplaceOption {
    code: string
    label: string
}

interface ChoicesManagementData {
    choice_types: Record<string, ChoiceType>
    makes_with_models: MakeWithModels[]
    manufacturers_with_models?: MakeWithModels[]
    categories_with_subcategories: CategoryWithSubcategories[]
    countries_with_cities: CountryWithCities[]
    marketplace_options?: Record<string, MarketplaceOption[]>
}

type ChoiceScopeFilter = "in_use" | "all_active" | "inactive" | "all"


type SortValue = "name" | "status" | "tax_amount" | "relevance"

const ACTIVE_ITEM_CLASS =
    "flex min-h-[34px] items-center justify-between rounded-md border border-gray-200 dark:border-border bg-white dark:bg-card px-3 py-1.5 text-xs shadow-2xs transition-all hover:border-gray-300 dark:hover:border-border hover:bg-gray-50/50 dark:hover:bg-muted/30 group gap-2"
const INACTIVE_ITEM_CLASS =
    "flex min-h-[34px] items-center justify-between rounded-md border border-gray-200/60 dark:border-border/60 bg-gray-50/60 dark:bg-zinc-900/30 px-3 py-1.5 text-xs opacity-75 transition-all hover:opacity-100 group gap-2"

function matchesSearch(name: string | undefined | null, searchValue: string) {
    if (!name) return false
    return name.toLowerCase().includes(searchValue.toLowerCase())
}

export default function ChoicesManagementPage() {
    const { t } = useTranslation()
    const queryClient = useQueryClient()

    const [activeTab, setActiveTab] = useState<string>("vehicle_model")

    // Safety fallback: If user was on the currency tab, redirect to default "vehicle_model"
    useEffect(() => {
        if (activeTab === "currency") {
            setActiveTab("vehicle_model")
        }
    }, [activeTab])
    const [expandedMakes, setExpandedMakes] = useState<Set<number>>(new Set())
    const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set())
    const [expandedCountries, setExpandedCountries] = useState<Set<number>>(new Set())
    const [searchValue, setSearchValue] = useState("")
    const [scopeFilter, setScopeFilter] = useState<ChoiceScopeFilter>("in_use")
    const [sortBy, setSortBy] = useState<SortValue>("relevance")
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
        try {
            const saved = localStorage.getItem("acar_choices_sidebar_collapsed")
            return saved ? JSON.parse(saved) : {}
        } catch {
            return {}
        }
    })

    const toggleSection = (sectionId: string) => {
        setCollapsedSections((prev) => {
            const next = { ...prev, [sectionId]: !prev[sectionId] }
            try {
                localStorage.setItem("acar_choices_sidebar_collapsed", JSON.stringify(next))
            } catch {}
            return next
        })
    }

    const [openStandardDrawers, setOpenStandardDrawers] = useState<Set<string>>(new Set())
    const [expandedUnusedDrawers, setExpandedUnusedDrawers] = useState<Set<string>>(new Set())

    const toggleStandardDrawer = (tabKey: string) => {
        setOpenStandardDrawers((prev) => {
            const next = new Set(prev)
            if (next.has(tabKey)) {
                next.delete(tabKey)
                // When closing the drawer, reset unused expansion so it re-opens in clean in-use state
                setExpandedUnusedDrawers((uPrev) => {
                    const uNext = new Set(uPrev)
                    uNext.delete(tabKey)
                    return uNext
                })
            } else {
                next.add(tabKey)
            }
            return next
        })
    }

    const toggleUnusedStandardChoices = (tabKey: string) => {
        setExpandedUnusedDrawers((prev) => {
            const next = new Set(prev)
            if (next.has(tabKey)) {
                next.delete(tabKey)
            } else {
                next.add(tabKey)
            }
            return next
        })
    }

    const [expandedChildrenParents, setExpandedChildrenParents] = useState<Set<string>>(new Set())

    const toggleParentChildrenExpansion = (parentType: string, parentId: number) => {
        setExpandedChildrenParents((prev) => {
            const next = new Set(prev)
            const key = `${parentType}-${parentId}`
            if (next.has(key)) {
                next.delete(key)
            } else {
                next.add(key)
            }
            return next
        })
    }

    const [modalOpen, setModalOpen] = useState(false)
    const [modalMode, setModalMode] = useState<"add" | "edit">("add")
    const [modalEditId, setModalEditId] = useState<number | null>(null)
    const [modalChoiceType, setModalChoiceType] = useState("")
    const [modalTitle, setModalTitle] = useState("")
    const [modalName, setModalName] = useState("")
    const [modalPercentage, setModalPercentage] = useState("")
    const [modalParentId, setModalParentId] = useState<number | null>(null)
    const [modalError, setModalError] = useState<string | null>(null)
    const [modalAppliesToBuy, setModalAppliesToBuy] = useState(true)
    const [modalAppliesToSale, setModalAppliesToSale] = useState(true)
    const [modalAppliesToTransactions, setModalAppliesToTransactions] = useState(true)
    const [modalMobileDeMapping, setModalMobileDeMapping] = useState<string>("")
    const [modalIsProtected, setModalIsProtected] = useState<boolean>(false)
    const [modalIsActive, setModalIsActive] = useState<boolean>(true)
    const [userOverrodeMapping, setUserOverrodeMapping] = useState<boolean>(false)
    const [classFilter, setClassFilter] = useState<string>("all")
    const [modalVehicleClasses, setModalVehicleClasses] = useState<string[]>(["Car"])
    const [modalParentMake, setModalParentMake] = useState<MakeWithModels | { id: number; name: string; vehicle_classes?: string[]; models_active?: ChoiceItem[] } | null>(null)
    const [page, setPage] = useState<number>(1)
    const [perPage, setPerPage] = useState<number>(() => getPagePref("acar_choices_per_page", getPagePref("acar_choices_makes_per_page", 20)))
    const scrollContainerRef = React.useRef<HTMLDivElement>(null)

    const handlePerPageChange = (newPerPage: number) => {
        savePagePref("acar_choices_per_page", newPerPage)
        setPerPage(newPerPage)
        setPage(1)
    }

    const handlePageChange = (newPage: number) => {
        setPage(newPage)
    }

    const [deleteModalOpen, setDeleteModalOpen] = useState(false)
    const [choiceToDelete, setChoiceToDelete] = useState<{
        choiceType: string
        choiceId: number
        name: string
    } | null>(null)

    const { data, isLoading, isFetching, error } = useQuery<ChoicesManagementData>({
        queryKey: ["choices-management"],
        queryFn: async () => {
            const response = await api.get("/choices/management")
            return response.data
        },
    })

    const { data: marketplaceModelsData, isLoading: isLoadingMarketplaceModels } = useQuery<{ make: string; models: string[] }>({
        queryKey: ["marketplace-models", modalParentMake?.name],
        queryFn: async () => {
            if (!modalParentMake?.name) return { make: "", models: [] }
            const res = await api.get<{ make: string; models: string[] }>(`/choices/marketplace-models/${encodeURIComponent(modalParentMake.name)}`)
            return res.data
        },
        enabled: modalOpen && modalChoiceType === "vehicle_model" && Boolean(modalParentMake?.name),
        staleTime: 1000 * 60 * 30,
    })

    const choiceTypes = data?.choice_types ?? {}
    const makesWithModels = data?.makes_with_models ?? data?.manufacturers_with_models ?? []
    const categoriesWithSubcategories = data?.categories_with_subcategories ?? []
    const countriesWithCities = data?.countries_with_cities ?? []

    const availableStandardOptions: Array<{ id: string; name: string; vehicle_classes?: string[] }> = useMemo(() => {
        if (modalChoiceType === "make") {
            return (makesWithModels || [])
                .filter((m) => Boolean(m.is_protected))
                .map((m) => ({ id: String(m.id), name: m.name, vehicle_classes: m.vehicle_classes }))
        }
        if (["vehicle_type", "fuel_type", "body_type", "color", "doors"].includes(modalChoiceType)) {
            const protectedActive = (data?.choice_types?.[modalChoiceType]?.active || []).filter((c) => Boolean(c.is_protected))
            if (protectedActive.length > 0) {
                return protectedActive.map((c) => ({ id: String(c.id), name: c.name, vehicle_classes: c.vehicle_classes }))
            }
            return (data?.marketplace_options?.[modalChoiceType] || []).map((o) => ({ id: o.code, name: o.label, vehicle_classes: undefined }))
        }
        if (modalChoiceType === "vehicle_model") {
            const protectedModels = (modalParentMake?.models_active || []).filter((m) => Boolean(m.is_protected))
            if (protectedModels.length > 0) {
                return protectedModels.map((m) => ({ id: String(m.id), name: m.name, vehicle_classes: m.vehicle_classes }))
            }
            return (marketplaceModelsData?.models || []).map((name) => ({ id: name, name, vehicle_classes: undefined }))
        }
        return []
    }, [modalChoiceType, data, makesWithModels, modalParentMake, marketplaceModelsData])

    const selectedProtectedOption = useMemo(() => {
        if (!modalMobileDeMapping) return null
        return availableStandardOptions.find(
            (opt) => opt.name.toLowerCase() === modalMobileDeMapping.toLowerCase() || opt.id === modalMobileDeMapping
        ) || null
    }, [modalMobileDeMapping, availableStandardOptions])

    // --- Dynamic Vehicle Classes (derived from DB vehicle_type choices) ---
    const activeVehicleTypes = useMemo(() => {
        return (data?.choice_types?.vehicle_type?.active || []) as ChoiceItem[]
    }, [data?.choice_types?.vehicle_type?.active])

    const getVehicleClassLabel = useCallback(
        (cls: string): string => {
            const match = activeVehicleTypes.find(
                (vt) => vt.mobile_de_mapping === cls || vt.name === cls || String(vt.id) === cls
            )
            if (match) return match.name

            const fallbackMap: Record<string, string> = {
                Car: "PKW",
                Motorbike: "Motorrad",
                Motorhome: "Wohnmobil / Wohnwagen",
                VanUpTo7500: "Transporter",
                TruckOver7500: "LKW",
                Trailer: "Anhänger",
                SemiTrailer: "Auflieger",
                SemiTrailerTruck: "Sattelzugmaschine",
                Bus: "Bus",
                EBike: "E-Bike",
                AgriculturalVehicle: "Agrarfahrzeug",
                ConstructionMachine: "Baumaschine",
                ForkliftTruck: "Gabelstapler",
            }
            return fallbackMap[cls] || cls
        },
        [activeVehicleTypes]
    )

    const classFilterOptions = useMemo(() => {
        const base = [{ id: "all", label: t("common.all", "All"), mapping: "all" }]

        const standardClasses = [
            { id: "Car", label: "PKW", mapping: "Car" },
            { id: "Motorbike", label: "Motorrad", mapping: "Motorbike" },
            { id: "Motorhome", label: "Wohnmobil / Wohnwagen", mapping: "Motorhome" },
            { id: "VanUpTo7500", label: "Transporter", mapping: "VanUpTo7500" },
            { id: "TruckOver7500", label: "LKW", mapping: "TruckOver7500" },
            { id: "Trailer", label: "Anhänger", mapping: "Trailer" },
            { id: "SemiTrailer", label: "Auflieger", mapping: "SemiTrailer" },
            { id: "SemiTrailerTruck", label: "Sattelzugmaschine", mapping: "SemiTrailerTruck" },
            { id: "Bus", label: "Bus", mapping: "Bus" },
            { id: "EBike", label: "E-Bike", mapping: "EBike" },
            { id: "AgriculturalVehicle", label: "Agrarfahrzeug", mapping: "AgriculturalVehicle" },
            { id: "ConstructionMachine", label: "Baumaschine", mapping: "ConstructionMachine" },
            { id: "ForkliftTruck", label: "Gabelstapler", mapping: "ForkliftTruck" },
        ]

        const vtByMapping = new Map<string, ChoiceItem>()
        for (const vt of activeVehicleTypes) {
            const m = vt.mobile_de_mapping || vt.name
            if (m) vtByMapping.set(m.toLowerCase(), vt)
            vtByMapping.set(vt.name.toLowerCase(), vt)
        }

        const options = standardClasses.map((sc) => {
            const match = vtByMapping.get(sc.mapping.toLowerCase()) || vtByMapping.get(sc.label.toLowerCase())
            return {
                id: sc.mapping,
                label: match ? match.name : sc.label,
                mapping: sc.mapping,
            }
        })

        for (const vt of activeVehicleTypes) {
            const isStandard = standardClasses.some(
                (sc) =>
                    sc.mapping.toLowerCase() === (vt.mobile_de_mapping || "").toLowerCase() ||
                    sc.label.toLowerCase() === vt.name.toLowerCase()
            )
            if (!isStandard) {
                options.push({
                    id: String(vt.id),
                    label: vt.name,
                    mapping: vt.mobile_de_mapping || vt.name,
                })
            }
        }

        return [...base, ...options]
    }, [activeVehicleTypes, t])

    const matchesClassFilter = useCallback(
        (itemClasses: string[] | undefined | null, filter: string): boolean => {
            if (filter === "all") return true

            const selectedOption = classFilterOptions.find((opt) => opt.id === filter)
            const targetMapping = selectedOption?.mapping || filter
            const targetLabel = selectedOption?.label || filter
            const isCar = targetMapping === "Car" || targetLabel.toUpperCase() === "PKW"

            const classes = itemClasses || []
            if (classes.length === 0) {
                return isCar
            }

            return (
                classes.includes(filter) ||
                (Boolean(targetMapping) && classes.includes(targetMapping)) ||
                (Boolean(targetLabel) && classes.includes(targetLabel))
            )
        },
        [classFilterOptions]
    )

    const modalClassOptions = useMemo(() => {
        const standardClasses = [
            { id: "Car", label: "PKW (Car)" },
            { id: "Motorbike", label: "Motorrad" },
            { id: "Motorhome", label: "Wohnmobil / Wohnwagen" },
            { id: "VanUpTo7500", label: "Transporter" },
            { id: "TruckOver7500", label: "LKW" },
            { id: "Trailer", label: "Anhänger" },
            { id: "SemiTrailer", label: "Auflieger" },
            { id: "SemiTrailerTruck", label: "Sattelzugmaschine" },
            { id: "Bus", label: "Bus" },
            { id: "EBike", label: "E-Bike" },
            { id: "AgriculturalVehicle", label: "Agrarfahrzeug" },
            { id: "ConstructionMachine", label: "Baumaschine" },
            { id: "ForkliftTruck", label: "Gabelstapler" },
        ]

        const seen = new Set<string>()
        const options: { id: string; label: string }[] = []

        for (const sc of standardClasses) {
            seen.add(sc.id.toLowerCase())
            options.push(sc)
        }

        for (const vt of activeVehicleTypes) {
            const key = vt.mobile_de_mapping || vt.name
            if (!seen.has(key.toLowerCase())) {
                seen.add(key.toLowerCase())
                options.push({
                    id: key,
                    label: vt.name,
                })
            }
        }

        if (modalChoiceType === "vehicle_model") {
            const parentSupported = new Set((modalParentMake?.vehicle_classes || []).map((c) => c.toLowerCase()))
            return options.filter((opt) => parentSupported.has(opt.id.toLowerCase()))
        }

        return options
    }, [activeVehicleTypes, modalChoiceType, modalParentMake])

    const addMutation = useMutation({
        mutationFn: async (params: {
            choiceType: string
            name: string
            percentage?: string
            parentId?: number | null
            applies_to_buy?: boolean
            applies_to_sale?: boolean
            applies_to_transactions?: boolean
            mobile_de_mapping?: string
            vehicle_classes?: string[]
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
            if (params.choiceType === "payment_method") {
                if (params.applies_to_buy !== undefined) formData.append("applies_to_buy", String(params.applies_to_buy))
                if (params.applies_to_sale !== undefined) formData.append("applies_to_sale", String(params.applies_to_sale))
                if (params.applies_to_transactions !== undefined) formData.append("applies_to_transactions", String(params.applies_to_transactions))
            }
            if (["make", "fuel_type", "body_type", "color", "doors", "vehicle_model"].includes(params.choiceType) && params.mobile_de_mapping) {
                formData.append("mobile_de_mapping", params.mobile_de_mapping)
            }
            if (["make", "body_type", "vehicle_model", "fuel_type", "doors"].includes(params.choiceType) && params.vehicle_classes) {
                formData.append("vehicle_classes", JSON.stringify(params.vehicle_classes))
            }

            const response = await api.post(`/choices/${params.choiceType}`, formData, {
                headers: { "Content-Type": "multipart/form-data" },
            })
            return response.data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["choices-management"] })
            queryClient.invalidateQueries({ queryKey: ["choices"] })
            queryClient.invalidateQueries({ queryKey: ["transaction-choices"] })
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
            applies_to_buy?: boolean
            applies_to_sale?: boolean
            applies_to_transactions?: boolean
            mobile_de_mapping?: string
            vehicle_classes?: string[]
        }) => {
            const payload: any = {
                name: params.name,
                ...(params.percentage && { percentage: parseFloat(params.percentage) })
            }
            if (params.choiceType === "payment_method") {
                payload.applies_to_buy = params.applies_to_buy
                payload.applies_to_sale = params.applies_to_sale
                payload.applies_to_transactions = params.applies_to_transactions
            }
            if (["make", "fuel_type", "body_type", "color", "doors", "vehicle_model"].includes(params.choiceType)) {
                payload.mobile_de_mapping = params.mobile_de_mapping || ""
            }
            if (["make", "body_type", "vehicle_model", "fuel_type", "doors"].includes(params.choiceType) && params.vehicle_classes !== undefined) {
                payload.vehicle_classes = params.vehicle_classes
            }
            const response = await api.patch(`/choices/${params.choiceType}/${params.choiceId}`, payload)
            return response.data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["choices-management"] })
            queryClient.invalidateQueries({ queryKey: ["choices"] })
            queryClient.invalidateQueries({ queryKey: ["transaction-choices"] })
            closeModal()
        },
        onError: (error: any) => {
            console.error("Update failed:", error)
            const message = error.response?.data?.detail || error.response?.data?.message || t("choices.updateError", "Failed to update choice.")
            setModalError(message)
        },
    })

    const deactivateMutation = useMutation({
        mutationFn: async (params: { choiceType: string; choiceId: number; forceCascade?: boolean }) => {
            const response = await api.post(`/choices/${params.choiceType}/${params.choiceId}/deactivate`, null, {
                params: params.forceCascade ? { force_cascade: true } : undefined,
            })
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

    const sortItems = <T extends { name: string; is_active?: boolean; percentage?: number; usage_count?: number }>(items: T[]) =>
        [...(items || [])].sort((a, b) => {
            if (sortBy === "relevance") {
                const countA = a.usage_count ?? 0
                const countB = b.usage_count ?? 0
                if (countA !== countB) {
                    return sortOrder === "asc" ? countA - countB : countB - countA
                }
                return a.name.localeCompare(b.name)
            }
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
        if (key === "vehicle_type") return t("choices.vehicleTypes", "Vehicle Types")
        if (key === "make" || key === "vehicle_model") return t("choices.makesAndModels", "Makes & Models")
        if (key === "body_type") return t("choices.bodyTypes", "Body Types")
        if (key === "fuel_type") return t("choices.fuelTypes", "Fuel Types")
        if (key === "doors") return t("choices.doors", "Door Options")
        if (key === "color") return t("choices.colors", "Colors")
        if (key === "damage_type") return t("choices.damageTypes", "Damage Types")
        if (key === "category" || key === "subcategory") return t("choices.categoriesAndSubcategories", "Categories & Subcategories")
        if (key === "country" || key === "city") return t("choices.countriesAndCities", "Countries & Cities")
        if (key === "payment_method") return t("choices.paymentMethods", "Payment Methods")
        if (key === "tax_percentage") return t("choices.taxPercentages", "Tax Percentages")
        if (key === "currency") return t("choices.currencies", "Currencies")
        if (key === "key_number") return t("choices.keyNumbers", "Key Numbers")
        return choiceTypes[key]?.name || key
    }

    const getSortOptions = () => {
        const options = [
            { value: "relevance", label: t("choices.sortRelevance", "Relevance") },
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
            setSortBy("relevance")
        }
    }

    const openAddModal = (
        choiceType: string,
        title: string,
        parentId: number | null = null,
        parentMake?: MakeWithModels | { id: number; name: string; vehicle_classes?: string[]; models_active?: ChoiceItem[] } | null
    ) => {
        setModalMode("add")
        setModalEditId(null)
        setModalChoiceType(choiceType)
        setModalTitle(title)
        setModalName("")
        setModalPercentage("")
        setModalParentId(parentId)
        setModalParentMake(parentMake || null)
        setModalMobileDeMapping("")
        setModalIsProtected(false)
        setModalIsActive(true)
        setUserOverrodeMapping(false)
        if (choiceType === "payment_method") {
            setModalAppliesToBuy(true)
            setModalAppliesToSale(true)
            setModalAppliesToTransactions(true)
        }
        if (choiceType === "vehicle_model" && parentMake?.vehicle_classes && parentMake.vehicle_classes.length > 0) {
            setModalVehicleClasses(parentMake.vehicle_classes)
        } else {
            const currentTargetClass = classFilter !== "all"
                ? (classFilterOptions.find((o) => o.id === classFilter)?.mapping || "Car")
                : "Car"
            setModalVehicleClasses([currentTargetClass])
        }
        setModalOpen(true)
    }

    const openEditModal = (
        choiceType: string,
        item: ChoiceItem,
        parentMake?: { id: number; name: string; vehicle_classes?: string[] } | null,
        isActive: boolean = true
    ) => {
        if (item.is_protected) return
        setModalMode("edit")
        setModalEditId(item.id)
        setModalChoiceType(choiceType)
        setModalTitle(t("choices.editOption", "Edit Option"))
        setModalName(item.name)
        setModalPercentage(item.percentage?.toString() || "")
        setModalParentId(null)
        setModalParentMake(parentMake || null)
        setModalMobileDeMapping(item.mapped_to_name || item.mobile_de_mapping || "")
        setModalIsProtected(Boolean(item.is_protected))
        setModalIsActive(isActive)
        setUserOverrodeMapping(false)
        if (choiceType === "payment_method") {
            setModalAppliesToBuy((item as any).applies_to_buy ?? true)
            setModalAppliesToSale((item as any).applies_to_sale ?? true)
            setModalAppliesToTransactions((item as any).applies_to_transactions ?? true)
        }
        const rawClasses = (item as any).vehicle_classes
        if (Array.isArray(rawClasses) && rawClasses.length > 0) {
            if (choiceType === "vehicle_model" && parentMake?.vehicle_classes && parentMake.vehicle_classes.length > 0) {
                const parentSet = new Set(parentMake.vehicle_classes.map((c) => c.toLowerCase()))
                const validClasses = rawClasses.filter((c) => parentSet.has(c.toLowerCase()))
                setModalVehicleClasses(validClasses.length > 0 ? validClasses : parentMake.vehicle_classes)
            } else {
                setModalVehicleClasses(rawClasses)
            }
        } else if (choiceType === "vehicle_model" && parentMake?.vehicle_classes && parentMake.vehicle_classes.length > 0) {
            setModalVehicleClasses(parentMake.vehicle_classes)
        } else {
            setModalVehicleClasses(["Car"])
        }
        setModalOpen(true)
    }

    const closeModal = () => {
        setModalOpen(false)
        setModalMode("add")
        setModalEditId(null)
        setModalName("")
        setModalPercentage("")
        setModalParentId(null)
        setModalParentMake(null)
        setModalError(null)
        setModalAppliesToBuy(true)
        setModalAppliesToSale(true)
        setModalAppliesToTransactions(true)
        setModalMobileDeMapping("")
        setModalVehicleClasses(["Car"])
        setModalIsProtected(false)
        setModalIsActive(true)
        setUserOverrodeMapping(false)
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

        if (modalChoiceType === "payment_method") {
            if (!modalAppliesToBuy && !modalAppliesToSale && !modalAppliesToTransactions) {
                setModalError(t("choices.atLeastOneScopeRequired", "Please select at least one applicable area (Buy, Sale, or Transactions)."))
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
                applies_to_buy: modalAppliesToBuy,
                applies_to_sale: modalAppliesToSale,
                applies_to_transactions: modalAppliesToTransactions,
                mobile_de_mapping: modalMobileDeMapping,
                vehicle_classes: modalVehicleClasses,
            })
        } else {
            addMutation.mutate({
                choiceType: modalChoiceType,
                name: modalName.trim(),
                percentage: modalPercentage,
                parentId: modalParentId,
                applies_to_buy: modalAppliesToBuy,
                applies_to_sale: modalAppliesToSale,
                applies_to_transactions: modalAppliesToTransactions,
                mobile_de_mapping: modalMobileDeMapping,
                vehicle_classes: modalVehicleClasses,
            })
        }
    }

    const handleDeleteClick = (choiceType: string, choiceId: number, name: string) => {
        setChoiceToDelete({ choiceType, choiceId, name })
        setDeleteModalOpen(true)
    }

    const handleConfirmDelete = async (optsOrCascade?: boolean | { forceCascade?: boolean; mode?: string }) => {
        if (!choiceToDelete) return
        const isObj = typeof optsOrCascade === "object" && optsOrCascade !== null
        const forceCascade = isObj ? (optsOrCascade.forceCascade || optsOrCascade.mode === "cascade") : Boolean(optsOrCascade)
        await deactivateMutation.mutateAsync({
            choiceType: choiceToDelete.choiceType,
            choiceId: choiceToDelete.choiceId,
            forceCascade,
        })
        setDeleteModalOpen(false)
        setChoiceToDelete(null)
    }


    const handleReactivate = (choiceType: string, choiceId: number) => {
        reactivateMutation.mutate({ choiceType, choiceId })
    }

    const filteredMakesWithModels = useMemo(() => {
        return sortItems(makesWithModels)
            .filter((makeGroup) => {
                return matchesClassFilter((makeGroup as any).vehicle_classes, classFilter)
            })
            .map((makeGroup) => {
                const activeModelsBase = sortItems(makeGroup.models_active || [])
                const inactiveModelsBase = sortItems(makeGroup.models_inactive || [])
                const isChildrenExpanded = expandedChildrenParents.has(`make-${makeGroup.id}`)

                let visibleActiveModels: ChoiceItem[] = []
                let visibleInactiveModels: ChoiceItem[] = []

                if (normalizedSearch) {
                    const parentMatches = matchesSearch(makeGroup.name, normalizedSearch)
                    const activePool = scopeFilter === "inactive" ? [] : activeModelsBase
                    const inactivePool = scopeFilter === "in_use" || scopeFilter === "all_active" ? [] : inactiveModelsBase

                    visibleActiveModels = parentMatches ? activePool : filterItems(activePool)
                    visibleInactiveModels = parentMatches ? inactivePool : filterItems(inactivePool)
                } else if (scopeFilter === "in_use") {
                    visibleActiveModels = activeModelsBase.filter((m) => !m.is_protected)
                    visibleInactiveModels = []
                } else if (scopeFilter === "all_active") {
                    visibleActiveModels = activeModelsBase.filter((m) => !m.is_protected)
                    visibleInactiveModels = []
                } else if (scopeFilter === "inactive") {
                    visibleActiveModels = []
                    visibleInactiveModels = inactiveModelsBase.filter((m) => !m.is_protected)
                } else {
                    // "all"
                    visibleActiveModels = activeModelsBase.filter((m) => !m.is_protected)
                    visibleInactiveModels = inactiveModelsBase.filter((m) => !m.is_protected)
                }

                // Determine Parent Visibility
                let isParentVisible = false
                const hasInUseStandard = activeModelsBase.some(
                    (m) => m.is_protected && m.usage_count && m.usage_count > 0
                )
                const hasCustomModels = activeModelsBase.some((m) => !m.is_protected)
                const hasMatchingModel = normalizedSearch
                    ? activeModelsBase.some((m) => matchesSearch(m.name, normalizedSearch)) ||
                      inactiveModelsBase.some((m) => matchesSearch(m.name, normalizedSearch))
                    : false
                const makeUsage = makeGroup.usage_count || 0

                if (normalizedSearch) {
                    isParentVisible = matchesSearch(makeGroup.name, normalizedSearch) || hasMatchingModel
                } else if (scopeFilter === "in_use") {
                    // Parent is visible IF custom OR makeUsage > 0 OR has in-use standard models OR custom models
                    isParentVisible = !makeGroup.is_protected || makeUsage > 0 || hasInUseStandard || hasCustomModels
                } else if (scopeFilter === "all_active") {
                    isParentVisible = Boolean((makeGroup as any).is_active !== false)
                } else if (scopeFilter === "inactive") {
                    isParentVisible = Boolean((makeGroup as any).is_active === false) || inactiveModelsBase.length > 0
                } else {
                    isParentVisible = true
                }

                const totalStandardCount = activeModelsBase.filter((m) => m.is_protected).length

                return {
                    ...makeGroup,
                    filteredActive: visibleActiveModels,
                    filteredInactive: visibleInactiveModels,
                    totalStandardCount,
                    isStandardExpanded: isChildrenExpanded,
                    isVisible: isParentVisible,
                }
            })
            .filter((makeGroup) => makeGroup.isVisible)
    }, [makesWithModels, classFilter, scopeFilter, normalizedSearch, sortBy, sortOrder, expandedChildrenParents])

    const filteredCategoriesWithSubcategories = useMemo(() => {
        return sortItems(categoriesWithSubcategories)
            .map((categoryGroup) => {
                const activeSubsBase = sortItems(categoryGroup.subs_active || [])
                const inactiveSubsBase = sortItems(categoryGroup.subs_inactive || [])
                const isChildrenExpanded = expandedChildrenParents.has(`category-${categoryGroup.id}`)

                let visibleActiveSubs: ChoiceItem[] = []
                let visibleInactiveSubs: ChoiceItem[] = []

                if (normalizedSearch) {
                    const parentMatches = matchesSearch(categoryGroup.name, normalizedSearch)
                    const activePool = scopeFilter === "inactive" ? [] : activeSubsBase
                    const inactivePool = scopeFilter === "in_use" || scopeFilter === "all_active" ? [] : inactiveSubsBase

                    visibleActiveSubs = parentMatches ? activePool : filterItems(activePool)
                    visibleInactiveSubs = parentMatches ? inactivePool : filterItems(inactivePool)
                } else if (scopeFilter === "in_use") {
                    if (isChildrenExpanded) {
                        visibleActiveSubs = activeSubsBase
                    } else {
                        visibleActiveSubs = activeSubsBase.filter(
                            (s) => !(s as any).is_protected || (s.usage_count && s.usage_count > 0)
                        )
                    }
                    visibleInactiveSubs = []
                } else if (scopeFilter === "all_active") {
                    visibleActiveSubs = activeSubsBase
                    visibleInactiveSubs = []
                } else if (scopeFilter === "inactive") {
                    visibleActiveSubs = []
                    visibleInactiveSubs = inactiveSubsBase
                } else {
                    visibleActiveSubs = activeSubsBase
                    visibleInactiveSubs = inactiveSubsBase
                }

                let isParentVisible = false
                const hasVisibleChildren = visibleActiveSubs.length > 0 || visibleInactiveSubs.length > 0

                if (normalizedSearch) {
                    isParentVisible = matchesSearch(categoryGroup.name, normalizedSearch) || hasVisibleChildren
                } else if (scopeFilter === "in_use") {
                    isParentVisible = !(categoryGroup as any).is_protected || (categoryGroup.usage_count && categoryGroup.usage_count > 0) || hasVisibleChildren
                } else if (scopeFilter === "all_active") {
                    isParentVisible = Boolean((categoryGroup as any).is_active !== false)
                } else if (scopeFilter === "inactive") {
                    isParentVisible = Boolean((categoryGroup as any).is_active === false) || visibleInactiveSubs.length > 0
                } else {
                    isParentVisible = true
                }

                const totalActiveSubs = activeSubsBase.length
                const inUseSubs = activeSubsBase.filter((s) => !(s as any).is_protected || (s.usage_count && s.usage_count > 0)).length
                const hiddenSubsCount = Math.max(0, totalActiveSubs - inUseSubs)

                return {
                    ...categoryGroup,
                    filteredActive: visibleActiveSubs,
                    filteredInactive: visibleInactiveSubs,
                    visibleChildrenCount: visibleActiveSubs.length + visibleInactiveSubs.length,
                    hiddenSubsCount,
                    isSubsExpanded: isChildrenExpanded,
                    isVisible: isParentVisible,
                }
            })
            .filter((categoryGroup) => categoryGroup.isVisible)
    }, [categoriesWithSubcategories, scopeFilter, normalizedSearch, sortBy, sortOrder, expandedChildrenParents])

    const filteredCountriesWithCities = useMemo(() => {
        return sortItems(countriesWithCities)
            .map((countryGroup) => {
                const activeCitiesBase = sortItems(countryGroup.cities_active || [])
                const inactiveCitiesBase = sortItems(countryGroup.cities_inactive || [])
                const isChildrenExpanded = expandedChildrenParents.has(`country-${countryGroup.id}`)

                let visibleActiveCities: ChoiceItem[] = []
                let visibleInactiveCities: ChoiceItem[] = []

                if (normalizedSearch) {
                    const parentMatches = matchesSearch(countryGroup.name, normalizedSearch)
                    const activePool = scopeFilter === "inactive" ? [] : activeCitiesBase
                    const inactivePool = scopeFilter === "in_use" || scopeFilter === "all_active" ? [] : inactiveCitiesBase

                    visibleActiveCities = parentMatches ? activePool : filterItems(activePool)
                    visibleInactiveCities = parentMatches ? inactivePool : filterItems(inactivePool)
                } else if (scopeFilter === "in_use") {
                    if (isChildrenExpanded) {
                        visibleActiveCities = activeCitiesBase
                    } else {
                        visibleActiveCities = activeCitiesBase.filter(
                            (c) => !(c as any).is_protected || (c.usage_count && c.usage_count > 0)
                        )
                    }
                    visibleInactiveCities = []
                } else if (scopeFilter === "all_active") {
                    visibleActiveCities = activeCitiesBase
                    visibleInactiveCities = []
                } else if (scopeFilter === "inactive") {
                    visibleActiveCities = []
                    visibleInactiveCities = inactiveCitiesBase
                } else {
                    visibleActiveCities = activeCitiesBase
                    visibleInactiveCities = inactiveCitiesBase
                }

                let isParentVisible = false
                const hasVisibleChildren = visibleActiveCities.length > 0 || visibleInactiveCities.length > 0

                if (normalizedSearch) {
                    isParentVisible = matchesSearch(countryGroup.name, normalizedSearch) || hasVisibleChildren
                } else if (scopeFilter === "in_use") {
                    isParentVisible = !(countryGroup as any).is_protected || (countryGroup.usage_count && countryGroup.usage_count > 0) || hasVisibleChildren
                } else if (scopeFilter === "all_active") {
                    isParentVisible = Boolean((countryGroup as any).is_active !== false)
                } else if (scopeFilter === "inactive") {
                    isParentVisible = Boolean((countryGroup as any).is_active === false) || visibleInactiveCities.length > 0
                } else {
                    isParentVisible = true
                }

                const totalActiveCities = activeCitiesBase.length
                const inUseCities = activeCitiesBase.filter((c) => !(c as any).is_protected || (c.usage_count && c.usage_count > 0)).length
                const hiddenCitiesCount = Math.max(0, totalActiveCities - inUseCities)

                return {
                    ...countryGroup,
                    filteredActive: visibleActiveCities,
                    filteredInactive: visibleInactiveCities,
                    visibleChildrenCount: visibleActiveCities.length + visibleInactiveCities.length,
                    hiddenCitiesCount,
                    isCitiesExpanded: isChildrenExpanded,
                    isVisible: isParentVisible,
                }
            })
            .filter((countryGroup) => countryGroup.isVisible)
    }, [countriesWithCities, scopeFilter, normalizedSearch, sortBy, sortOrder, expandedChildrenParents])

    // Auto-expand parents when search matches children
    useEffect(() => {
        if (normalizedSearch) {
            const matchingMakeIds = new Set<number>()
            filteredMakesWithModels.forEach((m) => {
                const hasMatchingModel =
                    (m.models_active || []).some((model: any) => matchesSearch(model.name, normalizedSearch)) ||
                    (m.models_inactive || []).some((model: any) => matchesSearch(model.name, normalizedSearch))
                if (hasMatchingModel || matchesSearch(m.name, normalizedSearch)) {
                    matchingMakeIds.add(m.id)
                }
            })
            setExpandedMakes(matchingMakeIds)

            const matchingCatIds = new Set<number>()
            filteredCategoriesWithSubcategories.forEach((c) => {
                if (c.filteredActive.length > 0 || c.filteredInactive.length > 0) {
                    matchingCatIds.add(c.id)
                }
            })
            setExpandedCategories(matchingCatIds)

            const matchingCountryIds = new Set<number>()
            filteredCountriesWithCities.forEach((co) => {
                if (co.filteredActive.length > 0 || co.filteredInactive.length > 0) {
                    matchingCountryIds.add(co.id)
                }
            })
            setExpandedCountries(matchingCountryIds)
        }
    }, [normalizedSearch, filteredMakesWithModels, filteredCategoriesWithSubcategories, filteredCountriesWithCities])

    const isFlatTab = !["vehicle_model", "make", "subcategory", "category", "city", "country"].includes(activeTab)

    const currentFlatItems = useMemo(() => {
        if (!isFlatTab) return { activeItems: [], inactiveItems: [] }
        const typeData = choiceTypes[activeTab]
        if (!typeData) return { activeItems: [], inactiveItems: [] }
        const filterByClass = (items: ChoiceItem[]) => {
            if (!["make", "body_type", "fuel_type", "doors"].includes(activeTab) || classFilter === "all") return items
            return items.filter((i) => {
                return matchesClassFilter((i as any).vehicle_classes, classFilter)
            })
        }

        const rawActive = filterByClass(typeData.active || []).map(i => ({ ...i, is_active: true }))
        const rawInactive = filterByClass(typeData.inactive || []).map(i => ({ ...i, is_active: false }))

        // Universal search: when searching, search active choices (or inactive if in inactive scope)
        if (normalizedSearch) {
            const pool = scopeFilter === "inactive" 
                ? rawInactive 
                : scopeFilter === "all" 
                    ? [...rawActive, ...rawInactive] 
                    : rawActive
            const matched = filterItems(pool)
            return {
                activeItems: scopeFilter === "inactive" ? [] : sortItems(matched.filter(i => i.is_active)),
                inactiveItems: scopeFilter === "in_use" || scopeFilter === "all_active" ? [] : sortItems(matched.filter(i => !i.is_active))
            }
        }

        let visibleActive: ChoiceItem[] = []
        let visibleInactive: ChoiceItem[] = []

        if (scopeFilter === "in_use") {
            // Show custom choices + in-use protected choices (usage_count > 0)
            // or all standard active choices if unused choices are expanded for this tab
            const isUnusedExpanded = expandedUnusedDrawers.has(activeTab)
            visibleActive = rawActive.filter(
                (i) => !i.is_protected || (i.usage_count && i.usage_count > 0) || isUnusedExpanded
            )
            visibleInactive = []
        } else if (scopeFilter === "all_active") {
            visibleActive = rawActive
            visibleInactive = []
        } else if (scopeFilter === "inactive") {
            visibleActive = []
            visibleInactive = rawInactive
        } else {
            // "all"
            visibleActive = rawActive
            visibleInactive = rawInactive
        }

        return {
            activeItems: sortItems(visibleActive),
            inactiveItems: sortItems(visibleInactive)
        }
    }, [isFlatTab, choiceTypes, activeTab, classFilter, scopeFilter, sortBy, sortOrder, searchValue, expandedUnusedDrawers])

    const customMakes = useMemo(() => {
        return filteredMakesWithModels.filter((m) => !m.is_protected)
    }, [filteredMakesWithModels])

    const standardMakes = useMemo(() => {
        return filteredMakesWithModels.filter((m) => Boolean(m.is_protected))
    }, [filteredMakesWithModels])

    const currentTotalCount = useMemo(() => {
        if (activeTab === "vehicle_model" || activeTab === "make") {
            return standardMakes.length
        }
        if (activeTab === "subcategory" || activeTab === "category") {
            return filteredCategoriesWithSubcategories.length
        }
        if (activeTab === "city" || activeTab === "country") {
            return filteredCountriesWithCities.length
        }
        if (scopeFilter === "inactive") {
            return currentFlatItems.inactiveItems.length
        }
        // Custom choices own the primary pagination count in flat tabs
        return currentFlatItems.activeItems.filter((i) => !i.is_protected).length
    }, [activeTab, standardMakes.length, filteredCategoriesWithSubcategories.length, filteredCountriesWithCities.length, scopeFilter, currentFlatItems])

    const currentTotalPages = Math.max(1, Math.ceil(currentTotalCount / (perPage || 20)))
    const currentPage = Math.min(Math.max(1, page), currentTotalPages)

    const paginatedStandardMakes = useMemo(() => {
        const pageSize = perPage || 20
        const start = (currentPage - 1) * pageSize
        return standardMakes.slice(start, start + pageSize)
    }, [standardMakes, currentPage, perPage])

    const paginatedCategories = useMemo(() => {
        const pageSize = perPage || 20
        const start = (currentPage - 1) * pageSize
        return filteredCategoriesWithSubcategories.slice(start, start + pageSize)
    }, [filteredCategoriesWithSubcategories, currentPage, perPage])

    const paginatedCountries = useMemo(() => {
        const pageSize = perPage || 20
        const start = (currentPage - 1) * pageSize
        return filteredCountriesWithCities.slice(start, start + pageSize)
    }, [filteredCountriesWithCities, currentPage, perPage])

    useEffect(() => {
        setPage(1)
    }, [activeTab, searchValue, scopeFilter, classFilter, sortBy, sortOrder])

    useEffect(() => {
        scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" })
    }, [currentPage, activeTab])

    const renderActiveItem = (item: ChoiceItem, typeKey: string) => {
        const mappedLabel = item.mapped_to_name || item.mobile_de_mapping
        const isMapped = !item.is_protected && Boolean(mappedLabel && mappedLabel.trim() !== "" && mappedLabel.toUpperCase() !== "NONE")

        return (
            <div key={item.id} className={ACTIVE_ITEM_CLASS}>
                {item.is_protected ? (
                    <div className="flex flex-wrap items-center gap-1.5 font-medium text-foreground text-left flex-1 min-w-0 py-0.5">
                        <span>{item.name}</span>
                        {item.percentage !== undefined && (
                            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {item.percentage}%
                            </span>
                        )}
                        {(item as any).vehicle_name && (
                            <span className="text-xs text-muted-foreground italic">
                                — {(item as any).vehicle_name}
                            </span>
                        )}
                        {typeKey === "payment_method" && (
                            <div className="inline-flex flex-wrap items-center gap-1">
                                {(item as any).applies_to_buy && (
                                    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                        {t("choices.scopeBuy", "Buy")}
                                    </span>
                                )}
                                {(item as any).applies_to_sale && (
                                    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                        {t("choices.scopeSale", "Sale")}
                                    </span>
                                )}
                                {(item as any).applies_to_transactions && (
                                    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                        {t("choices.scopeTransactions", "Transactions")}
                                    </span>
                                )}
                            </div>
                        )}
                        {["make", "body_type", "fuel_type", "doors"].includes(typeKey) && (item as any).vehicle_classes && (item as any).vehicle_classes.length > 0 && (
                            <span className="inline-flex flex-wrap items-center gap-1">
                                {((item as any).vehicle_classes as string[]).map((cls) => (
                                    <span
                                        key={cls}
                                        className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20"
                                    >
                                        {getVehicleClassLabel(cls)}
                                    </span>
                                ))}
                            </span>
                        )}
                    </div>
                ) : (
                    <button
                        onClick={() => openEditModal(typeKey, item)}
                        className="flex flex-wrap items-center gap-1.5 font-medium text-foreground hover:text-primary transition-colors text-left flex-1 min-w-0 py-0.5 cursor-pointer"
                    >
                        <span>{item.name}</span>
                        {item.percentage !== undefined && (
                            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {item.percentage}%
                            </span>
                        )}
                        {(item as any).vehicle_name && (
                            <span className="text-xs text-muted-foreground italic">
                                — {(item as any).vehicle_name}
                            </span>
                        )}
                        {typeKey === "payment_method" && (
                            <div className="inline-flex flex-wrap items-center gap-1">
                                {(item as any).applies_to_buy && (
                                    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                        {t("choices.scopeBuy", "Buy")}
                                    </span>
                                )}
                                {(item as any).applies_to_sale && (
                                    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                        {t("choices.scopeSale", "Sale")}
                                    </span>
                                )}
                                {(item as any).applies_to_transactions && (
                                    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                        {t("choices.scopeTransactions", "Transactions")}
                                    </span>
                                )}
                            </div>
                        )}
                        {["vehicle_type", "fuel_type", "body_type", "color", "doors"].includes(typeKey) && isMapped && (
                            <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
                                → {item.mapped_to_name || item.mobile_de_mapping}
                            </span>
                        )}
                        {["make", "body_type", "fuel_type", "doors"].includes(typeKey) && (item as any).vehicle_classes && (item as any).vehicle_classes.length > 0 && (
                            <span className="inline-flex flex-wrap items-center gap-1">
                                {((item as any).vehicle_classes as string[]).map((cls) => (
                                    <span
                                        key={cls}
                                        className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20"
                                    >
                                        {getVehicleClassLabel(cls)}
                                    </span>
                                ))}
                            </span>
                        )}
                    </button>
                )}
                {item.is_protected ? (
                    <span className="inline-flex items-center text-xs text-muted-foreground font-medium shrink-0 ml-2" title={t("choices.protectedTooltip", "Protected system choice locked for marketplace integrity")}>
                        {t("choices.protected", "Protected")}
                    </span>
                ) : (
                    <button
                        onClick={() => handleDeleteClick(typeKey, item.id, item.name)}
                        disabled={deactivateMutation.isPending}
                        className="text-xs font-semibold text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 disabled:opacity-50 transition-colors shrink-0 ml-2 cursor-pointer"
                    >
                        {t("common.delete", "Delete")}
                    </button>
                )}
            </div>
        )
    }

    const renderInactiveItem = (item: ChoiceItem, typeKey: string) => {
        const mappedLabel = item.mapped_to_name || item.mobile_de_mapping
        const isMapped = !item.is_protected && Boolean(mappedLabel && mappedLabel.trim() !== "" && mappedLabel.toUpperCase() !== "NONE")

        return (
            <div key={item.id} className={INACTIVE_ITEM_CLASS}>
                {item.is_protected ? (
                    <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-muted-foreground text-left flex-1 min-w-0 py-0.5">
                        <span>{item.name}</span>
                        {["make", "body_type", "fuel_type", "doors"].includes(typeKey) && (item as any).vehicle_classes && (item as any).vehicle_classes.length > 0 && (
                            <span className="inline-flex flex-wrap items-center gap-1 opacity-70">
                                {((item as any).vehicle_classes as string[]).map((cls) => (
                                    <span
                                        key={cls}
                                        className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20"
                                    >
                                        {getVehicleClassLabel(cls)}
                                    </span>
                                ))}
                            </span>
                        )}
                    </div>
                ) : (
                    <button
                        onClick={() => openEditModal(typeKey, item, null, false)}
                        className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary transition-colors text-left flex-1 min-w-0 py-0.5 cursor-pointer"
                    >
                        <span>{item.name}</span>
                        {["vehicle_type", "fuel_type", "body_type", "color", "doors"].includes(typeKey) && isMapped && (
                            <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20 opacity-70">
                                → {item.mapped_to_name || item.mobile_de_mapping}
                            </span>
                        )}
                        {["make", "body_type", "fuel_type", "doors"].includes(typeKey) && (item as any).vehicle_classes && (item as any).vehicle_classes.length > 0 && (
                            <span className="inline-flex flex-wrap items-center gap-1 opacity-70">
                                {((item as any).vehicle_classes as string[]).map((cls) => (
                                    <span
                                        key={cls}
                                        className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20"
                                    >
                                        {getVehicleClassLabel(cls)}
                                    </span>
                                ))}
                            </span>
                        )}
                        {typeKey === "payment_method" && (
                            <div className="inline-flex flex-wrap items-center gap-1 opacity-70">
                                {(item as any).applies_to_buy && (
                                    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                        {t("choices.scopeBuy", "Buy")}
                                    </span>
                                )}
                                {(item as any).applies_to_sale && (
                                    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                        {t("choices.scopeSale", "Sale")}
                                    </span>
                                )}
                                {(item as any).applies_to_transactions && (
                                    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                        {t("choices.scopeTransactions", "Transactions")}
                                    </span>
                                )}
                            </div>
                        )}
                    </button>
                )}
                <button
                    onClick={() => handleReactivate(typeKey, item.id)}
                    disabled={reactivateMutation.isPending}
                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300 disabled:opacity-50 transition-colors shrink-0 ml-2 cursor-pointer"
                >
                    {t("choices.reactivate", "Reactivate")}
                </button>
            </div>
        )
    }

    const renderChoiceTypeContent = (typeKey: string, typeData: ChoiceType | undefined) => {
        if (!typeData) return null

        const filterByClass = (items: ChoiceItem[]) => {
            if (!["make", "body_type", "fuel_type", "doors"].includes(typeKey) || classFilter === "all") return items
            return items.filter((i) => matchesClassFilter((i as any).vehicle_classes, classFilter))
        }

        const rawAllActive = filterByClass(typeData.active || []).map((i) => ({ ...i, is_active: true }))

        const allStandardActive = rawAllActive.filter((i) => Boolean(i.is_protected))
        const totalStandardCount = allStandardActive.length
        const inUseStandardCount = allStandardActive.filter((i) => Boolean(i.usage_count && i.usage_count > 0)).length
        const unusedStandardCount = Math.max(0, totalStandardCount - inUseStandardCount)

        const isUnusedExpanded =
            scopeFilter === "all_active" ||
            expandedUnusedDrawers.has(typeKey)

        const { activeItems, inactiveItems } = currentFlatItems
        const customActive = activeItems.filter((i) => !i.is_protected)
        const standardActive = activeItems.filter((i) => Boolean(i.is_protected))

        const hasVisibleItems =
            customActive.length > 0 ||
            totalStandardCount > 0 ||
            inactiveItems.length > 0

        const pageSize = perPage || 20
        const start = (currentPage - 1) * pageSize
        const paginatedCustom = customActive.slice(start, start + pageSize)
        const paginatedInactive = inactiveItems.slice(start, start + pageSize)

        const hasStandardMatchingSearch = Boolean(
            normalizedSearch && allStandardActive.some((i) => matchesSearch(i.name, normalizedSearch))
        )
        const isStandardDrawerOpen =
            openStandardDrawers.has(typeKey) ||
            hasStandardMatchingSearch

        return (
            <div>
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-medium text-foreground">{getTabDisplayName(typeKey)}</h3>
                    <button
                        type="button"
                        onClick={() => openAddModal(typeKey, `${t("choices.addNew", "Add New")} ${getTabDisplayName(typeKey)}`)}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 shadow-xs cursor-pointer"
                    >
                        <Plus className="h-4 w-4" />
                        {t("choices.addNew", "Add New")}
                    </button>
                </div>

                {!hasVisibleItems ? (
                    <div className="py-8 text-center space-y-2">
                        <p className="text-sm italic text-muted-foreground">
                            {normalizedSearch
                                ? t("choices.noMatchingItems", "No matching items found.")
                                : scopeFilter === "in_use"
                                    ? t("choices.noInUseChoices", "No choices currently in use or custom. Switch to 'All Active' to view all standard choices.")
                                    : t("choices.noItems", "No items available.")}
                        </p>
                        {!normalizedSearch && scopeFilter === "in_use" && (
                            <button
                                type="button"
                                onClick={() => setScopeFilter("all_active")}
                                className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                            >
                                {t("choices.showAllActiveAction", "Show all active standard choices")} →
                            </button>
                        )}
                    </div>
                ) : scopeFilter === "inactive" ? (
                    <div className="space-y-4">
                        <h4 className="text-sm font-semibold text-muted-foreground">
                            {t("choices.inactive", "Inactive")} ({inactiveItems.length})
                        </h4>
                        <div className="space-y-2">
                            {paginatedInactive.length > 0 ? (
                                paginatedInactive.map((item) => renderInactiveItem(item, typeKey))
                            ) : (
                                <p className="text-sm italic text-muted-foreground">
                                    {t("choices.noInactiveItems", "No inactive items")}
                                </p>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Custom Choices Section (Primary list owned by page pagination) */}
                        <div>
                            <div className="mb-2 flex items-center justify-between">
                                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                    <span>{t("choices.customChoices", "Custom Choices")}</span>
                                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-medium">
                                        {customActive.length}
                                    </span>
                                </h4>
                            </div>

                            {paginatedCustom.length > 0 ? (
                                <div className="space-y-2">
                                    {paginatedCustom.map((item) => renderActiveItem(item, typeKey))}
                                </div>
                            ) : (
                                <div className="rounded-lg border border-dashed border-gray-200 dark:border-border p-5 text-center bg-gray-50/40 dark:bg-muted/10">
                                    <p className="text-xs italic text-muted-foreground">
                                        {normalizedSearch
                                            ? t("choices.noMatchingItems", "No matching custom choices found.")
                                            : t("choices.noCustomChoices", "No custom choices added yet.")}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Standard Baseline Choices (In a closed drawer reference section) */}
                        {totalStandardCount > 0 && (
                            <div className="rounded-lg border border-gray-200 dark:border-border bg-gray-50/50 dark:bg-card/50 overflow-hidden shadow-2xs">
                                <button
                                    type="button"
                                    onClick={() => toggleStandardDrawer(typeKey)}
                                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50/90 dark:bg-muted/40 hover:bg-gray-100/80 dark:hover:bg-muted/70 transition-colors text-left cursor-pointer"
                                >
                                    <div className="flex items-center gap-2">
                                        <Lock className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-xs font-semibold text-foreground">
                                            {t("choices.standardBaselineOptions", "Standard Baseline Choices")}
                                        </span>
                                        <span className="text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                            {isUnusedExpanded
                                                ? totalStandardCount
                                                : inUseStandardCount}
                                        </span>
                                        {scopeFilter === "in_use" && !isUnusedExpanded && inUseStandardCount > 0 && (
                                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                                                ({t("choices.inUseOnly", "in inventory")})
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <span className="text-xs">
                                            {isStandardDrawerOpen ? t("common.collapse", "Collapse") : t("common.expand", "Expand")}
                                        </span>
                                        {isStandardDrawerOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                    </div>
                                </button>

                                {isStandardDrawerOpen && (
                                    <div className="p-3.5 border-t border-gray-200 dark:border-border bg-white dark:bg-card space-y-3">
                                        <div className="max-h-72 overflow-y-auto flex flex-wrap gap-2 pr-1">
                                            {standardActive.length > 0 ? (
                                                standardActive.map((item) => (
                                                    <div
                                                        key={item.id}
                                                        title={item.name}
                                                        className="inline-flex min-h-[30px] items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs shadow-2xs bg-gray-100/90 border-gray-300/80 dark:bg-muted/60 dark:border-border text-foreground cursor-default"
                                                    >
                                                        <span className="font-medium">
                                                            {item.name}
                                                        </span>
                                                        {["body_type", "fuel_type", "doors"].includes(typeKey) && (item as any).vehicle_classes && (item as any).vehicle_classes.length > 0 && (
                                                            <span className="inline-flex flex-wrap items-center gap-0.5 ml-1">
                                                                {((item as any).vehicle_classes as string[]).map((cls) => (
                                                                    <span
                                                                        key={cls}
                                                                        className="inline-flex items-center rounded px-1 py-0.2 text-[9px] font-medium bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20"
                                                                    >
                                                                        {getVehicleClassLabel(cls)}
                                                                    </span>
                                                                ))}
                                                            </span>
                                                        )}
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="text-xs italic text-muted-foreground py-2 text-center w-full">
                                                    {normalizedSearch
                                                        ? t("choices.noMatchingItems", "No matching items found.")
                                                        : t("choices.noInUseStandardChoices", "No standard choices currently used in inventory.")}
                                                </p>
                                            )}
                                        </div>
                                        {scopeFilter === "in_use" && unusedStandardCount > 0 && !normalizedSearch && (
                                            !isUnusedExpanded ? (
                                                <div className="pt-2 border-t border-border/50 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                                                    <span>
                                                        {t("choices.hiddenStandardChoicesCount", {
                                                            count: unusedStandardCount,
                                                            defaultValue: `${unusedStandardCount} standard baseline choices without vehicles are hidden.`
                                                        })}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleUnusedStandardChoices(typeKey)}
                                                        className="inline-flex items-center gap-1 text-primary hover:underline font-medium cursor-pointer"
                                                    >
                                                        <span>{t("choices.showAllStandard", "Show all standard")}</span>
                                                        <span className="text-[11px] opacity-80">({unusedStandardCount})</span>
                                                        <ChevronDown className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="pt-2 border-t border-border/50 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground bg-muted/20 -mx-3.5 -mb-3.5 px-3.5 py-2.5 rounded-b-lg">
                                                    <span className="text-foreground/80">
                                                        {t("choices.showingAllStandardNotice", "Showing all standard choices (including unused).")}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleUnusedStandardChoices(typeKey)}
                                                        className="inline-flex items-center gap-1 text-primary hover:text-primary/80 font-semibold cursor-pointer text-xs"
                                                    >
                                                        <ChevronUp className="h-3.5 w-3.5" />
                                                        <span>{t("choices.collapseToInUse", "Collapse to in-use only")}</span>
                                                    </button>
                                                </div>
                                            )
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {scopeFilter === "all" && inactiveItems.length > 0 && (
                            <div className="space-y-2 pt-4 border-t border-border/60">
                                <h4 className="text-sm font-semibold text-muted-foreground">
                                    {t("choices.inactive", "Inactive")} ({inactiveItems.length})
                                </h4>
                                {paginatedInactive.map((item) => renderInactiveItem(item, typeKey))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        )
    }

    const renderMakeItem = (makeGroup: any) => {
        const isExpanded = expandedMakes.has(makeGroup.id)

        return (
            <div key={makeGroup.id} className="mb-4 rounded-lg border border-border">
                                    <div
                                        role="button"
                                        tabIndex={0}
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
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault()
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
                                        }}
                                        className="flex w-full items-center justify-between rounded-lg bg-muted/50 px-4 py-3 text-left hover:bg-muted cursor-pointer select-none"
                                    >
                                        <div className="flex flex-wrap items-center gap-1.5 min-w-0 flex-1 mr-2">
                                            {makeGroup.is_protected ? (
                                                <span className="font-medium text-foreground text-left">
                                                    {makeGroup.name}
                                                </span>
                                            ) : (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        openEditModal("make", makeGroup as any)
                                                    }}
                                                    className="font-medium text-foreground hover:text-primary transition-colors text-left cursor-pointer"
                                                >
                                                    {makeGroup.name}
                                                </button>
                                            )}
                                            {!makeGroup.is_protected && (makeGroup.mapped_to_name || makeGroup.mobile_de_mapping) && (makeGroup.mapped_to_name || makeGroup.mobile_de_mapping)!.trim() !== "" && (makeGroup.mapped_to_name || makeGroup.mobile_de_mapping)!.toUpperCase() !== "NONE" && (
                                                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
                                                    → {makeGroup.mapped_to_name || makeGroup.mobile_de_mapping}
                                                </span>
                                            )}
                                            {(makeGroup as any).vehicle_classes && (makeGroup as any).vehicle_classes.length > 0 && (
                                                <span className="inline-flex flex-wrap items-center gap-1">
                                                    {((makeGroup as any).vehicle_classes as string[]).map((cls) => (
                                                        <span
                                                            key={cls}
                                                            className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20"
                                                        >
                                                            {getVehicleClassLabel(cls)}
                                                        </span>
                                                    ))}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-xs text-muted-foreground">
                                                {(makeGroup.models_active || []).length} {t("choices.models", "models")}
                                            </span>
                                            {!makeGroup.is_protected && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        openEditModal("make", makeGroup as any)
                                                    }}
                                                    className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                                                    title={t("common.edit", "Edit")}
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                            {makeGroup.is_protected ? (
                                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-medium" title={t("choices.protectedTooltip", "Protected system choice locked for marketplace integrity")}>
                                                    <Lock className="size-3 text-muted-foreground" />
                                                    {t("choices.protected", "Protected")}
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleDeleteClick("make", (makeGroup as any).id, makeGroup.name)
                                                    }}
                                                    disabled={deactivateMutation.isPending}
                                                    className="h-7 w-7 flex items-center justify-center rounded-md text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                                    title={t("common.delete", "Delete")}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                            {isExpanded ? (
                                                <ChevronDown className="h-5 w-5" />
                                            ) : (
                                                <ChevronRight className="h-5 w-5" />
                                            )}
                                    </div>
                                </div>

                                {isExpanded && (() => {
                                    const allActiveModels = sortItems<ChoiceItem>((makeGroup.models_active as ChoiceItem[]) || [])
                    const allInactiveModels = sortItems<ChoiceItem>((makeGroup.models_inactive as ChoiceItem[]) || [])

                    const customActiveModels = (normalizedSearch ? filterItems<ChoiceItem>(allActiveModels) : allActiveModels).filter((m) => !m.is_protected)
                    const customInactiveModels = (normalizedSearch ? filterItems<ChoiceItem>(allInactiveModels) : allInactiveModels).filter((m) => !m.is_protected)

                    const standardActiveModels = (normalizedSearch ? filterItems<ChoiceItem>(allActiveModels) : allActiveModels).filter((m) => Boolean(m.is_protected))
                    const standardInactiveModels = (normalizedSearch ? filterItems<ChoiceItem>(allInactiveModels) : allInactiveModels).filter((m) => Boolean(m.is_protected))

                                        const totalStandardCount = allActiveModels.filter((m) => Boolean(m.is_protected)).length
                                        const isStandardExpanded =
                                            (makeGroup as any).isStandardExpanded ||
                                            Boolean(normalizedSearch && (standardActiveModels.length > 0 || standardInactiveModels.length > 0))

                                        return (
                                            <div className="border-t border-border px-4 py-3.5 space-y-4 bg-muted/10 dark:bg-muted/5">
                                                {/* Section 1: Custom / Dealership Models */}
                                                <div>
                                                    <div className="mb-2 flex items-center justify-between">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-xs font-semibold tracking-wide text-foreground">
                                                                {t("choices.customModels", "Custom Models")}
                                                            </span>
                                                            <span className="text-[11px] text-muted-foreground bg-muted/70 px-1.5 py-0.2 rounded-full font-medium">
                                                                {customActiveModels.length}
                                                            </span>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                openAddModal(
                                                                    "vehicle_model",
                                                                    `${t("choices.addModelFor", "Add Model for")} ${makeGroup.name}`,
                                                                    makeGroup.id,
                                                                    makeGroup
                                                                )
                                                            }
                                                            className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-2xs"
                                                        >
                                                            <Plus className="h-3 w-3" />
                                                            {t("choices.addModel", "Add Model")}
                                                        </button>
                                                    </div>

                                                    {customActiveModels.length > 0 || customInactiveModels.length > 0 ? (
                                                        <div className="flex flex-wrap gap-2 pt-0.5">
                                                            {customActiveModels.map((model) => {
                                                                const mappedLabel = model.mapped_to_name || model.mobile_de_mapping
                                                                const isMapped = Boolean(mappedLabel && mappedLabel.trim() !== "" && mappedLabel.toUpperCase() !== "NONE")

                                                                return (
                                                                    <button
                                                                        key={model.id}
                                                                        type="button"
                                                                        onClick={() => openEditModal("vehicle_model", model, makeGroup, true)}
                                                                        title={model.name}
                                                                        className="inline-flex min-h-[30px] items-center gap-2 rounded-md border px-2.5 py-1 text-xs shadow-2xs transition-all cursor-pointer text-left group bg-white hover:bg-gray-50/80 hover:border-gray-300 dark:bg-card dark:hover:bg-muted/30 border-gray-200 dark:border-border text-foreground"
                                                                    >
                                                                        <span className="font-medium truncate max-w-[170px] group-hover:text-primary transition-colors">
                                                                            {model.name}
                                                                        </span>
                                                                        {isMapped && (
                                                                            <span className="inline-flex items-center rounded px-1.5 py-0.2 text-[9px] font-medium bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20 shrink-0">
                                                                                → {model.mapped_to_name || model.mobile_de_mapping}
                                                                            </span>
                                                                        )}
                                                                    </button>
                                                                )
                                                            })}

                                                            {customInactiveModels.map((model) => {
                                                                const mappedLabel = model.mapped_to_name || model.mobile_de_mapping
                                                                const isMapped = Boolean(mappedLabel && mappedLabel.trim() !== "" && mappedLabel.toUpperCase() !== "NONE")

                                                                return (
                                                                    <div
                                                                        key={model.id}
                                                                        className="inline-flex min-h-[32px] items-center justify-between gap-2 rounded-md border border-dashed border-gray-200/80 dark:border-border/60 bg-gray-50/60 dark:bg-zinc-900/30 px-2.5 py-1 text-xs opacity-70 hover:opacity-100 transition-all group"
                                                                    >
                                                                        <button
                                                                            onClick={() => openEditModal("vehicle_model", model, makeGroup, false)}
                                                                            className="font-medium text-muted-foreground line-through hover:text-foreground transition-colors text-left truncate max-w-[150px] cursor-pointer"
                                                                            title={model.name}
                                                                        >
                                                                            {model.name}
                                                                        </button>
                                                                        {isMapped && (
                                                                            <span className="inline-flex items-center rounded px-1.5 py-0.2 text-[9px] font-medium bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20 shrink-0">
                                                                                → {model.mapped_to_name || model.mobile_de_mapping}
                                                                            </span>
                                                                        )}
                                                                        <div className="flex items-center gap-1 shrink-0">
                                                                            <button
                                                                                onClick={() => handleReactivate("vehicle_model", model.id)}
                                                                                disabled={reactivateMutation.isPending}
                                                                                title={t("choices.reactivate", "Reactivate")}
                                                                                className="p-0.5 text-emerald-600 hover:text-emerald-500 font-semibold text-[11px] cursor-pointer"
                                                                            >
                                                                                {t("choices.reactivate", "Reactivate")}
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <p className="text-xs italic text-muted-foreground py-1">
                                                            {t("choices.noCustomModels", "No custom models added for this make.")}
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Section 2: Standard Baseline Models Drawer */}
                                                {totalStandardCount > 0 && (
                                                    <div className="rounded-lg border border-gray-200 dark:border-border bg-gray-50/50 dark:bg-card/50 overflow-hidden shadow-2xs">
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleParentChildrenExpansion("make", makeGroup.id)}
                                                            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50/90 dark:bg-muted/40 hover:bg-gray-100/80 dark:hover:bg-muted/70 transition-colors text-left cursor-pointer"
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <Lock className="h-4 w-4 text-muted-foreground" />
                                                                <span className="text-xs font-semibold text-foreground">
                                                                    {t("choices.standardModels", "Standard Baseline Models")}
                                                                </span>
                                                                <span className="text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                                                    {totalStandardCount}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-muted-foreground">
                                                                <span className="text-xs">
                                                                    {isStandardExpanded ? t("common.collapse", "Collapse") : t("common.expand", "Expand")}
                                                                </span>
                                                                {isStandardExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                            </div>
                                                        </button>

                                                        {isStandardExpanded && (
                                                            <div className="p-3.5 border-t border-gray-200 dark:border-border bg-white dark:bg-card">
                                                                <div className="max-h-72 overflow-y-auto flex flex-wrap gap-2 pr-1">
                                                                    {standardActiveModels.map((model) => (
                                                                        <div
                                                                            key={model.id}
                                                                            title={model.name}
                                                                            className="inline-flex min-h-[30px] items-center rounded-md border px-2.5 py-1 text-xs shadow-2xs bg-gray-100/90 border-gray-300/80 dark:bg-muted/60 dark:border-border text-foreground cursor-default"
                                                                        >
                                                                            <span className="font-medium truncate max-w-[170px]">
                                                                                {model.name}
                                                                            </span>
                                                                        </div>
                                                                    ))}

                                                                    {standardInactiveModels.map((model) => (
                                                                        <div
                                                                            key={model.id}
                                                                            className="inline-flex min-h-[32px] items-center justify-between gap-2 rounded-md border border-dashed border-gray-200/80 dark:border-border/60 bg-gray-50/60 dark:bg-zinc-900/30 px-2.5 py-1 text-xs opacity-70 hover:opacity-100 transition-all group"
                                                                        >
                                                                            <span
                                                                                className="font-medium text-muted-foreground line-through truncate max-w-[150px]"
                                                                                title={model.name}
                                                                            >
                                                                                {model.name}
                                                                            </span>
                                                                            <div className="flex items-center gap-1 shrink-0">
                                                                                <button
                                                                                    onClick={() => handleReactivate("vehicle_model", model.id)}
                                                                                    disabled={reactivateMutation.isPending}
                                                                                    title={t("choices.reactivate", "Reactivate")}
                                                                                    className="p-0.5 text-emerald-600 hover:text-emerald-500 font-semibold text-[11px] cursor-pointer"
                                                                                >
                                                                                    {t("choices.reactivate", "Reactivate")}
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    ))}

                                                                    {standardActiveModels.length === 0 && standardInactiveModels.length === 0 && (
                                                                        <p className="text-xs italic text-muted-foreground py-1">
                                                                            {t("choices.noMatchingItems", "No matching items found.")}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })()}
                                </div>
        )
    }

    const renderVehicleModelContent = () => (
        <div>
            <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-medium text-foreground">
                    {t("choices.makesAndModels", "Makes & Models")}
                </h3>
                <button
                    type="button"
                    onClick={() => openAddModal("make", t("choices.addNewMake", "Add New Make"))}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 shadow-sm transition-colors cursor-pointer"
                >
                    <Plus className="h-4 w-4" />
                    {t("choices.addMake", "Add Make")}
                </button>
            </div>

            {/* Section 1: Dealership Custom Makes (Pinned at the Top) */}
            <div className="mb-6 space-y-3">
                <div className="flex items-center justify-between border-b border-border/60 pb-2">
                    <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-foreground">
                            {t("choices.customMakes", "Custom Makes")}
                        </h4>
                        <span className="text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                            {customMakes.length}
                        </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                        {t("choices.customMakesSubtitle", "Makes created specifically by your dealership")}
                    </span>
                </div>

                {customMakes.length > 0 ? (
                    <div className="space-y-2">
                        {customMakes.map((makeGroup) => renderMakeItem(makeGroup))}
                    </div>
                ) : (
                    <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-4 py-3.5 text-center">
                        <p className="text-xs text-muted-foreground">
                            {normalizedSearch
                                ? t("choices.noMatchingCustomMakes", "No custom makes match your search.")
                                : t("choices.noCustomMakesYet", "No custom makes created yet. Makes you add will appear pinned here.")}
                        </p>
                    </div>
                )}
            </div>

            {/* Section 2: Standard Baseline Makes Catalog (Paginated below) */}
            <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-border/60 pb-2">
                    <div className="flex items-center gap-2">
                        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                        <h4 className="text-sm font-semibold text-foreground">
                            {t("choices.standardCatalog", "Standard Makes Catalog")}
                        </h4>
                        <span className="text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                            {standardMakes.length}
                        </span>
                    </div>
                    {standardMakes.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                            {t("choices.pageOf", "Page {{current}} of {{total}}", { current: currentPage, total: currentTotalPages })}
                        </span>
                    )}
                </div>

                {paginatedStandardMakes.length > 0 ? (
                    <div className="space-y-2">
                        {paginatedStandardMakes.map((makeGroup) => renderMakeItem(makeGroup))}
                    </div>
                ) : (
                    <div className="rounded-lg border border-dashed border-border p-6 text-center">
                        <p className="text-sm font-medium text-muted-foreground">
                            {normalizedSearch
                                ? t("choices.noMatchingStandardMakes", "No standard catalog makes match your search.")
                                : scopeFilter === "in_use"
                                    ? t("choices.noInUseStandardMakes", "No standard makes currently in use in inventory.")
                                    : t("choices.noStandardMakes", "No standard catalog makes available.")}
                        </p>
                        {scopeFilter === "in_use" && !normalizedSearch && (
                            <button
                                type="button"
                                onClick={() => setScopeFilter("all_active")}
                                className="mt-2 text-xs font-medium text-primary hover:underline cursor-pointer"
                            >
                                {t("choices.showAllActiveAction", "Show all standard catalog choices")} →
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    )

    const renderSubcategoriesContent = () => (
        <div>
            <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-medium text-foreground">
                    {t("choices.categoriesAndSubcategories", "Categories & Subcategories")}
                </h3>
                <button
                    type="button"
                    onClick={() => openAddModal("category", t("choices.addNewCategory", "Add New Category"))}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 shadow-sm transition-colors"
                >
                    <Plus className="h-4 w-4" />
                    {t("choices.addCategory", "Add Category")}
                </button>
            </div>

            {paginatedCategories.length > 0 ? (
                <div className="space-y-2">
                    {paginatedCategories.map((categoryGroup) => {
                        const isExpanded = expandedCategories.has(categoryGroup.id)
                        const activeSubs = categoryGroup.filteredActive || []
                        const inactiveSubs = categoryGroup.filteredInactive || []
                        const visibleChildrenCount = activeSubs.length + inactiveSubs.length

                        return (
                            <div key={categoryGroup.id} className="mb-4 rounded-lg border border-border">
                                <div
                                    role="button"
                                    tabIndex={0}
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
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault()
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
                                    }}
                                    className="flex w-full items-center justify-between rounded-lg bg-muted/50 px-4 py-3 text-left hover:bg-muted cursor-pointer select-none"
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
                                                openEditModal("category", categoryGroup as any)
                                            }}
                                            className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                            title={t("common.edit", "Edit")}
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                        {(categoryGroup as any).is_protected ? (
                                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-medium" title={t("choices.protectedTooltip", "Protected system choice locked for marketplace integrity")}>
                                                <Lock className="size-3 text-muted-foreground" />
                                                {t("choices.protected", "Protected")}
                                            </span>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleDeleteClick("category", categoryGroup.id, categoryGroup.name)
                                                }}
                                                disabled={deactivateMutation.isPending}
                                                className="h-7 w-7 flex items-center justify-center rounded-md text-rose-500 hover:bg-rose-500/10 transition-colors"
                                                title={t("common.delete", "Delete")}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                        {isExpanded ? (
                                            <ChevronDown className="h-5 w-5" />
                                        ) : (
                                            <ChevronRight className="h-5 w-5" />
                                        )}
                                    </div>
                                </div>

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

                                        <div className="flex flex-wrap gap-2 pt-1">
                                            {categoryGroup.filteredActive.map((sub) => {
                                                const isLocked = Boolean((sub as any).is_protected)
                                                return (
                                                    <button
                                                        key={sub.id}
                                                        type="button"
                                                        onClick={() => openEditModal("subcategory", sub, null, true)}
                                                        title={isLocked ? `${sub.name} (${t("choices.protectedTooltip", "Protected system choice locked for marketplace integrity")})` : sub.name}
                                                        className={cn(
                                                            "inline-flex min-h-[30px] items-center gap-2 rounded-md border px-2.5 py-1 text-xs shadow-2xs transition-all cursor-pointer text-left group",
                                                            isLocked
                                                                ? "bg-gray-100/90 hover:bg-gray-200/70 border-gray-300/80 dark:bg-muted/60 dark:hover:bg-muted/90 dark:border-border text-foreground"
                                                                : "bg-white hover:bg-gray-50/80 hover:border-gray-300 dark:bg-card dark:hover:bg-muted/30 border-gray-200 dark:border-border text-foreground"
                                                        )}
                                                    >
                                                        <span className="font-medium truncate max-w-[170px] group-hover:text-primary transition-colors">
                                                            {sub.name}
                                                        </span>
                                                        {(sub as any).mobile_de_mapping && (sub as any).mobile_de_mapping.trim() !== "" && (sub as any).mobile_de_mapping.toUpperCase() !== "NONE" && (
                                                            <span className="inline-flex items-center rounded px-1.5 py-0.2 text-[9px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 shrink-0">
                                                                {(sub as any).mobile_de_mapping}
                                                            </span>
                                                        )}
                                                    </button>
                                                )
                                            })}

                                            {categoryGroup.filteredInactive.map((sub) => (
                                                <div
                                                    key={sub.id}
                                                    className="inline-flex min-h-[32px] items-center justify-between gap-2 rounded-md border border-dashed border-gray-200/80 dark:border-border/60 bg-gray-50/60 dark:bg-zinc-900/30 px-2.5 py-1 text-xs opacity-70 hover:opacity-100 transition-all group"
                                                >
                                                    <button
                                                        onClick={() => openEditModal("subcategory", sub, null, false)}
                                                        className="font-medium text-muted-foreground line-through hover:text-foreground transition-colors text-left truncate max-w-[160px]"
                                                        title={sub.name}
                                                    >
                                                        {sub.name}
                                                    </button>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <button
                                                            onClick={() => handleReactivate("subcategory", sub.id)}
                                                            disabled={reactivateMutation.isPending}
                                                            title={t("choices.reactivate", "Reactivate")}
                                                            className="p-0.5 text-emerald-600 hover:text-emerald-500 font-semibold text-[11px]"
                                                        >
                                                            {t("choices.reactivate", "Reactivate")}
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}

                                            {visibleChildrenCount === 0 && (
                                                <div className="w-full py-2 text-xs text-muted-foreground italic">
                                                    {normalizedSearch
                                                        ? t("choices.noMatchingItems", "No matching items found.")
                                                        : t("choices.noSubcategories", "No subcategories")}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            ) : (
                <div className="rounded-lg border border-dashed border-border p-8 text-center">
                    <p className="text-sm font-medium text-muted-foreground">
                        {normalizedSearch
                            ? t("choices.noMatchingItems", "No matching items found.")
                            : scopeFilter === "in_use"
                                ? t("choices.noInUseChoices", "No in-use choices found.")
                                : t("choices.noCategories", "No categories found. Please add categories first.")}
                    </p>
                    {scopeFilter === "in_use" && !normalizedSearch && (
                        <button
                            type="button"
                            onClick={() => setScopeFilter("all_active")}
                            className="mt-2 text-xs font-medium text-primary hover:underline cursor-pointer"
                        >
                            {t("choices.showAllActiveAction", "Show all active")}
                        </button>
                    )}
                </div>
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

            {paginatedCountries.length > 0 ? (
                <div className="rounded-lg border border-border bg-card shadow-sm p-4">
                    {paginatedCountries.map((countryGroup) => {
                        const isExpanded = expandedCountries.has(countryGroup.id)
                        const activeCities = countryGroup.filteredActive || []
                        const inactiveCities = countryGroup.filteredInactive || []
                        const visibleChildrenCount = activeCities.length + inactiveCities.length

                        return (
                            <div key={`country-${countryGroup.id}`} className="mb-4 rounded-lg border border-border">
                                <div
                                    role="button"
                                    tabIndex={0}
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
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault()
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
                                    }}
                                    className="flex w-full items-center justify-between rounded-lg bg-muted/50 px-4 py-3 text-left hover:bg-muted cursor-pointer select-none"
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
                                                openEditModal("country", countryGroup as any)
                                            }}
                                            className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                            title={t("common.edit", "Edit")}
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                        {(countryGroup as any).is_protected ? (
                                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-medium" title={t("choices.protectedTooltip", "Protected system choice locked for marketplace integrity")}>
                                                <Lock className="size-3 text-muted-foreground" />
                                                {t("choices.protected", "Protected")}
                                            </span>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleDeleteClick("country", countryGroup.id, countryGroup.name)
                                                }}
                                                disabled={deactivateMutation.isPending}
                                                className="h-7 w-7 flex items-center justify-center rounded-md text-rose-500 hover:bg-rose-500/10 transition-colors"
                                                title={t("common.delete", "Delete")}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                        {isExpanded ? (
                                            <ChevronDown className="h-5 w-5" />
                                        ) : (
                                            <ChevronRight className="h-5 w-5" />
                                        )}
                                    </div>
                                </div>

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

                                        <div className="flex flex-wrap gap-2 pt-1">
                                            {activeCities.map((city) => {
                                                const isLocked = Boolean((city as any).is_protected)
                                                return (
                                                    <button
                                                        key={`active-city-${city.id}`}
                                                        type="button"
                                                        onClick={() => openEditModal("city", city as any, null, true)}
                                                        title={isLocked ? `${city.name} (${t("choices.protectedTooltip", "Protected system choice locked for marketplace integrity")})` : city.name}
                                                        className={cn(
                                                            "inline-flex min-h-[30px] items-center gap-2 rounded-md border px-2.5 py-1 text-xs shadow-2xs transition-all cursor-pointer text-left group",
                                                            isLocked
                                                                ? "bg-gray-100/90 hover:bg-gray-200/70 border-gray-300/80 dark:bg-muted/60 dark:hover:bg-muted/90 dark:border-border text-foreground"
                                                                : "bg-white hover:bg-gray-50/80 hover:border-gray-300 dark:bg-card dark:hover:bg-muted/30 border-gray-200 dark:border-border text-foreground"
                                                        )}
                                                    >
                                                        <span className="font-medium truncate max-w-[170px] group-hover:text-primary transition-colors">
                                                            {city.name}
                                                        </span>
                                                        {(city as any).mobile_de_mapping && (city as any).mobile_de_mapping.trim() !== "" && (city as any).mobile_de_mapping.toUpperCase() !== "NONE" && (
                                                            <span className="inline-flex items-center rounded px-1.5 py-0.2 text-[9px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 shrink-0">
                                                                {(city as any).mobile_de_mapping}
                                                            </span>
                                                        )}
                                                    </button>
                                                )
                                            })}

                                            {inactiveCities.map((city) => (
                                                <div
                                                    key={`inactive-city-${city.id}`}
                                                    className="inline-flex min-h-[32px] items-center justify-between gap-2 rounded-md border border-dashed border-gray-200/80 dark:border-border/60 bg-gray-50/60 dark:bg-zinc-900/30 px-2.5 py-1 text-xs opacity-70 hover:opacity-100 transition-all group"
                                                >
                                                    <button
                                                        onClick={() => openEditModal("city", city as any, null, false)}
                                                        className="font-medium text-muted-foreground line-through hover:text-foreground transition-colors text-left truncate max-w-[160px]"
                                                        title={city.name}
                                                    >
                                                        {city.name}
                                                    </button>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <button
                                                            onClick={() => handleReactivate("city", city.id)}
                                                            disabled={reactivateMutation.isPending}
                                                            title={t("choices.reactivate", "Reactivate")}
                                                            className="p-0.5 text-emerald-600 hover:text-emerald-500 font-semibold text-[11px]"
                                                        >
                                                            {t("choices.reactivate", "Reactivate")}
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}

                                            {visibleChildrenCount === 0 && (
                                                <div className="w-full py-2 text-xs text-muted-foreground italic">
                                                    {normalizedSearch
                                                        ? t("choices.noMatchingCities", "No matching cities found for this country.")
                                                        : t("choices.noCitiesInCountry", "No cities found in this country.")}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            ) : (
                <div className="rounded-lg border border-dashed border-border p-8 text-center">
                    <p className="text-sm font-medium text-muted-foreground">
                        {normalizedSearch
                            ? t("choices.noMatchingItems", "No matching items found.")
                            : scopeFilter === "in_use"
                                ? t("choices.noInUseChoices", "No in-use choices found.")
                                : t("choices.noCountries", "No countries found. Please add countries first.")}
                    </p>
                    {scopeFilter === "in_use" && !normalizedSearch && (
                        <button
                            type="button"
                            onClick={() => setScopeFilter("all_active")}
                            className="mt-2 text-xs font-medium text-primary hover:underline cursor-pointer"
                        >
                            {t("choices.showAllActiveAction", "Show all active")}
                        </button>
                    )}
                </div>
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
                {/* Left Sidebar (Hierarchical & Collapsible Sections) */}
                <div className="w-full md:w-64 flex-shrink-0 flex flex-col rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden shadow-xs">
                    <div className="px-3 py-2 border-b border-gray-200 dark:border-border bg-gray-50/50 dark:bg-muted/30">
                        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-700 dark:text-foreground">
                            {t("choices.sections", "Sections & Categories")}
                        </h3>
                    </div>
                    <nav className="flex-1 overflow-y-auto p-2 space-y-2.5" aria-label="Choices Categories">
                        {[
                            {
                                id: "vehicle_specs",
                                title: t("choices.sectionVehicleSpecs", "Vehicle Data & Specs"),
                                icon: Car,
                                items: [
                                    { key: "vehicle_type", displayName: t("choices.vehicleTypes", "Vehicle Types"), level: 0 },
                                    { key: "vehicle_model", displayName: t("choices.makesAndModels", "Makes & Models"), level: 0 },
                                    { key: "body_type", displayName: t("choices.bodyTypes", "Body Types"), level: 0 },
                                    { key: "fuel_type", displayName: t("choices.fuelTypes", "Fuel Types"), level: 0 },
                                    { key: "color", displayName: t("choices.colors", "Colors"), level: 0 },
                                    { key: "doors", displayName: t("choices.doors", "Door Options"), level: 0 },
                                    { key: "damage_type", displayName: t("choices.damageTypes", "Damage Types"), level: 0 },
                                ],
                            },
                            {
                                id: "accounting_docs",
                                title: t("choices.sectionAccountingDocs", "Accounting & Invoices"),
                                icon: FileText,
                                items: [
                                    { key: "subcategory", displayName: t("choices.categoriesAndSubcategories", "Categories & Subcategories"), level: 0 },
                                ],
                            },
                            {
                                id: "geography_locations",
                                title: t("choices.sectionGeographyLocations", "Geography & Locations"),
                                icon: Globe,
                                items: [
                                    { key: "city", displayName: t("choices.countriesAndCities", "Countries & Cities"), level: 0 },
                                ],
                            },
                            {
                                id: "finance_taxes",
                                title: t("choices.sectionFinanceTaxes", "Finance & Taxes"),
                                icon: CreditCard,
                                items: [
                                    { key: "payment_method", displayName: t("choices.paymentMethods", "Payment Methods"), level: 0 },
                                    { key: "tax_percentage", displayName: t("choices.taxPercentages", "Tax Percentages"), level: 0 },
                                    /**
                                     * =========================================================================================
                                     * CURRENCIES TAB — TEMPORARILY HIDDEN FROM SIDEBAR
                                     * =========================================================================================
                                     * Status: Intentionally commented out per user request.
                                     * Reason: Dealership vehicles and financial transaction workflows currently operate
                                     *         exclusively in EUR (€). Currency choice management is not yet utilized in business ops.
                                     *
                                     * DO NOT DELETE OR PERMANENTLY REMOVE:
                                     * - The underlying Django Currency model (`backend/manager/models.py`),
                                     * - API routes (`backend/manager/api.py` /choices/currency/*),
                                     * - Choice seeds (`seed_all_choices.py`), and
                                     * - Translation strings (`choices.currencies`).
                                     * They must remain completely intact so multi-currency features can be re-enabled instantly
                                     * by uncommenting this single tab entry when cross-border/multi-currency support is introduced.
                                     * =========================================================================================
                                     */
                                    // { key: "currency", displayName: t("choices.currencies", "Currencies"), level: 0 },
                                ],
                            },
                            {
                                id: "dealership_ops",
                                title: t("choices.sectionDealershipOps", "Dealership Operations"),
                                icon: Key,
                                items: [
                                    { key: "key_number", displayName: t("choices.keyNumbers", "Key Numbers"), level: 0 },
                                ],
                            },
                        ].map((section, idx) => {
                            const isCollapsed = collapsedSections[section.id]
                            const SectionIcon = section.icon
                            return (
                                <div key={section.id} className="space-y-1">
                                    {idx > 0 && <div className="my-2 border-t border-gray-200 dark:border-border/60" />}
                                    <button
                                        type="button"
                                        onClick={() => toggleSection(section.id)}
                                        className="w-full flex items-center justify-between px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 hover:text-foreground hover:bg-gray-100/60 dark:hover:bg-muted/40 rounded transition-colors group"
                                    >
                                        <div className="flex items-center gap-1.5 truncate">
                                            <SectionIcon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
                                            <span className="truncate">{section.title}</span>
                                        </div>
                                        {isCollapsed ? (
                                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        ) : (
                                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        )}
                                    </button>

                                    {!isCollapsed && (
                                        <div className="space-y-0.5 mt-0.5">
                                            {section.items.map((item) => {
                                                const isActive = activeTab === item.key
                                                return (
                                                    <button
                                                        key={item.key}
                                                        onClick={() => handleTabChange(item.key)}
                                                        className={cn(
                                                            "w-full text-left py-1.5 rounded-md text-xs transition-colors flex items-center justify-between",
                                                            item.level === 0
                                                                ? "px-3 font-medium"
                                                                : "pl-7 pr-3 font-normal",
                                                            isActive
                                                                ? "bg-primary/10 text-primary font-semibold"
                                                                : "text-gray-600 dark:text-muted-foreground hover:bg-gray-100 dark:hover:bg-muted hover:text-gray-900 dark:hover:text-foreground"
                                                        )}
                                                    >
                                                        <div className="flex items-center gap-1.5 truncate">
                                                            {item.level === 1 && (
                                                                <span className="text-gray-400 dark:text-muted-foreground/60 select-none text-[11px] font-mono leading-none">
                                                                    ↳
                                                                </span>
                                                            )}
                                                            <span className="truncate">{item.displayName}</span>
                                                        </div>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
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

                            <div className="inline-flex items-center rounded-lg border border-gray-200 dark:border-border bg-gray-100/70 dark:bg-muted/40 p-0.5 text-xs font-medium shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setScopeFilter("in_use")}
                                    title={t("choices.scopeInUseTooltip", "Shows custom choices and choices currently in inventory")}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-all cursor-pointer",
                                        scopeFilter === "in_use"
                                            ? "bg-white dark:bg-card text-foreground font-semibold shadow-xs"
                                            : "text-muted-foreground hover:text-foreground hover:bg-white/50 dark:hover:bg-card/50"
                                    )}
                                >
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                                    <span>{t("choices.scopeInUse", "In-Use & Custom")}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setScopeFilter("all_active")}
                                    title={t("choices.scopeAllActiveTooltip", "Shows all active choices including unselected system baselines")}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-all cursor-pointer",
                                        scopeFilter === "all_active"
                                            ? "bg-white dark:bg-card text-foreground font-semibold shadow-xs"
                                            : "text-muted-foreground hover:text-foreground hover:bg-white/50 dark:hover:bg-card/50"
                                    )}
                                >
                                    <span>{t("choices.scopeAllActive", "All Active")}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setScopeFilter("inactive")}
                                    title={t("choices.scopeInactiveTooltip", "Shows deactivated choices")}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-all cursor-pointer",
                                        scopeFilter === "inactive"
                                            ? "bg-white dark:bg-card text-foreground font-semibold shadow-xs"
                                            : "text-muted-foreground hover:text-foreground hover:bg-white/50 dark:hover:bg-card/50"
                                    )}
                                >
                                    <span>{t("choices.scopeInactive", "Inactive")}</span>
                                </button>
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

                    {/* Class Filter Tabs for make, body_type, vehicle_model, fuel_type, and doors */}
                    {["make", "body_type", "vehicle_model", "fuel_type", "doors"].includes(activeTab) && (
                        <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b border-gray-200 dark:border-border bg-gray-50/50 dark:bg-muted/20">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">
                                {t("choices.vehicleClass", "Class")}:
                            </span>
                            {classFilterOptions.map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setClassFilter(tab.id)}
                                    className={cn(
                                        "px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer",
                                        classFilter === tab.id
                                            ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                                            : "bg-white dark:bg-card border border-gray-200 dark:border-border text-muted-foreground hover:bg-gray-100 dark:hover:bg-muted/50 hover:text-foreground"
                                    )}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Scrollable Content */}
                    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4">
                        {activeTab === "vehicle_model" || activeTab === "make"
                            ? renderVehicleModelContent()
                            : activeTab === "subcategory" || activeTab === "category"
                                ? renderSubcategoriesContent()
                                : activeTab === "city" || activeTab === "country"
                                    ? renderCitiesContent()
                                    : choiceTypes[activeTab]
                                        ? renderChoiceTypeContent(activeTab, choiceTypes[activeTab])
                                        : null}
                    </div>

                    {/* Pagination Sticky Footer */}
                    <div className="flex h-10 items-center justify-between border-t border-gray-200 dark:border-border bg-white dark:bg-card px-4 py-1.5 shrink-0">
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground font-medium">
                            {t("common.showing", "Showing")}
                            <PerPageInput
                                value={perPage}
                                onChange={handlePerPageChange}
                                total={currentTotalCount}
                                label=""
                            />
                            {t("common.of", "of")}{" "}
                            <span className="text-foreground">{currentTotalCount}</span>{" "}
                            {isFlatTab && scopeFilter !== "inactive" && choiceTypes[activeTab]?.active?.some((i) => i.is_protected)
                                ? t("choices.customItemsLabel", "custom items")
                                : t(`choices.entityLabels.${activeTab}`, t("common.items", "items"))}
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={currentPage <= 1 || isFetching}
                                onClick={() => handlePageChange(currentPage - 1)}
                            >
                                {t("common.previous", "Previous")}
                            </Button>
                            <span className="text-sm text-muted-foreground px-2 font-medium flex items-center gap-1.5">
                                {t("common.page", "Page")}{" "}
                                <PageInput
                                    currentPage={currentPage}
                                    totalPages={currentTotalPages}
                                    onPageChange={handlePageChange}
                                    disabled={isFetching}
                                />
                                {" "}{t("common.of", "of")}{" "}
                                <span className="text-foreground">{currentTotalPages}</span>
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={currentPage >= currentTotalPages || isFetching}
                                onClick={() => handlePageChange(currentPage + 1)}
                            >
                                {t("common.next", "Next")}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {modalOpen && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex min-h-screen items-center justify-center p-4">
                        <div className="fixed inset-0 bg-black/50" onClick={closeModal} />
                        <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
                            <div className="flex items-center justify-between gap-3 mb-4">
                                <div className="flex items-center gap-2 min-w-0">
                                    <h3 className="text-lg font-semibold text-foreground truncate">{modalTitle}</h3>
                                    {modalIsProtected && (
                                        <span
                                            className="inline-flex items-center gap-1 text-xs text-muted-foreground font-medium bg-muted px-2 py-0.5 rounded-md border border-border shrink-0"
                                            title={t("choices.protectedTooltip", "Protected system choice locked for marketplace integrity")}
                                        >
                                            <Lock className="size-3 text-muted-foreground" />
                                            <span>{t("choices.protected", "Protected")}</span>
                                        </span>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="text-muted-foreground hover:text-foreground shrink-0 rounded-md p-1 hover:bg-muted transition-colors cursor-pointer"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            <form onSubmit={handleAddChoice}>
                                <div className="mb-4">
                                    <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                                        {modalChoiceType === "key_number"
                                            ? t("choices.number", "Number")
                                            : t("choices.name", "Name")}{" "}
                                        <span className="text-destructive">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={modalName}
                                        disabled={modalIsProtected}
                                        onChange={(event) => {
                                            const val = event.target.value
                                            setModalName(val)
                                            setModalError(null)
                                            if (!userOverrodeMapping && ["make", "fuel_type", "body_type", "color", "doors", "vehicle_model", "vehicle_type"].includes(modalChoiceType)) {
                                                const matched = findMatchingStandardOption(availableStandardOptions, val, modalChoiceType)
                                                if (matched) {
                                                    setModalMobileDeMapping(matched.name)
                                                    if (matched.vehicle_classes && matched.vehicle_classes.length > 0) {
                                                        setModalVehicleClasses(matched.vehicle_classes)
                                                    }
                                                } else {
                                                    setModalMobileDeMapping("")
                                                }
                                            }
                                        }}
                                        required
                                        className={`w-full rounded-lg border border-input bg-transparent px-4 py-2.5 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 ${modalError ? 'border-destructive' : ''} ${modalIsProtected ? 'opacity-60 cursor-not-allowed bg-muted/40' : ''}`}
                                        placeholder={modalChoiceType === "key_number"
                                            ? t("choices.enterNumber", "Enter number...")
                                            : t("choices.enterName", "Enter name...")}
                                        autoFocus={!modalIsProtected}
                                    />
                                    {modalIsProtected && (
                                        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                                            {t("choices.protectedNameNotice", "Protected system choice name cannot be altered.")}
                                        </p>
                                    )}
                                </div>

                                {["make", "vehicle_type", "fuel_type", "body_type", "color", "doors", "vehicle_model"].includes(modalChoiceType) && (
                                    <div className="mb-4">
                                        <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                                            {t("choices.standardOptionMapping", "Standard Option Mapping")}{" "}
                                            <span className="text-xs text-muted-foreground font-normal">
                                                ({t("common.optional", "optional")})
                                            </span>
                                        </label>
                                        {modalChoiceType === "vehicle_model" && availableStandardOptions.length === 0 && isLoadingMarketplaceModels ? (
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                                                <Loader2 className="size-3.5 animate-spin text-primary" />
                                                <span>{t("choices.loadingMarketplaceModels", "Loading models catalog...")}</span>
                                            </div>
                                        ) : (
                                            <select
                                                value={modalMobileDeMapping}
                                                disabled={modalIsProtected}
                                                onChange={(e) => {
                                                    const val = e.target.value
                                                    setModalMobileDeMapping(val)
                                                    setUserOverrodeMapping(true)
                                                    if (val) {
                                                        const matched = availableStandardOptions.find((opt) => opt.name === val)
                                                        if (matched?.vehicle_classes && matched.vehicle_classes.length > 0) {
                                                            setModalVehicleClasses(matched.vehicle_classes)
                                                        }
                                                    }
                                                }}
                                                className={`w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 ${modalIsProtected ? 'opacity-60 cursor-not-allowed bg-muted/40' : ''}`}
                                            >
                                                <option value="">{t("choices.noMappingOptional", "-- Keine Zuordnung (optional) --")}</option>
                                                {availableStandardOptions.map((opt) => (
                                                    <option key={opt.id || opt.name} value={opt.name}>
                                                        {opt.name}
                                                    </option>
                                                ))}
                                                {modalMobileDeMapping && !availableStandardOptions.some((opt) => opt.name === modalMobileDeMapping) && (
                                                    <option value={modalMobileDeMapping}>{modalMobileDeMapping}</option>
                                                )}
                                            </select>
                                        )}
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {t("choices.standardOptionHelp", "Optionally map this option to a standard system choice.")}
                                        </p>
                                        {modalIsProtected && (
                                            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                                                {t("choices.protectedMappingNotice", "Protected system choice mapping cannot be changed.")}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {["make", "body_type", "fuel_type", "doors", "vehicle_model"].includes(modalChoiceType) && (
                                    <div className="mb-4 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                                    {t("choices.vehicleClasses", "Supported Vehicle Classes")}{" "}
                                                    {!selectedProtectedOption && <span className="text-destructive">*</span>}
                                                </label>
                                                {modalChoiceType === "vehicle_model" && modalParentMake?.name && !selectedProtectedOption && (
                                                    <p className="text-[11px] text-muted-foreground mt-0.5">
                                                        {t("choices.modelClassConstraintHint", "Only classes supported by {{make}} can be selected.", { make: modalParentMake.name })}
                                                    </p>
                                                )}
                                            </div>
                                            {!modalIsProtected && !selectedProtectedOption && modalClassOptions.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const allIds = modalClassOptions.map((c) => c.id)
                                                        if (modalVehicleClasses.length === allIds.length) {
                                                            setModalVehicleClasses([])
                                                        } else {
                                                            setModalVehicleClasses(allIds)
                                                        }
                                                    }}
                                                    className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
                                                >
                                                    {modalVehicleClasses.length === modalClassOptions.length
                                                        ? t("choices.deselectAll", "Deselect All")
                                                        : t("choices.selectAll", "Select All")}
                                                </button>
                                            )}
                                        </div>

                                        {selectedProtectedOption ? (
                                            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                                                <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                                                    <Lock className="size-3.5 shrink-0" />
                                                    <span>
                                                        {t("choices.classesInheritedHint", "Fahrzeugklassen werden automatisch von '{{name}}' übernommen", { name: selectedProtectedOption.name })}
                                                    </span>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5 pt-1">
                                                    {(modalVehicleClasses.length > 0
                                                        ? modalVehicleClasses
                                                        : selectedProtectedOption.vehicle_classes || ["Car"]
                                                    ).map((clsId: string) => (
                                                        <span
                                                            key={clsId}
                                                            className="inline-flex items-center rounded-md bg-background px-2.5 py-1 text-xs font-semibold text-foreground border border-border shadow-2xs"
                                                        >
                                                            {getVehicleClassLabel(clsId)}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : modalChoiceType === "vehicle_model" && modalClassOptions.length === 0 ? (
                                            <div className="p-3 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400 rounded-lg border border-amber-200 dark:border-amber-800">
                                                {t("choices.parentMakeHasNoClasses", "The parent make '{{make}}' has no vehicle classes configured. Please edit the make first and assign at least one vehicle class before adding models.", { make: modalParentMake?.name || "" })}
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto overflow-x-hidden p-1">
                                                {modalClassOptions.map((cls) => (
                                                    <label key={cls.id} className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer hover:text-primary transition-colors min-w-0">
                                                        <input
                                                            type="checkbox"
                                                            checked={modalVehicleClasses.includes(cls.id)}
                                                            disabled={modalIsProtected}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setModalVehicleClasses((prev) => [...prev, cls.id])
                                                                } else {
                                                                    setModalVehicleClasses((prev) => prev.filter((c) => c !== cls.id))
                                                                }
                                                            }}
                                                            className="rounded border-input text-primary focus:ring-primary/20 h-3.5 w-3.5 shrink-0"
                                                        />
                                                        <span className="truncate">{cls.label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        )}

                                        {!selectedProtectedOption && modalVehicleClasses.length === 0 && modalClassOptions.length > 0 && (
                                            <p className="text-xs text-rose-500 font-medium">
                                                {t("choices.atLeastOneClassRequired", "At least one vehicle class must be selected.")}
                                            </p>
                                        )}
                                        {modalIsProtected && (
                                            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                                                {t("choices.protectedClassesNotice", "Protected system choice classes cannot be modified.")}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {modalChoiceType === "tax_percentage" && (
                                    <div className="mb-4">
                                        <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                                            {t("choices.taxPercentage", "Tax Percentage")}{" "}
                                            <span className="text-destructive">*</span>
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

                                {modalChoiceType === "payment_method" && (
                                    <div className="mb-4 space-y-2.5 rounded-lg border border-border bg-muted/30 p-3">
                                        <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                            {t("choices.applicableAreas", "Applicable In")}
                                        </label>
                                        <div className="space-y-2">
                                            <label className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    checked={modalAppliesToBuy}
                                                    onChange={(e) => setModalAppliesToBuy(e.target.checked)}
                                                    className="h-4 w-4 rounded border-input text-primary focus:ring-primary/20"
                                                />
                                                <span>{t("choices.scopeVehicleBuy", "Vehicle Purchases (Ankauf)")}</span>
                                            </label>
                                            <label className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    checked={modalAppliesToSale}
                                                    onChange={(e) => setModalAppliesToSale(e.target.checked)}
                                                    className="h-4 w-4 rounded border-input text-primary focus:ring-primary/20"
                                                />
                                                <span>{t("choices.scopeVehicleSale", "Vehicle Sales (Verkauf)")}</span>
                                            </label>
                                            <label className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    checked={modalAppliesToTransactions}
                                                    onChange={(e) => setModalAppliesToTransactions(e.target.checked)}
                                                    className="h-4 w-4 rounded border-input text-primary focus:ring-primary/20"
                                                />
                                                <span>{t("choices.scopeBookkeepingTransactions", "Bookkeeping Transactions (Buchhaltung)")}</span>
                                            </label>
                                        </div>
                                        {modalMode === "edit" && (
                                            <p className="text-[11px] text-muted-foreground italic pt-1 border-t border-border/50">
                                                {t(
                                                    "choices.scopeEditWarning",
                                                    "Disabling an option will hide it from future vehicle and transaction forms. Existing records using this method will keep it intact."
                                                )}
                                            </p>
                                        )}
                                    </div>
                                )}

                                <div className="flex items-center justify-between gap-3 pt-2">
                                    <div>
                                        {modalMode === "edit" && !modalIsProtected && modalIsActive && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (modalEditId) {
                                                        const type = modalChoiceType
                                                        const id = modalEditId
                                                        const name = modalName
                                                        closeModal()
                                                        handleDeleteClick(type, id, name)
                                                    }
                                                }}
                                                disabled={deactivateMutation.isPending}
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50 cursor-pointer"
                                            >
                                                <Trash2 className="size-4" />
                                                <span>{t("common.delete", "Delete")}</span>
                                            </button>
                                        )}
                                        {modalMode === "edit" && !modalIsProtected && !modalIsActive && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (modalEditId) {
                                                        const type = modalChoiceType
                                                        const id = modalEditId
                                                        closeModal()
                                                        handleReactivate(type, id)
                                                    }
                                                }}
                                                disabled={reactivateMutation.isPending}
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-600 hover:bg-emerald-500/20 transition-colors disabled:opacity-50 cursor-pointer"
                                            >
                                                <span>{t("choices.reactivate", "Reactivate")}</span>
                                            </button>
                                        )}
                                        {modalMode === "edit" && modalIsProtected && (
                                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium" title={t("choices.protectedTooltip", "Protected system choice locked for marketplace integrity")}>
                                                <Lock className="size-3.5 text-muted-foreground shrink-0" />
                                                <span>{t("choices.protected", "Protected")}</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={closeModal}
                                            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
                                        >
                                            {t("common.cancel", "Cancel")}
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={addMutation.isPending || updateMutation.isPending || (["make", "body_type", "fuel_type", "doors", "vehicle_model"].includes(modalChoiceType) && modalVehicleClasses.length === 0) || (modalChoiceType === "vehicle_model" && modalClassOptions.length === 0)}
                                            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer"
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
                                </div>

                                {modalError && (
                                    <div className="mt-3 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-xs sm:text-sm text-destructive leading-relaxed">
                                        {modalError.includes("\n- ") ? (
                                            (() => {
                                                const lines = modalError.split("\n")
                                                const firstBulletIdx = lines.findIndex((l) => l.trim().startsWith("- "))
                                                const lastBulletIdx = lines.map((l) => l.trim().startsWith("- ")).lastIndexOf(true)
                                                const header = lines.slice(0, firstBulletIdx).join("\n")
                                                const bulletLines = lines.slice(firstBulletIdx, lastBulletIdx + 1)
                                                const footer = lines.slice(lastBulletIdx + 1).join("\n")
                                                return (
                                                    <div className="flex flex-col gap-2">
                                                        {header && <p className="font-medium">{header}</p>}
                                                        <div className="max-h-44 overflow-y-auto rounded-md bg-background/70 dark:bg-background/40 border border-destructive/20 p-2.5 text-xs space-y-1 overscroll-contain">
                                                            {bulletLines.map((line, idx) => (
                                                                <div key={idx} className="text-foreground dark:text-foreground/90 pl-1">
                                                                    {line}
                                                                </div>
                                                            ))}
                                                        </div>
                                                        {footer && <p className="font-medium text-destructive/90">{footer}</p>}
                                                    </div>
                                                )
                                            })()
                                        ) : (
                                            <div className="max-h-44 overflow-y-auto whitespace-pre-line overscroll-contain">
                                                {modalError}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </form>
                        </div>
                    </div>
                </div>
            )}
            {/* Smart Delete Confirmation Modal */}
            <SmartDeleteModal
                open={deleteModalOpen}
                onOpenChange={setDeleteModalOpen}
                entityType="choice"
                entityId={choiceToDelete?.choiceId ?? null}
                choiceType={choiceToDelete?.choiceType}
                entityName={choiceToDelete?.name || ""}
                onConfirm={handleConfirmDelete}
                isPending={deactivateMutation.isPending}
            />
        </div>
    )
}
