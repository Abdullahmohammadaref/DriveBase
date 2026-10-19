import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query"
import { Loader2, Save, ArrowLeft, AlertTriangle, X, FileText, Trash2, RotateCcw, BarChart3, ChevronDown, ChevronUp, Globe } from "lucide-react"
import { ContractModal } from "./ContractModal"
import { MobileDeListingModal } from "./MobileDeListingModal"
import { VehicleImageUpload } from "./VehicleImageUpload"
import { FinancialMetricsStrip, KpiModal, type KpiItem } from "./FinancialMetricsStrip"
import { VehiclePipeline } from "./VehiclePipeline"
import { VehicleExpensesEarningsCard } from "./VehicleExpensesEarningsCard"
import { AutoSaveToast } from "@/components/AutoSaveIndicator"
import { RecordNavigation } from "@/components/RecordNavigation"
import { useTransactions } from "@/hooks/useTransactions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DynamicSelect } from "@/components/ui/dynamic-select"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { EntityForm } from "@/components/legal-entities/EntityForm"
import type { AutoSaveStatus } from "@/hooks/useAutoSave"
import { useCreateLegalEntity, type LegalEntityCreatePayload } from "@/hooks/useLegalEntities"
import { useChoices, useModels, useNextVehicleId, useNextAvailableKey, vehicleKeys } from "@/hooks/useVehicles"
import { getVehicleCreateSchema, getVehicleUpdateSchema, vehicleUpdateSchema, type VehicleCreateInput, type VehicleUpdateInput } from "@/lib/validations"
import api, { ensureCsrfToken } from "@/lib/api"
import { formatCurrency, cn } from "@/lib/utils"
import { calcVehicleFinancials } from "@/lib/vehicleFinancials"
import { getBoolPref, saveBoolPref } from "@/lib/paginationPrefs"
import { SmartDeleteModal } from "@/components/common/SmartDeleteModal"
import type { VehicleDetail } from "@/types/vehicle"

const PREF_SHOW_VEHICLE_FINANCIALS = "drivebase_pref_show_vehicle_financials"

interface VehicleFormProps {
    vehicle?: VehicleDetail
    isEditing?: boolean
    /** Callback for immediate auto-save (dropdowns, checkboxes) */
    onAutoSave?: (data: Partial<VehicleUpdateInput>) => void
    /** Callback for debounced auto-save (text inputs) */
    onAutoSaveDebounced?: (data: Partial<VehicleUpdateInput>) => void
    /** Previous vehicle ID for navigation (passed from parent) */
    prevVehicleId?: number | null
    /** Next vehicle ID for navigation (passed from parent) */
    nextVehicleId?: number | null
    autoSaveStatus?: AutoSaveStatus
    autoSaveErrorMessage?: string | null
    /** Optional split-view toggle button (preserved for interface compatibility) */
    splitViewToggle?: React.ReactNode
    /** Compact transactions table rendered inline below financials */
    inlineTransactions?: React.ReactNode
}

// Status values that unlock the Sale tab
const SALE_ENABLED_STATUSES = ["ready_for_sale", "reserved", "sold"]

// Valid status values type
type VehicleStatus = "purchased" | "ready_for_sale" | "reserved" | "sold" | "inactive"

function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
    return (
        <div className="border-b border-gray-200 dark:border-border pb-1 mb-2.5 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                {title}
            </span>
            {action}
        </div>
    )
}

function FieldWrapper({
    label,
    required,
    children,
    error,
    className,
}: {
    label: string
    required?: boolean
    children: React.ReactNode
    error?: string
    className?: string
}) {
    return (
        <div className={`min-w-0 ${className || ""}`}>
            <label className="mb-1 block truncate text-[11px] font-medium leading-[14px] tracking-tight text-gray-600 dark:text-muted-foreground">
                {label}
                {required ? <span className="ml-0.5 text-[10px] text-rose-500">*</span> : null}
            </label>
            {children}
            {error && (
                <p className="mt-0.5 text-[10px] text-rose-500 leading-tight">{error}</p>
            )}
        </div>
    )
}

interface ModelSelectProps {
    makeId: number | undefined
    value: number | null
    onChange: (value: number | null) => void
    error?: string
    isTypeSelected?: boolean
    activeVehicleClass?: string
}

function ModelSelect({ makeId, value, onChange, error, isTypeSelected = true, activeVehicleClass }: ModelSelectProps) {
    const { t } = useTranslation()
    const { data: models, isLoading } = useModels(makeId)

    const options = useMemo(() => {
        if (!models) return []
        return models
            .filter((model) => {
                if (!activeVehicleClass) return true
                if (!model.vehicle_classes || model.vehicle_classes.length === 0) return true
                return model.vehicle_classes.includes(activeVehicleClass)
            })
            .map((model) => ({
                id: model.id,
                name: model.name,
            }))
    }, [models, activeVehicleClass])

    return (
        <FieldWrapper label={t("vehicleForm.model", "Model")} error={error}>
            <DynamicSelect
                choiceType="vehicle_model"
                options={options}
                value={value}
                onChange={onChange}
                placeholder={
                    !isTypeSelected
                        ? t("vehicleForm.selectTypeFirst", "Select vehicle type first...")
                        : !makeId
                            ? t("vehicleForm.noMakeSelected", "Keine / Nicht erforderlich")
                            : isLoading
                                ? t("common.loading", "Loading...")
                                : options.length === 0
                                    ? t("vehicleForm.noModelsAvailable", "Keine Modelle (Optional)")
                                    : t("vehicleForm.selectModel", "Select model")
                }
                disabled={!isTypeSelected || !makeId || isLoading}
                allowCreate={Boolean(makeId)}
                createLabel={t("vehicleForm.model", "Model")}
                parentId={makeId}
                activeVehicleClass={activeVehicleClass}
            />
        </FieldWrapper>
    )
}

interface TaxCalculationBreakdown {
    gross: number | null
    taxAmount: number | null
    net: number | null
    taxRate: number
    hasValue: boolean
}

function roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100
}

function calculateTaxBreakdown(price: number | undefined, taxRate: number | string | undefined): TaxCalculationBreakdown {
    const parsedTaxRate = typeof taxRate === "string" ? parseFloat(taxRate) : taxRate
    const safeTaxRate = parsedTaxRate ?? 0

    if (price === undefined || Number.isNaN(price)) {
        return {
            gross: null,
            taxAmount: null,
            net: null,
            taxRate: safeTaxRate,
            hasValue: false,
        }
    }

    const divisor = 1 + safeTaxRate / 100
    const net = divisor > 0 ? price / divisor : price
    const taxAmount = price - net

    return {
        gross: roundMoney(price),
        taxAmount: roundMoney(taxAmount),
        net: roundMoney(net),
        taxRate: safeTaxRate,
        hasValue: true,
    }
}

function formatMoneyOrDash(value: number | null) {
    return value === null ? "-" : formatCurrency(value)
}

