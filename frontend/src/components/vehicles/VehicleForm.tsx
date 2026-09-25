import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query"
import { Loader2, Save, ArrowLeft, AlertTriangle, X, FileText, Trash2, RotateCcw } from "lucide-react"
import { ContractModal } from "./ContractModal"
import { VehicleImageUpload } from "./VehicleImageUpload"
import { FinancialMetricsStrip } from "./FinancialMetricsStrip"
import { VehiclePipeline } from "./VehiclePipeline"
import { VehicleExpensesEarningsCard } from "./VehicleExpensesEarningsCard"
import { AutoSaveIndicator } from "@/components/AutoSaveIndicator"
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
import { vehicleCreateSchema, vehicleUpdateSchema, type VehicleCreateInput, type VehicleUpdateInput } from "@/lib/validations"
import api, { ensureCsrfToken } from "@/lib/api"
import { formatCurrency } from "@/lib/utils"
import { calcVehicleFinancials } from "@/lib/vehicleFinancials"
import type { VehicleDetail } from "@/types/vehicle"

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
}

function ModelSelect({ makeId, value, onChange, error }: ModelSelectProps) {
    const { t } = useTranslation()
    const { data: models, isLoading } = useModels(makeId)

    const options = models?.map((model) => ({
        id: model.id,
        name: model.name,
    })) ?? []

    return (
        <FieldWrapper label={t("vehicleForm.model", "Model")} required error={error}>
            <DynamicSelect
                choiceType="vehicle_model"
                options={options}
                value={value}
                onChange={onChange}
                placeholder={
                    !makeId
                        ? t("vehicleForm.selectMakeFirst", "Select make first")
                        : isLoading
                            ? t("common.loading", "Loading...")
                            : t("vehicleForm.selectModel", "Select model")
                }
                disabled={!makeId || isLoading}
                allowCreate={Boolean(makeId)}
                createLabel={t("vehicleForm.model", "Model")}
                parentId={makeId}
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

    // --- Form Foundation ---
    const schema = isEditing ? vehicleUpdateSchema : vehicleCreateSchema
    const {
        handleSubmit,
        setValue,
        watch,
        reset,
        formState: { errors },
    } = useForm<VehicleCreateInput | VehicleUpdateInput>({
        resolver: zodResolver(schema) as any,
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
    const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null)
    const [imageUploadError, setImageUploadError] = useState<string | null>(null)
    const [isUploadingImage, setIsUploadingImage] = useState(false)
    const createEntityMutation = useCreateLegalEntity()

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
    const { data: choices, isLoading: choicesLoading } = useChoices(vehicle?.id)
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
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-1.5 mb-2.5">
                        {/* Left: Back + Vehicle Title/ID + AutoSave */}
                        <div className="flex min-w-0 items-center gap-2.5">
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
                            <div className="flex items-center gap-2 min-w-0">
                                <h1 className="truncate text-sm font-semibold tracking-tight text-heading">
                                    {vehicleTitle} <span className="text-muted-foreground font-normal">#{vehicle?.internal_id}</span>
                                </h1>
                                <AutoSaveIndicator
                                    status={autoSaveStatus}
                                    errorMessage={autoSaveErrorMessage}
                                />
                            </div>
                        </div>

                        {/* Middle: Status Pipeline + Days on Stock */}
                        <div className="mx-1.5 flex min-w-0 items-center gap-1.5 overflow-x-auto">
                            <VehiclePipeline
                                currentStatus={watchedStatus as VehicleStatus}
                                canMoveTo={vehicle?.can_move_to || []}
                                onStatusChange={handleStatusChange}
                                orientation="horizontal"
                            />
                            {vehicleFinancials.daysOnStock !== null && (
                                <span className="hidden md:inline-flex h-5 shrink-0 items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800">
                                    <span className="size-1 shrink-0 rounded-full bg-current" />
                                    {vehicleFinancials.daysOnStock}d {t("vehicles.daysOnStock", "on Stock")}
                                </span>
                            )}
                        </div>

                        {/* Right: Actions */}
                        <div className="flex shrink-0 items-center gap-1.5">
                            {watchedStatus === "inactive" ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs gap-1 text-green-600 border-green-300 hover:bg-green-50 hover:text-green-700 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-900/30"
                                    onClick={() => handleStatusChange("purchased")}
                                    title={t("common.activate", "Activate")}
                                >
                                    <RotateCcw className="size-3" />
                                    {t("common.activate", "Activate")}
                                </Button>
                            ) : (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs gap-1 text-red-500 border-red-300 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-900/30"
                                    onClick={() => handleStatusChange("inactive")}
                                    title={t("common.deactivate", "Deactivate")}
                                >
                                    <Trash2 className="size-3" />
                                    {t("common.deactivate", "Deactivate")}
                                </Button>
                            )}

                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className={`h-7 text-xs gap-1 ${canGenerateAnyContract ? "" : "opacity-75"}`}
                                onClick={() => setContractModalOpen(true)}
                                title={t("vehicles.generateDocuments", "Generate documents")}
                            >
                                <FileText className="size-3" />
                                {t("vehicles.documents", "Docs")}
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
                                className="size-6.5"
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

                        {/* Make */}
                        <FieldWrapper label={t("vehicleForm.make", "Make")} required error={errors.make_id?.message}>
                            <DynamicSelect
                                choiceType="make"
                                options={toOptions(choices?.makes)}
                                value={watch("make_id") ?? null}
                                onChange={(val) => {
                                    setValue("make_id", val ?? 0)
                                    setValue("model_id", undefined as any)
                                    if (isEditing && onAutoSave) {
                                        onAutoSave({ make_id: val ?? 0, model_id: undefined })
                                    }
                                }}
                                placeholder={t("vehicleForm.selectMake", "Select make")}
                                createLabel={t("vehicleForm.make", "Make")}
                            />
                        </FieldWrapper>

                        {/* Model */}
                        <ModelSelect
                            makeId={watch("make_id")}
                            value={watch("model_id") ?? null}
                            onChange={(val) => handleDropdownChange("model_id", val ?? undefined)}
                            error={errors.model_id?.message}
                        />

                        {/* Vehicle Type */}
                        <FieldWrapper label={t("vehicleForm.vehicleType", "Vehicle Type")} required error={errors.vehicle_type_id?.message}>
                            <DynamicSelect
                                choiceType="vehicle_type"
                                options={toOptions(choices?.vehicle_types)}
                                value={watch("vehicle_type_id") ?? null}
                                onChange={(val) => handleDropdownChange("vehicle_type_id", val ?? 0)}
                                placeholder={t("vehicleForm.selectType", "Select type")}
                                createLabel={t("vehicleForm.vehicleType", "Vehicle Type")}
                            />
                        </FieldWrapper>

                        {/* Body Type */}
                        <FieldWrapper label={t("vehicleForm.bodyType", "Body Type")} required error={errors.body_type_id?.message}>
                            <DynamicSelect
                                choiceType="body_type"
                                options={toOptions(choices?.body_types)}
                                value={watch("body_type_id") ?? null}
                                onChange={(val) => handleDropdownChange("body_type_id", val ?? 0)}
                                placeholder={t("vehicleForm.selectBodyType", "Select body type")}
                                createLabel={t("vehicleForm.bodyType", "Body Type")}
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

                        {/* Doors */}
                        <FieldWrapper label={t("vehicleForm.doors", "Doors")} required error={errors.doors_id?.message}>
                            <DynamicSelect
                                choiceType="doors"
                                options={toOptions(choices?.doors)}
                                value={watch("doors_id") ?? null}
                                onChange={(val) => handleDropdownChange("doors_id", val ?? 0)}
                                placeholder={t("vehicleForm.selectDoors", "Select doors")}
                                createLabel={t("vehicleForm.doors", "Doors")}
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
                                    <span className="shrink-0 text-xs normal-case tracking-normal text-gray-600 dark:text-muted-foreground font-mono font-medium">
                                        {t("vehicleForm.net", "Net")} <span className="font-bold text-[#318d6c]">{formatMoneyOrDash(buyBreakdown.net)}</span> = {t("vehicles.buyGross", "Gross")} {formatMoneyOrDash(buyBreakdown.gross)} − {t("vehicleForm.tax", "Tax")} {formatMoneyOrDash(buyBreakdown.taxAmount)} ({buyBreakdown.taxRate.toFixed(1)}%)
                                    </span>
                                ) : (
                                    <span className="shrink-0 text-xs normal-case tracking-normal text-gray-400 dark:text-muted-foreground font-mono">
                                        {t("vehicleForm.net", "Net")}: — {t("vehicles.buyGross", "Gross")} (—) − {t("vehicleForm.tax", "Tax")} —
                                    </span>
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
                                        <span className="shrink-0 text-xs normal-case tracking-normal text-gray-600 dark:text-muted-foreground font-mono font-medium">
                                            {t("vehicleForm.net", "Net")} <span className="font-bold text-[#318d6c]">{formatMoneyOrDash(saleBreakdown.net)}</span> = {t("vehicles.saleGross", "Gross")} {formatMoneyOrDash(saleBreakdown.gross)} − {t("vehicleForm.tax", "Tax")} {formatMoneyOrDash(saleBreakdown.taxAmount)} ({saleBreakdown.taxRate.toFixed(1)}%)
                                        </span>
                                    ) : (
                                        <span className="shrink-0 text-xs normal-case tracking-normal text-gray-400 dark:text-muted-foreground font-mono">
                                            {t("vehicleForm.net", "Net")}: — {t("vehicles.saleGross", "Gross")} (—) − {t("vehicleForm.tax", "Tax")} —
                                        </span>
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

                {/* SECTION 4: FINANCIAL METRIC KPI RIBBON */}
                {buyBreakdown.hasValue && (
                    <section className="pt-0.5">
                        <FinancialMetricsStrip
                            financials={vehicleFinancials}
                            hideTransactions={!isEditing}
                            annualTargetRate={businessSettings?.target_annual_return}
                        />
                    </section>
                )}

                {/* SECTION 5: TRANSACTIONS SUB-TABLE */}
                {inlineTransactions && (
                    <section className="pt-0.5">
                        {inlineTransactions}
                    </section>
                )}

                {/* Bottom Actions Row for Add Mode */}
                {!isEditing && (
                    <div className="flex items-center justify-end border-t border-border pt-4 mt-6">
                        <Button
                            type="submit"
                            size="sm"
                            className="h-8 text-xs bg-primary text-primary-foreground hover:opacity-90 px-4"
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
        </>
    )
}