export function VehicleForm({
    vehicle,
    isEditing = false,
    onAutoSave,
    onAutoSaveDebounced,
    prevVehicleId,
    nextVehicleId,
    autoSaveStatus = "idle",
    autoSaveErrorMessage = null,
    inlineTransactions,
}: VehicleFormProps) {
    const navigate = useNavigate()
    const { business_slug, locale } = useParams<{ business_slug: string; locale?: string }>()
    const basePath = locale ? `/${business_slug}/${locale}` : `/${business_slug}`
    const queryClient = useQueryClient()
    const { t } = useTranslation()

    // --- Core Helpers ---
    const toNum = (val: unknown): number | undefined => {
        if (val === null || val === undefined) return undefined
        const n = typeof val === "string" ? parseFloat(val) : Number(val)
        return Number.isNaN(n) ? undefined : n
    }

    const getApiErrorMessage = (error: unknown, fallback: string) => {
        const axiosError = error as {
            response?: { data?: { detail?: string; message?: string } | string }
            message?: string
        }
        if (typeof axiosError.response?.data === "string") return axiosError.response.data
        if (axiosError.response?.data && typeof axiosError.response.data === "object") {
            return axiosError.response.data.detail || axiosError.response.data.message || fallback
        }
        return axiosError.message || fallback
    }

    // --- Data Fetching (Choices) ---
    const { data: choices, isLoading: choicesLoading } = useChoices(vehicle?.id)

    // --- Dynamic Form Validation Resolver ---
    const formResolver = useCallback(
        (values: any, context: any, options: any) => {
            if (isEditing) {
                return (zodResolver(vehicleUpdateSchema) as any)(values, context, options)
            }
            const vtId = values.vehicle_type_id
            let reqDoors = true
            let reqMakeAndBody = true
            if (choices?.vehicle_types && vtId) {
                const vt = choices.vehicle_types.find((t) => t.id === vtId)
                if (vt) {
                    const name = (vt.name || "").toLowerCase().trim()
                    const mapping = (vt.mobile_de_mapping || "").trim()
                    const NO_DOORS_CLASSES = [
                        "motorrad", "motorbike", "anhänger", "anhanger", "anhnger",
                        "trailer", "semitrailer", "auflieger", "ebike", "e-bike",
                        "constructionmachine", "forklifttruck", "baumaschine", "gabelstapler"
                    ]
                    if (["Motorbike", "Trailer", "SemiTrailer", "EBike", "ConstructionMachine", "ForkliftTruck"].includes(mapping) ||
                        NO_DOORS_CLASSES.some((c) => name.includes(c))) {
                        reqDoors = false
                    }
                    const OPTIONAL_MAKE_BODY_CLASSES = [
                        "trailer", "semitrailer", "anhänger", "anhanger", "anhnger", "auflieger",
                        "ebike", "e-bike", "pedelec", "constructionmachine",
                        "forklifttruck", "baumaschine", "gabelstapler", "agrarfahrzeug", "agriculturalvehicle"
                    ]
                    if (["Trailer", "SemiTrailer", "EBike", "ConstructionMachine", "ForkliftTruck", "AgriculturalVehicle"].includes(mapping) ||
                        OPTIONAL_MAKE_BODY_CLASSES.some((c) => name.includes(c))) {
                        reqMakeAndBody = false
                    }
                }
            }
            const keineOption = choices?.doors?.find(d => d.name.toLowerCase() === 'keine')
            if (isEditing) {
                return (zodResolver(getVehicleUpdateSchema(reqDoors, keineOption?.id)) as any)(values, context, options)
            }
            return (zodResolver(getVehicleCreateSchema(reqDoors, keineOption?.id, reqMakeAndBody)) as any)(values, context, options)
        },
        [isEditing, choices?.vehicle_types, choices?.doors]
    )

    // --- Form Foundation ---
    const {
        handleSubmit,
        setValue,
        getValues,
        watch,
        reset,
        clearErrors,
        formState: { errors },
    } = useForm<VehicleCreateInput | VehicleUpdateInput>({
        resolver: formResolver as any,
        defaultValues: isEditing ? {
            status: (vehicle?.status ?? "purchased") as VehicleStatus,
            branch_id: vehicle?.branch_id ?? undefined,
            vehicle_type_id: vehicle?.vehicle_type_id ?? undefined,
            body_type_id: vehicle?.body_type_id ?? undefined,
            make_id: vehicle?.make_id ?? undefined,
            model_id: vehicle?.model_id ?? undefined,
            color_id: vehicle?.color_id ?? undefined,
            doors_id: vehicle?.doors_id ?? undefined,
            fuel_type_id: vehicle?.fuel_type_id ?? undefined,
            damage_type_id: vehicle?.damage_type_id ?? undefined,
            power_kw: toNum(vehicle?.power_kw),
            first_registration_date: vehicle?.first_registration_date ?? "",
            year_of_construction: toNum(vehicle?.year_of_construction),
            kilometer: toNum(vehicle?.kilometer),
            chassis_number: vehicle?.chassis_number ?? "",
            motor_vehicle_registration_number: vehicle?.motor_vehicle_registration_number ?? "",
            official_license_plate: vehicle?.official_license_plate ?? "",
            buy_price: toNum(vehicle?.buy_price),
            buy_tax_id: vehicle?.buy_tax_id ?? undefined,
            buy_date: vehicle?.buy_date ?? "",
            buy_delivery_collection_date: vehicle?.buy_delivery_collection_date ?? "",
            buy_payment_method_id: vehicle?.buy_payment_method_id ?? undefined,
            seller_id: vehicle?.seller_id ?? undefined,
            sale_price: toNum(vehicle?.sale_price),
            sale_tax_id: vehicle?.sale_tax_id ?? undefined,
            sale_date: vehicle?.sale_date ?? "",
            sale_delivery_collection_date: vehicle?.sale_delivery_collection_date ?? "",
            sale_payment_method_id: vehicle?.sale_payment_method_id ?? undefined,
            buyer_id: vehicle?.buyer_id ?? undefined,
            sale_invoice_number: vehicle?.sale_invoice_number ?? "",
            description: vehicle?.description ?? "",
            internal_comments: vehicle?.internal_comments ?? "",
            key_number_id: vehicle?.key_number_id ?? undefined,
        } : {
            branch_id: undefined,
            vehicle_type_id: undefined,
            body_type_id: undefined,
            make_id: undefined,
            model_id: undefined,
            color_id: undefined,
            doors_id: undefined,
            fuel_type_id: undefined,
            damage_type_id: undefined,
            power_kw: undefined,
            first_registration_date: "",
            year_of_construction: undefined,
            kilometer: undefined,
            chassis_number: "",
            motor_vehicle_registration_number: "",
            official_license_plate: "",
            buy_price: undefined,
            buy_tax_id: undefined,
            buy_date: "",
            buy_delivery_collection_date: "",
            buy_payment_method_id: undefined,
            seller_id: undefined,
            description: "",
            internal_comments: "",
            key_number_id: undefined,
        },
    })

    // --- Cascading Taxonomy & Vehicle Class Resolution ---
    const watchedVehicleTypeId = watch("vehicle_type_id")
    const selectedVehicleType = useMemo(() => {
        if (!choices?.vehicle_types || !watchedVehicleTypeId) return null
        return choices.vehicle_types.find((vt) => vt.id === watchedVehicleTypeId) || null
    }, [choices?.vehicle_types, watchedVehicleTypeId])

    const hasDoors = useMemo(() => {
        if (!selectedVehicleType) return false
        const name = (selectedVehicleType.name || "").toLowerCase().trim()
        const mapping = (selectedVehicleType.mobile_de_mapping || "").trim()
        const NO_DOORS_CLASSES = [
            "motorrad", "motorbike", "anhänger", "anhanger", "anhnger",
            "trailer", "semitrailer", "auflieger", "ebike", "e-bike",
            "constructionmachine", "forklifttruck", "baumaschine", "gabelstapler"
        ]
        if (["Motorbike", "Trailer", "SemiTrailer", "EBike", "ConstructionMachine", "ForkliftTruck"].includes(mapping)) {
            return false
        }
        if (NO_DOORS_CLASSES.some((c) => name.includes(c))) {
            return false
        }
        return true
    }, [selectedVehicleType])

    const targetClass = useMemo(() => {
        if (!selectedVehicleType) return "Car"
        if (selectedVehicleType.mobile_de_mapping) return selectedVehicleType.mobile_de_mapping
        const name = (selectedVehicleType.name || "").toLowerCase().trim()
        if (name.includes("motorrad") || name.includes("bike")) return "Motorbike"
        if (name.includes("wohnmobil") || name.includes("camper") || name.includes("caravan")) return "Motorhome"
        if (name.includes("transporter") || name.includes("van")) return "VanUpTo7500"
        if (name.includes("lkw") || name.includes("truck")) return "TruckOver7500"
        if (name.includes("anhänger") || name.includes("trailer")) return "Trailer"
        return "Car"
    }, [selectedVehicleType])

    const requiresMakeAndBody = useMemo(() => {
        if (!selectedVehicleType) return true
        const name = (selectedVehicleType.name || "").toLowerCase().trim()
        const mapping = (selectedVehicleType.mobile_de_mapping || "").trim()
        const OPTIONAL_MAKE_BODY_CLASSES = [
            "trailer", "semitrailer", "anhänger", "anhanger", "anhnger", "auflieger",
            "ebike", "e-bike", "pedelec", "constructionmachine",
            "forklifttruck", "baumaschine", "gabelstapler", "agrarfahrzeug", "agriculturalvehicle"
        ]
        if (["Trailer", "SemiTrailer", "EBike", "ConstructionMachine", "ForkliftTruck", "AgriculturalVehicle"].includes(mapping)) {
            return false
        }
        if (OPTIONAL_MAKE_BODY_CLASSES.some((c) => name.includes(c))) {
            return false
        }
        return true
    }, [selectedVehicleType])

    const watchedMakeId = watch("make_id")
    const watchedBodyTypeId = watch("body_type_id")

    const filteredMakes = useMemo(() => {
        if (!choices?.makes) return []
        const list = choices.makes.filter((m) => {
            const mName = (m.name || "").toLowerCase()
            if (mName === "sonstige" || mName === "keine" || mName === "andere" || m.mobile_de_mapping === "OTHER") {
                return true
            }
            if (!m.vehicle_classes || m.vehicle_classes.length === 0) {
                return targetClass === "Car"
            }
            return m.vehicle_classes.includes(targetClass)
        })
        if (watchedMakeId && !list.some((m) => m.id === watchedMakeId)) {
            const cur = choices.makes.find((m) => m.id === watchedMakeId)
            if (cur) return [cur, ...list]
        }
        return list
    }, [choices?.makes, targetClass, watchedMakeId])

    const filteredBodyTypes = useMemo(() => {
        if (!choices?.body_types) return []
        const list = choices.body_types.filter((b) => {
            const bName = (b.name || "").toLowerCase()
            if (bName.includes("sonstige") || bName.includes("andere") || b.mobile_de_mapping === "Other" || b.mobile_de_mapping === "OtherCar") {
                return true
            }
            if (!b.vehicle_classes || b.vehicle_classes.length === 0) {
                return targetClass === "Car"
            }
            return b.vehicle_classes.includes(targetClass)
        })
        if (watchedBodyTypeId && !list.some((b) => b.id === watchedBodyTypeId)) {
            const cur = choices.body_types.find((b) => b.id === watchedBodyTypeId)
            if (cur) return [cur, ...list]
        }
        return list
    }, [choices?.body_types, targetClass, watchedBodyTypeId])

    // --- State and Refs ---
    const isInitializingRef = useRef(isEditing)
    const [mutationError, setMutationError] = useState<string | null>(null)
    const [entityModalOpen, setEntityModalOpen] = useState(false)
    const createEntityTargetRef = useRef<"seller_id" | "buyer_id">("seller_id")
    const [createEntityTarget, setCreateEntityTarget] = useState<"seller_id" | "buyer_id">("seller_id")
    const [entityFormData, setEntityFormData] = useState<Partial<LegalEntityCreatePayload>>({ type: "individual" })
    const [entityFormError, setEntityFormError] = useState<string | null>(null)
    const [entityValidationErrors, setEntityValidationErrors] = useState<Record<string, string>>({})
    const [contractModalOpen, setContractModalOpen] = useState(false)
    const [mobileDeModalOpen, setMobileDeModalOpen] = useState(false)
    const [deleteModalOpen, setDeleteModalOpen] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null)
    const [imageUploadError, setImageUploadError] = useState<string | null>(null)
    const [isUploadingImage, setIsUploadingImage] = useState(false)
    const [activeNetCalculation, setActiveNetCalculation] = useState<KpiItem | null>(null)
    const createEntityMutation = useCreateLegalEntity()

    // mobile.de integration settings query
    const { data: mobileDeSettings } = useQuery<{ is_configured: boolean }>({
        queryKey: ["mobile-de-settings"],
        queryFn: async () => {
            const res = await api.get("/settings/mobile-de")
            return res.data
        },
    })

    // --- Basic Handlers ---
    const handleBack = useCallback(() => {
        if (window.history.state && window.history.state.idx > 0) navigate(-1)
        else navigate(`${basePath}/vehicles`)
    }, [navigate, basePath])

    const toOptions = useCallback((items: Array<{ id: number; name: string }> | undefined) =>
        items?.map((item) => ({ id: item.id, name: item.name })) ?? [], [])

    const taxToOptions = useCallback((items: Array<{ id: number; name: string; percentage: number }> | undefined) =>
        items?.map((item) => ({ id: item.id, name: `${item.name} (${item.percentage}%)` })) ?? [], [])

    const invalidateKeyChoiceCaches = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ["choices"] })
        queryClient.invalidateQueries({ queryKey: ["choices-management"] })
    }, [queryClient])

    const handleDropdownChange = useCallback((field: string, value: number | string | null | undefined) => {
        setValue(field as any, value as any)
        if (isEditing && onAutoSave && !isInitializingRef.current) {
            onAutoSave({ [field]: value } as Partial<VehicleUpdateInput>)
        }
        if (field === "key_number_id") {
            invalidateKeyChoiceCaches()
        }
    }, [setValue, isEditing, onAutoSave, invalidateKeyChoiceCaches])

    const handleVehicleTypeChange = useCallback(
        (val: number | null) => {
            const newTypeId = val ?? 0
            const prevTypeId = watch("vehicle_type_id")
            if (isEditing && prevTypeId && newTypeId && prevTypeId !== newTypeId) {
                const confirmChange = window.confirm(
                    t("vehicleForm.confirmChangeVehicleType", "Changing vehicle class may reset incompatible body type, make, and door selections. Do you want to proceed?")
                )
                if (!confirmChange) return
            }

            handleDropdownChange("vehicle_type_id", newTypeId)

            const newVt = choices?.vehicle_types?.find((t) => t.id === newTypeId)
            const newVtName = (newVt?.name || "").toLowerCase().trim()
            const newVtMap = (newVt?.mobile_de_mapping || "").trim()
            const NO_DOORS_CLASSES = [
                "motorrad", "motorbike", "anhänger", "anhanger", "trailer", "semitrailer", "auflieger", "ebike", "constructionmachine", "forklifttruck"
            ]
            const noDoors = [
                "Motorbike", "Trailer", "SemiTrailer", "EBike", "ConstructionMachine", "ForkliftTruck"
            ].includes(newVtMap) || NO_DOORS_CLASSES.some((c) => newVtName.includes(c))
            const keineOption = choices?.doors?.find(d => d.name.toLowerCase() === 'keine')
            if (noDoors) {
                if (keineOption) {
                    setValue("doors_id", keineOption.id)
                    clearErrors("doors_id")
                    if (isEditing && onAutoSave && !isInitializingRef.current) {
                        onAutoSave({ doors_id: keineOption.id })
                    }
                }
            } else {
                if (watch("doors_id") === keineOption?.id) {
                    setValue("doors_id", undefined as any)
                    if (isEditing && onAutoSave && !isInitializingRef.current) {
                        onAutoSave({ doors_id: undefined })
                    }
                }
            }

            const newTarget = newVtMap || (
                newVtName.includes("motorrad") || newVtName.includes("bike") ? "Motorbike" :
                newVtName.includes("wohnmobil") || newVtName.includes("camper") ? "Motorhome" :
                newVtName.includes("transporter") || newVtName.includes("van") ? "VanUpTo7500" :
                newVtName.includes("lkw") || newVtName.includes("truck") ? "TruckOver7500" :
                newVtName.includes("anhänger") || newVtName.includes("trailer") ? "Trailer" : "Car"
            )

            // Incompatible Make check
            const curMakeId = watch("make_id")
            if (curMakeId) {
                const curMake = choices?.makes?.find((m) => m.id === curMakeId)
                if (curMake) {
                    const makeClasses = curMake.vehicle_classes || (newTarget === "Car" ? ["Car"] : [])
                    if (!makeClasses.includes(newTarget)) {
                        setValue("make_id", undefined as any)
                        setValue("model_id", undefined as any)
                        if (isEditing && onAutoSave && !isInitializingRef.current) {
                            onAutoSave({ make_id: undefined, model_id: undefined })
                        }
                    }
                }
            }

            // Incompatible Body Type check
            const curBodyId = watch("body_type_id")
            if (curBodyId) {
                const curBody = choices?.body_types?.find((b) => b.id === curBodyId)
                if (curBody) {
                    const bodyClasses = curBody.vehicle_classes || (newTarget === "Car" ? ["Car"] : [])
                    if (!bodyClasses.includes(newTarget)) {
                        setValue("body_type_id", undefined as any)
                        if (isEditing && onAutoSave && !isInitializingRef.current) {
                            onAutoSave({ body_type_id: undefined })
                        }
                    }
                }
            }
        },
        [isEditing, watch, handleDropdownChange, choices, setValue, clearErrors, onAutoSave, t]
    )

    const handleTextChange = useCallback((field: string, value: string) => {
        setValue(field as any, value as any)
        if (isEditing && onAutoSaveDebounced && !isInitializingRef.current) {
            onAutoSaveDebounced({ [field]: value } as Partial<VehicleUpdateInput>)
        }
    }, [setValue, isEditing, onAutoSaveDebounced])

    const handleNumberChange = useCallback((field: string, value: string, parseFunc: (v: string) => number | undefined = (v) => v ? parseInt(v) : undefined) => {
        const numVal = parseFunc(value)
        setValue(field as any, numVal as any)
        if (isEditing && onAutoSaveDebounced && !isInitializingRef.current) {
            onAutoSaveDebounced({ [field]: numVal } as Partial<VehicleUpdateInput>)
        }
    }, [setValue, isEditing, onAutoSaveDebounced])

    const handleDateChange = useCallback((field: string, value: string) => {
        setValue(field as any, value as any)
        if (isEditing && onAutoSave && !isInitializingRef.current) {
            onAutoSave({ [field]: value || null } as Partial<VehicleUpdateInput>)
        }
    }, [setValue, isEditing, onAutoSave])

    // --- Entity Modal Callbacks ---
    const handleOpenEntityModal = useCallback((target: "seller_id" | "buyer_id") => {
        createEntityTargetRef.current = target
        setCreateEntityTarget(target)
        setEntityFormData({ type: "individual" })
        setEntityFormError(null)
        setEntityValidationErrors({})
        setEntityModalOpen(true)
    }, [])

    const validateEntityForm = useCallback((data: Partial<LegalEntityCreatePayload>) => {
        const errorsList: Record<string, string> = {}
        if (!data.name?.trim()) errorsList.name = "This field is required"
        if (!data.type) errorsList.type = "This field is required"
        if (data.type === "company" && !data.tax_identification_number?.trim()) {
            errorsList.tax_identification_number = "This field is required"
        }
        if (!data.address_street?.trim()) errorsList.address_street = "This field is required"
        if (!data.address_street_number?.trim()) errorsList.address_street_number = "This field is required"
        if (!data.address_postal_code?.trim()) errorsList.address_postal_code = "This field is required"
        if (!data.address_country_id) errorsList.address_country_id = "This field is required"
        if (!data.address_city_id) errorsList.address_city_id = "This field is required"
        return errorsList
    }, [])

    const handleCreateEntity = useCallback(async () => {
        setEntityFormError(null)
        const valErrors = validateEntityForm(entityFormData)
        if (Object.keys(valErrors).length > 0) {
            setEntityValidationErrors(valErrors)
            return
        }
        setEntityValidationErrors({})
        try {
            const newEntity = await createEntityMutation.mutateAsync(entityFormData as LegalEntityCreatePayload)
            const targetField = createEntityTargetRef.current || createEntityTarget
            handleDropdownChange(targetField, newEntity.id)
            queryClient.invalidateQueries({ queryKey: vehicleKeys.choices() })
            setEntityModalOpen(false)
            setEntityFormData({ type: "individual" })
        } catch (error: unknown) {
            const err = error as Error
            setEntityFormError(err.message || "Failed to create legal entity")
        }
    }, [entityFormData, createEntityMutation, createEntityTarget, queryClient, handleDropdownChange, validateEntityForm])

    // --- Data Fetching ---
    const { data: txData } = useTransactions(
        { vehicle: vehicle?.internal_id ?? undefined, per_page: 500 },
        isEditing && Boolean(vehicle?.internal_id)
    )
    const { data: nextId, isLoading: nextIdLoading } = useNextVehicleId(!isEditing)
    const watchedKeyNumberId = watch("key_number_id")
    const { data: nextKey } = useNextAvailableKey(!isEditing && !watchedKeyNumberId)
    const { data: businessSettings } = useQuery({
        queryKey: ["business-settings"],
        queryFn: async () => {
            const response = await api.get("/settings/business")
            return response.data
        },
        staleTime: 5 * 60 * 1000,
    })

    // --- Side Effects ---
    useEffect(() => { ensureCsrfToken() }, [])

    useEffect(() => {
        if (!isEditing && nextKey && !watchedKeyNumberId) {
            handleDropdownChange("key_number_id", nextKey.id)
        }
    }, [nextKey, isEditing, watchedKeyNumberId, handleDropdownChange])

    useEffect(() => {
        if (isEditing && vehicle) {
            isInitializingRef.current = true
            const noTaxId = choices?.tax_percentages?.find((tax) => tax.is_no_tax)?.id
            reset({
                status: (vehicle.status ?? "purchased") as VehicleStatus,
                branch_id: vehicle.branch_id ?? undefined,
                vehicle_type_id: vehicle.vehicle_type_id ?? undefined,
                body_type_id: vehicle.body_type_id ?? undefined,
                make_id: vehicle.make_id ?? undefined,
                model_id: vehicle.model_id ?? undefined,
                color_id: vehicle.color_id ?? undefined,
                doors_id: vehicle.doors_id ?? undefined,
                fuel_type_id: vehicle.fuel_type_id ?? undefined,
                damage_type_id: vehicle.damage_type_id ?? undefined,
                power_kw: toNum(vehicle.power_kw),
                first_registration_date: vehicle.first_registration_date ?? "",
                year_of_construction: toNum(vehicle.year_of_construction),
                kilometer: toNum(vehicle.kilometer),
                chassis_number: vehicle.chassis_number ?? "",
                motor_vehicle_registration_number: vehicle.motor_vehicle_registration_number ?? "",
                official_license_plate: vehicle.official_license_plate ?? "",
                buy_price: toNum(vehicle.buy_price),
                buy_tax_id: vehicle.buy_tax_id ?? noTaxId ?? undefined,
                buy_date: vehicle.buy_date ?? "",
                buy_delivery_collection_date: vehicle.buy_delivery_collection_date ?? "",
                buy_payment_method_id: vehicle.buy_payment_method_id ?? undefined,
                seller_id: vehicle.seller_id ?? undefined,
                sale_price: toNum(vehicle.sale_price),
                sale_tax_id: vehicle.sale_tax_id ?? noTaxId ?? undefined,
                sale_date: vehicle.sale_date ?? "",
                sale_delivery_collection_date: vehicle.sale_delivery_collection_date ?? "",
                sale_payment_method_id: vehicle.sale_payment_method_id ?? undefined,
                buyer_id: vehicle.buyer_id ?? undefined,
                sale_invoice_number: vehicle.sale_invoice_number ?? "",
                description: vehicle.description ?? "",
                internal_comments: vehicle.internal_comments ?? "",
                key_number_id: vehicle.key_number_id ?? undefined,
            })
            setTimeout(() => { isInitializingRef.current = false }, 500)
        }
    }, [vehicle?.internal_id, isEditing, reset, choices?.tax_percentages])

    useEffect(() => {
        if (choices?.tax_percentages && choices.tax_percentages.length > 0) {
            const noTaxOption = choices.tax_percentages.find((tax) => tax.is_no_tax)
            if (noTaxOption) {
                const currentBuyTax = watch("buy_tax_id")
                const currentSaleTax = watch("sale_tax_id")
                if (currentBuyTax === undefined || currentBuyTax === null) {
                    setValue("buy_tax_id", noTaxOption.id)
                }
                if (currentSaleTax === undefined || currentSaleTax === null) {
                    setValue("sale_tax_id", noTaxOption.id)
                }
            }
        }
    }, [choices?.tax_percentages, setValue, watch])


    useEffect(() => {
        setSelectedImageFile(null)
        setImageUploadError(null)
        setIsUploadingImage(false)
    }, [vehicle?.internal_id, isEditing])

    // --- Derived Values ---
    const currentStatus = isEditing ? (vehicle?.status ?? "purchased") : "purchased"
    const vehicleTitle = `${vehicle?.make_name ?? ""} ${vehicle?.model_name ?? ""}`.trim() || "Vehicle"
    const canGenerateAnyContract = Boolean(
        vehicle?.can_generate_buy_contract || vehicle?.can_generate_sale_contract
    )
    const watchedStatus = watch("status") ?? currentStatus
    const isSaleTabVisible = isEditing && SALE_ENABLED_STATUSES.includes(watchedStatus as string)
    const isKeyFieldVisible = watchedStatus !== "sold" && watchedStatus !== "inactive"
    const watchedBuyPrice = toNum(watch("buy_price"))
    const watchedBuyTaxId = watch("buy_tax_id")
    const watchedSalePrice = toNum(watch("sale_price"))
    const watchedSaleTaxId = watch("sale_tax_id")
    const watchedBuyDate = watch("buy_date") as string | undefined
    const watchedSaleDate = watch("sale_date") as string | undefined

    // mobile.de Listing States
    const isLiveOnMobileDe = vehicle?.mobile_de_status === "active"
    const isMobileDeConfigured = !!mobileDeSettings?.is_configured
    const isStatusEligible = watchedStatus === "ready_for_sale" || watchedStatus === "reserved"
    const isEligibleForMobileDe = isMobileDeConfigured && isStatusEligible

    const mobileDeTooltip = isLiveOnMobileDe
        ? t("mobileDe.liveListingTooltip", "Live on mobile.de - Click to manage or view insights")
        : !isMobileDeConfigured
        ? t("mobileDe.configureCredentialsTooltip", "Configure mobile.de credentials in Settings first.")
        : !isStatusEligible
        ? t("mobileDe.statusNotEligibleTooltip", "Vehicle must be 'Ready for Sale' or 'Reserved' to list on mobile.de.")
        : t("mobileDe.availableToListTooltip", "Available to list on mobile.de")

    const buyTaxRate = choices?.tax_percentages?.find((tax) => tax.id === watchedBuyTaxId)?.percentage ?? 0
    const saleTaxRate = choices?.tax_percentages?.find((tax) => tax.id === watchedSaleTaxId)?.percentage ?? 0
    const buyBreakdown = calculateTaxBreakdown(watchedBuyPrice, buyTaxRate)
    const saleBreakdown = calculateTaxBreakdown(watchedSalePrice, saleTaxRate)
    const keyNumberOptions = [
        ...toOptions(choices?.key_numbers),
        ...(nextKey && !choices?.key_numbers?.some((key) => key.id === nextKey.id)
            ? [{ id: nextKey.id, name: nextKey.name }]
            : []),
    ]

    const currentBuyMethodId = watch("buy_payment_method_id")
    const buyPaymentMethodOptions = useMemo(() => {
        const list = choices?.payment_methods || []
        return list
            .filter((m) => m.applies_to_buy || m.id === currentBuyMethodId)
            .map((m) => ({
                id: m.id,
                name: m.name,
            }))
    }, [choices?.payment_methods, currentBuyMethodId])

    const currentSaleMethodId = watch("sale_payment_method_id")
    const salePaymentMethodOptions = useMemo(() => {
        const list = choices?.payment_methods || []
        return list
            .filter((m) => m.applies_to_sale || m.id === currentSaleMethodId)
            .map((m) => ({
                id: m.id,
                name: m.name,
            }))
    }, [choices?.payment_methods, currentSaleMethodId])

    const txnsForCalc = txData?.transactions?.items
        ?.filter((t) => t.status !== "inactive")
        ?.map((t) => ({
            amount: typeof t.amount === "string" ? parseFloat(t.amount) : t.amount,
            tax: typeof t.tax === "string" ? parseFloat(t.tax) : t.tax,
        })) ?? null

    const vehicleFinancials = calcVehicleFinancials({
        buyGross: watchedBuyPrice ?? null,
        buyTaxPercentage: buyTaxRate,
        saleGross: isSaleTabVisible ? (watchedSalePrice ?? null) : null,
        saleTaxPercentage: isSaleTabVisible ? saleTaxRate : null,
        buyDate: watchedBuyDate || null,
        saleDate: isSaleTabVisible ? (watchedSaleDate || null) : null,
        transactions: txnsForCalc,
        entries: vehicle?.expenses_earnings?.map((e) => ({ type: e.type, amount: e.amount })) ?? null,
        annualTargetRate: businessSettings?.target_annual_return,
        targetDaysOnStock: businessSettings?.target_days_on_stock,
        status: vehicle?.status ?? null,
    })

    // Persistent toggle for financial summary (default: collapsed/hidden, remembered via cookie & localStorage)
    const [showFinancialSummary, setShowFinancialSummary] = useState<boolean>(() =>
        getBoolPref(PREF_SHOW_VEHICLE_FINANCIALS, false)
    )

    // --- Validation & Mutation ---
    const validateSaleFields = (): boolean => {
        const errorsList: string[] = []
        if (!watch("sale_price") || Number(watch("sale_price")) <= 0) errorsList.push(t("vehicleForm.salePriceGross", "Sale price"))
        if (!watch("sale_date")) errorsList.push(t("vehicleForm.saleDate", "Sale date"))
        if (!watch("buyer_id")) errorsList.push(t("vehicleForm.buyer", "Buyer"))
        if (!watch("sale_payment_method_id")) errorsList.push(t("vehicleForm.salePaymentMethod", "Payment method"))

        if (errorsList.length > 0) {
            alert(`${t("vehicleForm.allFieldsRequiredForSold", "Please fill in required fields for Sold status:")}\n• ${errorsList.join("\n• ")}`)
            return false
        }
        return true
    }

    const handleStatusChange = (newStatus: VehicleStatus | string) => {
        if (newStatus === "sold" && !validateSaleFields()) return
        setValue("status", newStatus as VehicleStatus, { shouldDirty: true })

        if (newStatus === "sold" || newStatus === "inactive") {
            setValue("key_number_id", null as any, { shouldDirty: true })
        }

        if (isEditing && onAutoSave && !isInitializingRef.current) {
            const updateData: any = { status: newStatus }
            if (newStatus === "sold" || newStatus === "inactive") {
                updateData.key_number_id = null
            }
            if (newStatus === "sold") {
                if (watch("sale_price")) updateData.sale_price = Number(watch("sale_price"))
                if (watch("sale_date")) updateData.sale_date = watch("sale_date")
                if (watch("sale_payment_method_id")) updateData.sale_payment_method_id = watch("sale_payment_method_id")
                if (watch("buyer_id")) updateData.buyer_id = watch("buyer_id")
                if (watch("sale_tax_id")) updateData.sale_tax_id = watch("sale_tax_id")
            }
            onAutoSave(updateData as Partial<VehicleUpdateInput>)
        }
        if (newStatus === "sold" || newStatus === "inactive") {
            invalidateKeyChoiceCaches()
        }
    }

    const handleConfirmDelete = async (optsOrCascade?: boolean | { forceCascade?: boolean; unlinkDelete?: boolean; mode?: string }) => {
        if (!vehicle?.internal_id) return
        setIsDeleting(true)
        const isObj = typeof optsOrCascade === "object" && optsOrCascade !== null
        const forceCascade = isObj ? (optsOrCascade.forceCascade || optsOrCascade.mode === "cascade") : Boolean(optsOrCascade)
        const unlinkDelete = isObj ? (optsOrCascade.unlinkDelete || optsOrCascade.mode === "unlink_delete") : false
        const deleteMode = isObj ? optsOrCascade.mode : (forceCascade ? "cascade" : "deactivate")

        const params: Record<string, any> = {}
        if (forceCascade) params.force_cascade = true
        if (unlinkDelete) params.unlink_delete = true
        if (deleteMode) params.delete_mode = deleteMode

        try {
            const res = await api.delete(`/vehicles/${vehicle.internal_id}`, {
                params: Object.keys(params).length > 0 ? params : undefined,
            })
            if (res.data?.action === "deleted") {
                navigate(`${basePath}/vehicles`)
            } else {
                handleStatusChange("inactive")
            }
        } catch (err) {
            console.error("Delete failed:", err)
        } finally {
            setIsDeleting(false)
            setDeleteModalOpen(false)
        }
    }

    const mutation = useMutation({
        mutationFn: async (data: VehicleCreateInput | VehicleUpdateInput) => {
            if (isEditing && vehicle?.internal_id) {
                const response = await api.patch(`/vehicles/${vehicle.internal_id}`, data)
                return response.data
            }
            const response = await api.post("/vehicles", data)
            return response.data
        },
        onSuccess: () => {
            setMutationError(null)
            queryClient.invalidateQueries({ queryKey: vehicleKeys.lists() })
            invalidateKeyChoiceCaches()
        },
        onError: (error: unknown) => {
            const message = getApiErrorMessage(error, "Failed to save vehicle.")
            setMutationError(message)
            window.scrollTo({ top: 0, behavior: "smooth" })
        },
    })

    const uploadVehicleImage = useCallback(async (targetId: number, file: File) => {
        setImageUploadError(null)
        setIsUploadingImage(true)
        try {
            const formData = new FormData()
            formData.append("image", file)
            const response = await api.post(`/vehicles/${targetId}/image`, formData, {
                headers: { "Content-Type": "multipart/form-data" },
            })
            queryClient.setQueryData(vehicleKeys.detail(targetId), response.data)
            queryClient.invalidateQueries({ queryKey: vehicleKeys.lists() })
            setSelectedImageFile(null)
        } catch (error) {
            setImageUploadError(getApiErrorMessage(error, "Failed to upload vehicle image."))
            throw error
        } finally {
            setIsUploadingImage(false)
        }
    }, [queryClient])

    const handleVehicleImageChange = useCallback(async (file: File | null) => {
        setSelectedImageFile(file)
        setImageUploadError(null)

        if (!file || !isEditing || !vehicle?.internal_id) return

        try {
            await uploadVehicleImage(vehicle.internal_id, file)
        } catch { }
    }, [isEditing, uploadVehicleImage, vehicle?.internal_id])

    const onSubmit = async (data: VehicleCreateInput | VehicleUpdateInput) => {
        setMutationError(null)
        if ((data as VehicleUpdateInput).status === "sold" && !validateSaleFields()) return

        const cleanedData = JSON.parse(JSON.stringify(data))

        Object.keys(cleanedData).forEach((key) => {
            if (cleanedData[key] === "" || cleanedData[key] === undefined) {
                cleanedData[key] = null
            }
        })

        try {
            const saved = await mutation.mutateAsync(cleanedData)
            if (selectedImageFile && saved?.internal_id) {
                await uploadVehicleImage(saved.internal_id, selectedImageFile)
            }
            if (!isEditing) handleBack()
        } catch {
            // Error handled by mutation.onError
        }
    }

    const onError = () => { window.scrollTo({ top: 0, behavior: "smooth" }) }

    if (choicesLoading) {
        return (
            <div className="flex items-center justify-center h-48">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <>
            <form onSubmit={handleSubmit(onSubmit, onError)} className="space-y-3">
                {/* Header */}
                {isEditing ? (
                    <div className="@container/header flex flex-nowrap items-center justify-between gap-1 sm:gap-2 border-b border-border pb-1.5 mb-2.5 min-w-0 w-full overflow-x-auto no-scrollbar">
                        {/* Left: Back + Vehicle Title/ID */}
                        <div className="flex min-w-0 items-center gap-1 sm:gap-1.5 shrink">
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="size-7 shrink-0"
                                onClick={handleBack}
                                aria-label={t("common.back", "Back")}
                            >
                                <ArrowLeft className="size-3.5" />
                            </Button>
                            <h1
                                className="truncate min-w-0 shrink max-w-[90px] sm:max-w-[130px] md:max-w-[170px] lg:max-w-[220px] text-xs sm:text-sm font-semibold tracking-tight text-heading"
                                title={`${vehicleTitle} #${vehicle?.internal_id}`}
                            >
                                {vehicleTitle} <span className="text-muted-foreground font-normal">#{vehicle?.internal_id}</span>
                            </h1>
                        </div>

                        {/* Middle: Status Pipeline + Days on Stock */}
                        <div className="flex min-w-0 items-center gap-1 sm:gap-1.5 shrink-0">
                            <VehiclePipeline
                                className="shrink-0"
                                currentStatus={watchedStatus as VehicleStatus}
                                canMoveTo={vehicle?.can_move_to || []}
                                onStatusChange={handleStatusChange}
                                orientation="horizontal"
                            />
                            {vehicleFinancials.daysOnStock !== null && (
                                <span
                                    className="inline-flex h-5 shrink-0 items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1 sm:px-1.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800"
                                    title={`${vehicleFinancials.daysOnStock} ${t("vehicles.daysOnStock", "Days on Stock")}`}
                                >
                                    <span className="size-1 shrink-0 rounded-full bg-current" />
                                    <span>{vehicleFinancials.daysOnStock}d</span>
                                    <span className="hidden @[1200px]/header:inline 2xl:inline">{t("vehicles.daysOnStock", "on Stock")}</span>
                                </span>
                            )}
                            {watchedStatus === "sold" && vehicleFinancials.grossProfit !== null && (
                                <span
                                    className={cn(
                                        "hidden @[1300px]/header:inline-flex 2xl:inline-flex h-5 shrink-0 items-center gap-1 rounded border px-1.5 text-[10px] font-semibold",
                                        vehicleFinancials.grossProfit >= 0
                                            ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
                                            : "border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800"
                                    )}
                                    title={`${t("vehicles.metrics.grossProfit", "Gross Profit")}: ${vehicleFinancials.grossProfit >= 0 ? "+" : ""}{formatCurrency(vehicleFinancials.grossProfit)}`}
                                >
                                    <span className="size-1 shrink-0 rounded-full bg-current" />
                                    {vehicleFinancials.grossProfit >= 0 ? "+" : ""}{formatCurrency(vehicleFinancials.grossProfit)}
                                </span>
                            )}
                        </div>

                        {/* Right: Actions */}
                        <div className="flex shrink-0 items-center gap-1">
                            {/* Manual Save Button (triggers auto-save & toast immediately) */}
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-1.5 sm:px-2 text-xs gap-1 font-medium border-border/80 hover:bg-accent text-foreground shadow-2xs shrink-0"
                                onClick={() => {
                                    if (onAutoSave && autoSaveStatus !== "saving") {
                                        onAutoSave(getValues() as Partial<VehicleUpdateInput>)
                                    }
                                }}
                                title={t("common.save", "Save")}
                            >
                                <Save className="size-3 shrink-0" />
                                <span>{t("common.save", "Save")}</span>
                            </Button>

                            {watchedStatus === "inactive" ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-1.5 sm:px-2 text-xs gap-1 text-green-600 border-green-300 hover:bg-green-50 hover:text-green-700 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-900/30 shrink-0"
                                    onClick={() => handleStatusChange("purchased")}
                                    title={t("common.activate", "Activate")}
                                >
                                    <RotateCcw className="size-3 shrink-0" />
                                    <span className="hidden @[1200px]/header:inline xl:inline">{t("common.activate", "Activate")}</span>
                                </Button>
                            ) : (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-1.5 sm:px-2 text-xs gap-1 text-red-500 border-red-300 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-900/30 shrink-0"
                                    onClick={() => setDeleteModalOpen(true)}
                                    title={t("common.delete", "Delete")}
                                >
                                    <Trash2 className="size-3 shrink-0" />
                                    <span className="hidden @[1200px]/header:inline xl:inline">{t("common.delete", "Delete")}</span>
                                </Button>
                            )}

                            {/* Financial Summary Button (between Deactivate and Docs) */}
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    const next = !showFinancialSummary
                                    setShowFinancialSummary(next)
                                    saveBoolPref(PREF_SHOW_VEHICLE_FINANCIALS, next)
                                }}
                                className="h-7 px-1.5 sm:px-2 text-xs gap-1 text-muted-foreground hover:text-foreground border-border/80 shrink-0"
                                title={showFinancialSummary ? t("vehicles.hideFinancialSummaryTooltip", "Hide financial summary") : t("vehicles.showFinancialSummaryTooltip", "Show financial summary")}
                            >
                                <BarChart3 className="size-3 text-primary shrink-0" />
                                <span className="hidden @[1100px]/header:inline lg:inline">{t("vehicles.summary", "Summary")}</span>
                                {showFinancialSummary ? <ChevronUp className="size-3 opacity-60 shrink-0" /> : <ChevronDown className="size-3 opacity-60 shrink-0" />}
                            </Button>

                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className={cn("h-7 px-1.5 sm:px-2 text-xs gap-1 shrink-0", canGenerateAnyContract ? "" : "opacity-75")}
                                onClick={() => setContractModalOpen(true)}
                                title={t("vehicles.generateDocuments", "Generate documents")}
                            >
                                <FileText className="size-3 shrink-0" />
                                <span className="hidden @[1000px]/header:inline md:inline">{t("vehicles.documents", "Docs")}</span>
                            </Button>

                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className={cn(
                                    "h-7 px-1.5 sm:px-2 text-xs gap-1 shadow-2xs font-medium transition-colors shrink-0",
                                    isLiveOnMobileDe
                                        ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
                                        : isEligibleForMobileDe
                                        ? "bg-white hover:bg-gray-50 text-foreground border-border/80"
                                        : "bg-gray-100 hover:bg-gray-100 text-muted-foreground/60 border-gray-200 opacity-60"
                                )}
                                onClick={() => {
                                    if (isEligibleForMobileDe || isLiveOnMobileDe) {
                                        setMobileDeModalOpen(true)
                                    } else {
                                        alert(mobileDeTooltip)
                                    }
                                }}
                                title={mobileDeTooltip}
                            >
                                <Globe className="size-3 shrink-0" />
                                <span className="hidden @[1150px]/header:inline xl:inline">mobile.de</span>
                            </Button>

                            <RecordNavigation
                                basePath={`${basePath}/vehicles`}
                                prevId={prevVehicleId}
                                nextId={nextVehicleId}
                                pathSuffix="/edit"
                                label={t("vehicles.vehicleLabel", "Vehicle")}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-between pb-1.5 border-b border-gray-200 dark:border-border">
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="size-7 shrink-0"
                                onClick={handleBack}
                            >
                                <ArrowLeft className="size-3.5" />
                            </Button>
                            <div className="flex items-center gap-2">
                                <h1 className="text-xs font-semibold text-heading">
                                    {t("vehicleForm.addNewVehicle", "Add New Vehicle")}
                                </h1>
                                <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-[#F9FAFB] dark:bg-secondary text-muted-foreground border border-gray-200 dark:border-border">
                                    {nextIdLoading ? (
                                        <Loader2 className="size-2.5 animate-spin mr-1" />
                                    ) : null}
                                    {t("vehicleForm.nextId", "Next ID")}: #{nextId ?? "..."}
                                </span>
                            </div>
                        </div>

                        {/* Right: Save/Create Action placed directly on the header line */}
                        <div className="flex items-center gap-2">
                            <Button
                                type="submit"
                                size="sm"
                                className="h-7 text-xs bg-primary text-primary-foreground hover:opacity-90 px-3 shadow-2xs"
                                disabled={mutation.isPending}
                            >
                                {mutation.isPending ? (
                                    <>
                                        <Loader2 className="mr-1.5 size-3 animate-spin" />
                                        {t("common.creating", "Creating...")}
                                    </>
                                ) : (
                                    <>
                                        <Save className="mr-1.5 size-3" />
                                        {t("vehicleForm.createVehicle", "Create Vehicle")}
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                )}

                {/* Error Banner */}
                {mutationError && (
                    <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg p-2 text-danger" role="alert">
                        <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                        <div className="flex-1 text-xs">
                            <p className="font-semibold">{t("vehicleForm.failedToSave", "Failed to save vehicle")}</p>
                            <p className="mt-0.5 text-muted-foreground text-[11px]">{mutationError}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setMutationError(null)}
                            className="text-muted-foreground hover:text-foreground shrink-0"
                        >
                            <X className="size-3.5" />
                        </button>
                    </div>
                )}

                {/* Financial Summary (Collapsible, at top of page body) */}
                {isEditing && showFinancialSummary && (
                    <div className="animate-in fade-in-0 duration-200">
                        <FinancialMetricsStrip
                            financials={vehicleFinancials}
                            hideTransactions={!isEditing}
                            annualTargetRate={businessSettings?.target_annual_return}
                        />
                    </div>
                )}

                {/* SECTION 1: VEHICLE DETAILS */}
                <section>
                    <SectionTitle title={t("vehicleForm.vehicleDetails", "Vehicle Details")} />
                    <div className="grid grid-cols-2 gap-x-2.5 gap-y-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-9">
                        {/* Branch */}
                        <FieldWrapper label={t("vehicleForm.branch", "Branch")} required error={errors.branch_id?.message}>
                            <DynamicSelect
                                choiceType="branch"
                                options={toOptions(choices?.branches)}
                                value={watch("branch_id") ?? null}
                                onChange={(val) => handleDropdownChange("branch_id", val ?? 0)}
                                placeholder={t("vehicleForm.selectBranch", "Select branch")}
                                createLabel={t("vehicleForm.branch", "Branch")}
                                allowCreate={false}
                            />
                        </FieldWrapper>

                        {/* Vehicle Type (determines available Makes, Body Types, and Doors) */}
                        <FieldWrapper label={t("vehicleForm.vehicleType", "Vehicle Type")} required error={errors.vehicle_type_id?.message}>
                            <DynamicSelect
                                choiceType="vehicle_type"
                                options={toOptions(choices?.vehicle_types)}
                                value={watch("vehicle_type_id") ?? null}
                                onChange={handleVehicleTypeChange}
                                placeholder={t("vehicleForm.selectType", "Select type")}
                                createLabel={t("vehicleForm.vehicleType", "Vehicle Type")}
                            />
                        </FieldWrapper>

                        {/* Make (Filtered by Vehicle Class) */}
                        <FieldWrapper label={t("vehicleForm.make", "Make")} required={requiresMakeAndBody} error={errors.make_id?.message}>
                            <DynamicSelect
                                choiceType="make"
                                options={toOptions(filteredMakes)}
                                value={watch("make_id") ?? null}
                                onChange={(val) => {
                                    setValue("make_id", val ? val : (undefined as any))
                                    setValue("model_id", undefined as any)
                                    if (isEditing && onAutoSave) {
                                        onAutoSave({ make_id: val ? val : undefined, model_id: undefined })
                                    }
                                }}
                                placeholder={Boolean(watchedVehicleTypeId) ? t("vehicleForm.selectMake", "Select make") : t("vehicleForm.selectTypeFirst", "Select vehicle type first...")}
                                createLabel={t("vehicleForm.make", "Make")}
                                disabled={!watchedVehicleTypeId}
                                activeVehicleClass={targetClass}
                                allowDeselect={!requiresMakeAndBody}
                            />
                        </FieldWrapper>

                        {/* Model */}
                        <ModelSelect
                            makeId={watch("make_id") ?? undefined}
                            value={watch("model_id") ?? null}
                            onChange={(val) => handleDropdownChange("model_id", val ?? undefined)}
                            error={errors.model_id?.message}
                            isTypeSelected={Boolean(watchedVehicleTypeId)}
                            activeVehicleClass={targetClass}
                        />

                        {/* Body Type (Filtered by Vehicle Class) */}
                        <FieldWrapper label={t("vehicleForm.bodyType", "Body Type")} required={requiresMakeAndBody} error={errors.body_type_id?.message}>
                            <DynamicSelect
                                choiceType="body_type"
                                options={toOptions(filteredBodyTypes)}
                                value={watch("body_type_id") ?? null}
                                onChange={(val) => handleDropdownChange("body_type_id", val ? val : (undefined as any))}
                                placeholder={Boolean(watchedVehicleTypeId) ? t("vehicleForm.selectBodyType", "Select body type") : t("vehicleForm.selectTypeFirst", "Select vehicle type first...")}
                                createLabel={t("vehicleForm.bodyType", "Body Type")}
                                disabled={!watchedVehicleTypeId}
                                activeVehicleClass={targetClass}
                                allowDeselect={!requiresMakeAndBody}
                            />
                        </FieldWrapper>

                        {/* Color */}
                        <FieldWrapper label={t("vehicleForm.color", "Color")} required error={errors.color_id?.message}>
                            <DynamicSelect
                                choiceType="color"
                                options={toOptions(choices?.colors)}
                                value={watch("color_id") ?? null}
                                onChange={(val) => handleDropdownChange("color_id", val ?? 0)}
                                placeholder={t("vehicleForm.selectColor", "Select color")}
                                createLabel={t("vehicleForm.color", "Color")}
                            />
                        </FieldWrapper>

                        {/* Doors (Always in DOM; disabled and set to Keine for non-door classes) */}
                        <FieldWrapper label={t("vehicleForm.doors", "Doors")} required error={errors.doors_id?.message}>
                            <DynamicSelect
                                choiceType="doors"
                                options={toOptions(choices?.doors)}
                                value={watch("doors_id") ?? null}
                                onChange={(val) => handleDropdownChange("doors_id", val ?? 0)}
                                placeholder={
                                    !watchedVehicleTypeId
                                        ? t("vehicleForm.selectTypeFirst", "Select vehicle type first...")
                                        : t("vehicleForm.selectDoors", "Select doors")
                                }
                                createLabel={t("vehicleForm.doors", "Doors")}
                                disabled={!watchedVehicleTypeId || !hasDoors}
                            />
                        </FieldWrapper>

                        {/* Fuel Type */}
                        <FieldWrapper label={t("vehicleForm.fuelType", "Fuel Type")} required error={errors.fuel_type_id?.message}>
                            <DynamicSelect
                                choiceType="fuel_type"
                                options={toOptions(choices?.fuel_types)}
                                value={watch("fuel_type_id") ?? null}
                                onChange={(val) => handleDropdownChange("fuel_type_id", val ?? 0)}
                                placeholder={t("vehicleForm.selectFuel", "Select fuel")}
                                createLabel={t("vehicleForm.fuelType", "Fuel Type")}
                            />
                        </FieldWrapper>

                        {/* Damage Type */}
                        <FieldWrapper label={t("vehicleForm.damageType", "Damage Type")} required error={errors.damage_type_id?.message}>
                            <DynamicSelect
                                choiceType="damage_type"
                                options={toOptions(choices?.damage_types)}
                                value={watch("damage_type_id") ?? null}
                                onChange={(val) => handleDropdownChange("damage_type_id", val ?? 0)}
                                placeholder={t("vehicleForm.selectDamage", "Select damage")}
                                createLabel={t("vehicleForm.damageType", "Damage Type")}
                            />
                        </FieldWrapper>

                        {/* Chassis Number (VIN) */}
                        <FieldWrapper
                            label={t("vehicleForm.chassisNumberVin", "Chassis No. (VIN)")}
                            required
                            error={errors.chassis_number?.message}
                        >
                            <Input
                                value={watch("chassis_number") ?? ""}
                                onChange={(e) => handleTextChange("chassis_number", e.target.value)}
                                placeholder="e.g. WVWZZZ3CZWE123456"
                                className="uppercase font-mono"
                                maxLength={17}
                            />
                        </FieldWrapper>

                        {/* License Plate */}
                        <FieldWrapper label={t("vehicleForm.licensePlate", "License Plate")}>
                            <Input
                                value={watch("official_license_plate") ?? ""}
                                onChange={(e) => handleTextChange("official_license_plate", e.target.value)}
                                placeholder="e.g. B-AB 1234"
                            />
                        </FieldWrapper>

                        {/* Registration Number */}
                        <FieldWrapper label={t("vehicleForm.registrationDocNumber", "Registration No.")}>
                            <Input
                                value={watch("motor_vehicle_registration_number") ?? ""}
                                onChange={(e) => handleTextChange("motor_vehicle_registration_number", e.target.value)}
                                placeholder="Motor reg."
                            />
                        </FieldWrapper>

                        {/* Key Number */}
                        {isKeyFieldVisible && (
                            <FieldWrapper label={t("vehicleForm.keyNumber", "Key Number")} required error={errors.key_number_id?.message}>
                                <DynamicSelect
                                    choiceType="key_number"
                                    options={keyNumberOptions}
                                    value={watchedKeyNumberId ?? null}
                                    onChange={(val) => handleDropdownChange("key_number_id", val ?? null)}
                                    placeholder={t("vehicleForm.selectKey", "Select key")}
                                    createLabel={t("vehicleForm.keyNumber", "Key Number")}
                                />
                            </FieldWrapper>
                        )}

                        {/* Year of Construction */}
                        <FieldWrapper label={t("vehicleForm.yearOfConstruction", "Year")} required error={errors.year_of_construction?.message}>
                            <Input
                                type="number"
                                value={watch("year_of_construction") ?? ""}
                                onChange={(e) => handleNumberChange("year_of_construction", e.target.value)}
                                placeholder="2020"
                            />
                        </FieldWrapper>

                        {/* First Registration Date */}
                        <FieldWrapper label={t("vehicleForm.firstReg", "First Reg.")}>
                            <Input
                                type="date"
                                value={watch("first_registration_date") ?? ""}
                                onChange={(e) => handleDateChange("first_registration_date", e.target.value)}
                                onClick={(e) => { try { e.currentTarget.showPicker() } catch (err) { } }}
                            />
                        </FieldWrapper>

                        {/* Kilometer */}
                        <FieldWrapper label={t("vehicleForm.kilometers", "Kilometer")} required error={errors.kilometer?.message}>
                            <Input
                                type="number"
                                value={watch("kilometer") ?? ""}
                                onChange={(e) => handleNumberChange("kilometer", e.target.value)}
                                placeholder="50000"
                            />
                        </FieldWrapper>

                        {/* Power (kW) */}
                        <FieldWrapper label={t("vehicleForm.powerKw", "Power (kW)")} required error={errors.power_kw?.message}>
                            <Input
                                type="number"
                                value={watch("power_kw") ?? ""}
                                onChange={(e) => handleNumberChange("power_kw", e.target.value)}
                                placeholder="150"
                            />
                        </FieldWrapper>
                    </div>
                </section>

                {/* SECTION 2: MEDIA & NOTES */}
                <section>
                    <SectionTitle title={t("vehicleForm.mediaNotes", "Media & Notes")} />
                    <div className={`grid gap-2.5 ${isEditing && vehicle?.internal_id ? "grid-cols-4" : "grid-cols-3"}`}>
                        {/* Vehicle Photo */}
                        <VehicleImageUpload
                            imageUrl={vehicle?.image_url}
                            selectedFile={selectedImageFile}
                            onFileChange={handleVehicleImageChange}
                            isUploading={isUploadingImage}
                            errorMessage={imageUploadError}
                            disabled={mutation.isPending || isUploadingImage}
                        />

                        {/* Description */}
                        <FieldWrapper label={t("vehicleForm.description", "Description")} className="flex flex-col">
                            <textarea
                                value={watch("description") ?? ""}
                                onChange={(e) => handleTextChange("description", e.target.value)}
                                placeholder={t("vehicleForm.publicDescriptionPlaceholder", "Public description of the vehicle")}
                                rows={5}
                                className="h-[115px] min-h-[110px] w-full resize-none rounded-md border border-gray-200 dark:border-border bg-[#F3F3F3] dark:bg-secondary px-2.5 py-1.5 text-xs text-gray-800 dark:text-foreground outline-none transition-[background-color,border-color] placeholder:text-muted-foreground hover:border-gray-300 dark:hover:border-gray-600 focus:border-gray-400 focus:bg-white dark:focus:bg-background focus:ring-1 focus:ring-gray-200 dark:focus:ring-ring"
                            />
                        </FieldWrapper>

                        {/* Internal Comments */}
                        <FieldWrapper label={t("vehicleForm.internalComments", "Internal Comments")} className="flex flex-col">
                            <textarea
                                value={watch("internal_comments") ?? ""}
                                onChange={(e) => handleTextChange("internal_comments", e.target.value)}
                                placeholder={t("vehicleForm.privateNotesPlaceholder", "Private notes (not visible to customers)")}
                                rows={5}
                                className="h-[115px] min-h-[110px] w-full resize-none rounded-md border border-gray-200 dark:border-border bg-[#F3F3F3] dark:bg-secondary px-2.5 py-1.5 text-xs text-gray-800 dark:text-foreground outline-none transition-[background-color,border-color] placeholder:text-muted-foreground hover:border-gray-300 dark:hover:border-gray-600 focus:border-gray-400 focus:bg-white dark:focus:bg-background focus:ring-1 focus:ring-gray-200 dark:focus:ring-ring"
                            />
                        </FieldWrapper>

                        {/* Expenses & Earnings - only shown when editing existing vehicle */}
                        {isEditing && vehicle?.internal_id && (
                            <VehicleExpensesEarningsCard
                                vehicleInternalId={vehicle.internal_id}
                                entries={vehicle.expenses_earnings ?? []}
                                choices={choices}
                            />
                        )}
                    </div>
                </section>

                {/* SECTION 3: BUY & SALE DETAILS */}
                <div className={`grid grid-cols-1 ${isSaleTabVisible ? 'gap-x-6 gap-y-3 lg:grid-cols-2' : ''}`}>
                    {/* Buy Details */}
                    <section className="min-w-0">
                        <SectionTitle
                            title={t("vehicleForm.purchaseDetails", "Buy Details")}
                            action={
                                buyBreakdown.hasValue ? (
                                        <button
                                            type="button"
                                            onClick={() => setActiveNetCalculation({
                                                id: "buy-net",
                                                label: `${t("vehicleForm.purchaseDetails", "Buy Details")} — ${t("vehicleForm.net", "Net")}`,
                                                value: formatMoneyOrDash(buyBreakdown.net),
                                                tone: "success",
                                                formula: buyBreakdown.taxRate > 0
                                                    ? `${t("vehicleForm.net", "Net")} = ${t("vehicles.buyPriceGross", "Gross")} − ${t("vehicleForm.tax", "Tax")} (${buyBreakdown.taxRate.toFixed(1)}%)`
                                                    : `${t("vehicleForm.net", "Net")} = ${t("vehicles.buyPriceGross", "Gross")}`,
                                                steps: buyBreakdown.taxRate > 0 ? [
                                                    { label: t("vehicles.buyPriceGross", "Gross"), value: formatMoneyOrDash(buyBreakdown.gross) },
                                                    { label: `− ${t("vehicleForm.tax", "Tax")} (${buyBreakdown.taxRate.toFixed(1)}%)`, value: formatMoneyOrDash(buyBreakdown.taxAmount) },
                                                    { label: `= ${t("vehicleForm.net", "Net")}`, value: formatMoneyOrDash(buyBreakdown.net) },
                                                ] : [
                                                    { label: t("vehicles.buyPriceGross", "Gross"), value: formatMoneyOrDash(buyBreakdown.gross) },
                                                    { label: `= ${t("vehicleForm.net", "Net")}`, value: formatMoneyOrDash(buyBreakdown.net) },
                                                ],
                                            })}
                                            title={`${t("vehicleForm.net", "Net")}: ${formatMoneyOrDash(buyBreakdown.net)} | ${t("vehicleForm.gross", "Gross")}: ${formatMoneyOrDash(buyBreakdown.gross)} (${t("vehicles.metrics.clickToSeeCalculation", "Click to see calculation")})`}
                                            className="inline-flex items-center rounded-md border border-gray-200 dark:border-border bg-white dark:bg-card hover:bg-gray-50/80 dark:hover:bg-muted/40 hover:border-gray-300 dark:hover:border-border/80 px-2.5 py-1 shadow-2xs transition-all cursor-pointer group gap-1.5"
                                        >
                                            {/* Netto Segment */}
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
                                                    {t("vehicleForm.net", "Net")}:
                                                </span>
                                                <span className="text-xs sm:text-[13px] font-bold font-mono text-[#318d6c] dark:text-emerald-400">
                                                    {formatMoneyOrDash(buyBreakdown.net)}
                                                </span>
                                            </div>

                                            {/* Subtle Vertical Divider */}
                                            <div className="h-3.5 w-px bg-gray-200 dark:bg-border mx-1 shrink-0" />

                                            {/* Brutto Segment */}
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
                                                    {t("vehicleForm.gross", "Gross")}:
                                                </span>
                                                <span className="text-xs sm:text-[13px] font-bold font-mono text-gray-800 dark:text-gray-200">
                                                    {formatMoneyOrDash(buyBreakdown.gross)}
                                                </span>
                                            </div>
                                        </button>
                                    ) : (
                                        <div className="inline-flex items-center rounded-md border border-dashed border-gray-200 dark:border-border/60 bg-gray-50/50 dark:bg-muted/20 px-2.5 py-1 text-xs font-mono text-muted-foreground gap-1.5">
                                            <span>{t("vehicleForm.net", "Net")}: —</span>
                                            <div className="h-3 w-px bg-gray-200 dark:bg-border mx-1 shrink-0" />
                                            <span>{t("vehicleForm.gross", "Gross")}: —</span>
                                        </div>
                                    )
                            }
                        />
                        <div className="grid grid-cols-2 gap-x-2.5 gap-y-2 sm:grid-cols-4">
                            <FieldWrapper label={t("vehicleForm.buyPriceGross", "Buy Price (Gross)")} required error={errors.buy_price?.message}>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={watch("buy_price") ?? ""}
                                    onChange={(e) => handleNumberChange("buy_price", e.target.value, (v) => v ? parseFloat(v) : undefined)}
                                    placeholder="0.00"
                                    className="font-mono"
                                />
                            </FieldWrapper>

                            <FieldWrapper label={t("vehicleForm.tax", "Tax")} required>
                                <DynamicSelect
                                    choiceType="tax_percentage"
                                    options={taxToOptions(choices?.tax_percentages)}
                                    value={watch("buy_tax_id") ?? null}
                                    onChange={(val) => handleDropdownChange("buy_tax_id", val)}
                                    placeholder={t("vehicleForm.selectTax", "Select tax")}
                                    createLabel={t("vehicleForm.taxRate", "Tax Rate")}
                                    showPercentage
                                />
                            </FieldWrapper>

                            <FieldWrapper label={t("vehicleForm.buyDate", "Buy Date")} required error={errors.buy_date?.message}>
                                <Input
                                    type="date"
                                    value={watch("buy_date") ?? ""}
                                    onChange={(e) => handleDateChange("buy_date", e.target.value)}
                                    onClick={(e) => { try { e.currentTarget.showPicker() } catch (err) { } }}
                                />
                            </FieldWrapper>

                            <FieldWrapper label={t("vehicleForm.deliveryDate", "Delivery Date")}>
                                <Input
                                    type="date"
                                    value={watch("buy_delivery_collection_date") ?? ""}
                                    onChange={(e) => handleDateChange("buy_delivery_collection_date", e.target.value)}
                                    onClick={(e) => { try { e.currentTarget.showPicker() } catch (err) { } }}
                                />
                            </FieldWrapper>

                            <FieldWrapper label={t("vehicleForm.buyPaymentMethod", "Payment Method")} required error={errors.buy_payment_method_id?.message}>
                                <DynamicSelect
                                    choiceType="payment_method"
                                    context="buy"
                                    options={buyPaymentMethodOptions}
                                    value={watch("buy_payment_method_id") ?? null}
                                    onChange={(val) => handleDropdownChange("buy_payment_method_id", val ?? 0)}
                                    placeholder={t("vehicleForm.selectPaymentMethod", "Select method")}
                                    createLabel={t("vehicleForm.buyPaymentMethod", "Payment Method")}
                                />
                            </FieldWrapper>

                            <FieldWrapper label={t("vehicleForm.seller", "Seller")} required error={errors.seller_id?.message}>
                                <DynamicSelect
                                    choiceType="legal_entity"
                                    options={choices?.legal_entities?.map((e) => ({ id: e.id, name: `#${e.internal_id} - ${e.name}` })) ?? []}
                                    value={watch("seller_id") ?? null}
                                    onChange={(val) => handleDropdownChange("seller_id", val ?? 0)}
                                    placeholder={t("vehicleForm.selectSeller", "Select seller")}
                                    allowCreate={true}
                                    createLabel={t("vehicleForm.seller", "Seller / Entity")}
                                    onAddClick={() => handleOpenEntityModal("seller_id")}
                                />
                            </FieldWrapper>
                        </div>
                    </section>

                    {/* Sale Details */}
                    {isSaleTabVisible && (
                        <section className="min-w-0">
                            <SectionTitle
                                title={t("vehicleForm.saleDetails", "Sale Details")}
                                action={
                                    saleBreakdown.hasValue ? (
                                        <button
                                            type="button"
                                            onClick={() => setActiveNetCalculation({
                                                id: "sale-net",
                                                label: `${t("vehicleForm.saleDetails", "Sale Details")} — ${t("vehicleForm.net", "Net")}`,
                                                value: formatMoneyOrDash(saleBreakdown.net),
                                                tone: "success",
                                                formula: saleBreakdown.taxRate > 0
                                                    ? `${t("vehicleForm.net", "Net")} = ${t("vehicles.salePriceGross", "Gross")} − ${t("vehicleForm.tax", "Tax")} (${saleBreakdown.taxRate.toFixed(1)}%)`
                                                    : `${t("vehicleForm.net", "Net")} = ${t("vehicles.salePriceGross", "Gross")}`,
                                                steps: saleBreakdown.taxRate > 0 ? [
                                                    { label: t("vehicles.salePriceGross", "Gross"), value: formatMoneyOrDash(saleBreakdown.gross) },
                                                    { label: `− ${t("vehicleForm.tax", "Tax")} (${saleBreakdown.taxRate.toFixed(1)}%)`, value: formatMoneyOrDash(saleBreakdown.taxAmount) },
                                                    { label: `= ${t("vehicleForm.net", "Net")}`, value: formatMoneyOrDash(saleBreakdown.net) },
                                                ] : [
                                                    { label: t("vehicles.salePriceGross", "Gross"), value: formatMoneyOrDash(saleBreakdown.gross) },
                                                    { label: `= ${t("vehicleForm.net", "Net")}`, value: formatMoneyOrDash(saleBreakdown.net) },
                                                ],
                                            })}
                                            title={`${t("vehicleForm.net", "Net")}: ${formatMoneyOrDash(saleBreakdown.net)} | ${t("vehicleForm.gross", "Gross")}: ${formatMoneyOrDash(saleBreakdown.gross)} (${t("vehicles.metrics.clickToSeeCalculation", "Click to see calculation")})`}
                                            className="inline-flex items-center rounded-md border border-gray-200 dark:border-border bg-white dark:bg-card hover:bg-gray-50/80 dark:hover:bg-muted/40 hover:border-gray-300 dark:hover:border-border/80 px-2.5 py-1 shadow-2xs transition-all cursor-pointer group gap-1.5"
                                        >
                                            {/* Netto Segment */}
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
                                                    {t("vehicleForm.net", "Net")}:
                                                </span>
                                                <span className="text-xs sm:text-[13px] font-bold font-mono text-[#318d6c] dark:text-emerald-400">
                                                    {formatMoneyOrDash(saleBreakdown.net)}
                                                </span>
                                            </div>

                                            {/* Subtle Vertical Divider */}
                                            <div className="h-3.5 w-px bg-gray-200 dark:bg-border mx-1 shrink-0" />

                                            {/* Brutto Segment */}
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
                                                    {t("vehicleForm.gross", "Gross")}:
                                                </span>
                                                <span className="text-xs sm:text-[13px] font-bold font-mono text-gray-800 dark:text-gray-200">
                                                    {formatMoneyOrDash(saleBreakdown.gross)}
                                                </span>
                                            </div>
                                        </button>
                                    ) : (
                                        <div className="inline-flex items-center rounded-md border border-dashed border-gray-200 dark:border-border/60 bg-gray-50/50 dark:bg-muted/20 px-2.5 py-1 text-xs font-mono text-muted-foreground gap-1.5">
                                            <span>{t("vehicleForm.net", "Net")}: —</span>
                                            <div className="h-3 w-px bg-gray-200 dark:bg-border mx-1 shrink-0" />
                                            <span>{t("vehicleForm.gross", "Gross")}: —</span>
                                        </div>
                                    )
                                }
                            />
                            <div className="grid grid-cols-2 gap-x-2.5 gap-y-2 sm:grid-cols-4">
                                <FieldWrapper label={t("vehicleForm.salePriceGross", "Sale Price (Gross)")} required>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={watch("sale_price") ?? ""}
                                        onChange={(e) => handleNumberChange("sale_price", e.target.value, (v) => v ? parseFloat(v) : undefined)}
                                        placeholder="0.00"
                                        className="font-mono"
                                    />
                                </FieldWrapper>

                                <FieldWrapper label={t("vehicleForm.tax", "Tax")} required>
                                    <DynamicSelect
                                        choiceType="tax_percentage"
                                        options={taxToOptions(choices?.tax_percentages)}
                                        value={watch("sale_tax_id") ?? null}
                                        onChange={(val) => handleDropdownChange("sale_tax_id", val)}
                                        placeholder={t("vehicleForm.selectTax", "Select tax")}
                                        createLabel={t("vehicleForm.taxRate", "Tax Rate")}
                                        showPercentage
                                    />
                                </FieldWrapper>

                                <FieldWrapper label={t("vehicleForm.invoiceNumber", "Invoice Number")}>
                                    <Input
                                        value={watch("sale_invoice_number") ?? ""}
                                        onChange={(e) => handleTextChange("sale_invoice_number", e.target.value)}
                                        placeholder="RE-2026-00184"
                                        className="font-mono"
                                    />
                                </FieldWrapper>

                                <FieldWrapper label={t("vehicleForm.saleDate", "Sale Date")} required>
                                    <Input
                                        type="date"
                                        value={watch("sale_date") ?? ""}
                                        onChange={(e) => handleDateChange("sale_date", e.target.value)}
                                        onClick={(e) => { try { e.currentTarget.showPicker() } catch (err) { } }}
                                    />
                                </FieldWrapper>

                                <FieldWrapper label={t("vehicleForm.deliveryDate", "Delivery Date")}>
                                    <Input
                                        type="date"
                                        value={watch("sale_delivery_collection_date") ?? ""}
                                        onChange={(e) => handleDateChange("sale_delivery_collection_date", e.target.value)}
                                        onClick={(e) => { try { e.currentTarget.showPicker() } catch (err) { } }}
                                    />
                                </FieldWrapper>

                                <FieldWrapper label={t("vehicleForm.salePaymentMethod", "Payment Method")} required>
                                    <DynamicSelect
                                        choiceType="payment_method"
                                        context="sale"
                                        options={salePaymentMethodOptions}
                                        value={watch("sale_payment_method_id") ?? null}
                                        onChange={(val) => handleDropdownChange("sale_payment_method_id", val)}
                                        placeholder={t("vehicleForm.selectPaymentMethod", "Select method")}
                                        createLabel={t("vehicleForm.salePaymentMethod", "Payment Method")}
                                    />
                                </FieldWrapper>

                                <FieldWrapper label={t("vehicleForm.buyer", "Buyer")} required error={(errors as any).buyer_id?.message}>
                                    <DynamicSelect
                                        choiceType="legal_entity"
                                        options={choices?.legal_entities?.map((e) => ({ id: e.id, name: `#${e.internal_id} - ${e.name}` })) ?? []}
                                        value={watch("buyer_id") ?? null}
                                        onChange={(val) => handleDropdownChange("buyer_id", val)}
                                        placeholder={t("vehicleForm.selectBuyer", "Select buyer")}
                                        allowCreate={true}
                                        createLabel={t("vehicleForm.buyer", "Buyer / Entity")}
                                        onAddClick={() => handleOpenEntityModal("buyer_id")}
                                    />
                                </FieldWrapper>
                            </div>
                        </section>
                    )}
                </div>

                {/* SECTION 5: TRANSACTIONS SUB-TABLE */}
                {inlineTransactions && (
                    <section className="pt-0.5">
                        {inlineTransactions}
                    </section>
                )}

                {/* Bottom Actions Row for Add Mode */}
                {!isEditing && (
                    <div className="flex items-center justify-end border-t border-border pt-3 mt-4">
                        <Button
                            type="submit"
                            size="sm"
                            className="h-7.5 text-xs bg-primary text-primary-foreground hover:opacity-90 px-4"
                            disabled={mutation.isPending}
                        >
                            {mutation.isPending ? (
                                <>
                                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                                    {t("common.creating", "Creating...")}
                                </>
                            ) : (
                                <>
                                    <Save className="mr-1.5 size-3.5" />
                                    {t("vehicleForm.createVehicle", "Create Vehicle")}
                                </>
                            )}
                        </Button>
                    </div>
                )}
            </form>

            {/* Legal Entity Creation Modal */}
            <Dialog open={entityModalOpen} onOpenChange={setEntityModalOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-base font-semibold text-heading">
                            {t("legalEntities.addNew", "Add New Person / Entity")}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground">
                            {t("legalEntities.addDescription", "Fill in the details to create a new legal entity.")}
                        </DialogDescription>
                    </DialogHeader>

                    <EntityForm
                        data={entityFormData}
                        onChange={setEntityFormData}
                        isNew
                        errors={entityValidationErrors}
                    />

                    {entityFormError && (
                        <p className="text-xs text-destructive bg-danger-bg p-2 rounded-md border border-danger/20">
                            {entityFormError}
                        </p>
                    )}

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setEntityModalOpen(false)}
                        >
                            {t("common.cancel", "Cancel")}
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            onClick={handleCreateEntity}
                            disabled={createEntityMutation.isPending}
                        >
                            {createEntityMutation.isPending ? t("common.creating", "Creating...") : t("legalEntities.create", "Create Legal Entity")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Contract Modal */}
            <ContractModal
                open={contractModalOpen}
                onOpenChange={setContractModalOpen}
                vehicle={vehicle ?? null}
            />

            {/* Smart Delete Modal */}
            {isEditing && vehicle?.internal_id && (
                <SmartDeleteModal
                    open={deleteModalOpen}
                    onOpenChange={setDeleteModalOpen}
                    entityType="vehicle"
                    entityId={vehicle.internal_id}
                    entityName={vehicleTitle}
                    onConfirm={handleConfirmDelete}
                    isPending={isDeleting}
                />
            )}

            {/* mobile.de Listing & Sync Modal */}
            {isEditing && vehicle?.internal_id && (
                <MobileDeListingModal
                    vehicleInternalId={vehicle.internal_id}
                    vehicleTitle={vehicleTitle}
                    open={mobileDeModalOpen}
                    onOpenChange={setMobileDeModalOpen}
                />
            )}

            {/* Floating Auto-Save Toast Notification (zero layout shift) */}
            {isEditing && (
                <AutoSaveToast
                    status={autoSaveStatus}
                    errorMessage={autoSaveErrorMessage}
                />
            )}

            {/* Net Calculation Breakdown Modal */}
            {activeNetCalculation && (
                <KpiModal
                    kpi={activeNetCalculation}
                    onClose={() => setActiveNetCalculation(null)}
                />
            )}
        </>
    )
}
