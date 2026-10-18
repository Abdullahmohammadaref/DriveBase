import React, { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import {
    X,
    ExternalLink,
    CheckCircle2,
    AlertCircle,
    AlertTriangle,
    Upload,
    Trash2,
    RefreshCw,
    Gauge,
    Sparkles,
    Shield,
    Camera,
    FileText,
    TrendingUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    useVehicleMobileDe,
    usePublishMobileDe,
    useDelistMobileDe,
    useUploadGalleryImage,
    useDeleteGalleryImage,
    useRefreshMobileDeInsights,
} from "@/hooks/useVehicles"
import type { MobileDePublishPayload } from "@/types/vehicle"

export interface MobileDeListingModalProps {
    open?: boolean
    isOpen?: boolean
    onOpenChange?: (open: boolean) => void
    onClose?: () => void
    vehicleId?: number
    vehicleInternalId?: number
    vehicleTitle?: string
    vehicleVin?: string | null
}

export interface FeatureCategory {
    nameKey: string
    defaultName: string
    features: { code: string; label: string }[]
}

export const FEATURE_CATEGORIES_BY_CLASS: Record<string, FeatureCategory[]> = {
    Car: [
        {
            nameKey: "comfort",
            defaultName: "Comfort & Interior",
            features: [
                { code: "NAVIGATION_SYSTEM", label: "Navigation System" },
                { code: "ELECTRIC_HEATED_SEATS", label: "Heated Seats" },
                { code: "CRUISE_CONTROL", label: "Cruise Control" },
                { code: "AUTOMATIC_CLIMATISATION", label: "Automatic Climate Control" },
                { code: "LEATHER_STEERING_WHEEL", label: "Leather Steering Wheel" },
                { code: "MULTIFUNCTIONAL_WHEEL", label: "Multifunction Steering Wheel" },
                { code: "RAIN_SENSOR", label: "Rain Sensor" },
                { code: "SUNROOF", label: "Sunroof / Panoramic" },
            ],
        },
        {
            nameKey: "safety",
            defaultName: "Safety & Assistance",
            features: [
                { code: "ABS", label: "ABS" },
                { code: "TRACTION_CONTROL_SYSTEM", label: "ESP / Traction Control" },
                { code: "PARKING_SENSORS", label: "Parking Sensors (PDC)" },
                { code: "LED_HEADLIGHTS", label: "LED Headlights" },
                { code: "XENON_HEADLIGHTS", label: "Xenon Headlights" },
                { code: "FOUR_WHEEL_DRIVE", label: "Four-Wheel Drive (4x4)" },
                { code: "ISOFIX", label: "Isofix (Child Seat)" },
                { code: "IMMOBILIZER", label: "Immobilizer" },
                { code: "FOG_LIGHTS", label: "Fog Lights" },
            ],
        },
        {
            nameKey: "media",
            defaultName: "Media & Tech",
            features: [
                { code: "BLUETOOTH", label: "Bluetooth" },
                { code: "HANDS_FREE_PHONE_SYSTEM", label: "Hands-free System" },
                { code: "ALLOY_WHEELS", label: "Alloy Wheels" },
                { code: "START_STOP_SYSTEM", label: "Start/Stop System" },
                { code: "CENTRAL_LOCKING", label: "Central Locking" },
            ],
        },
    ],
    Motorbike: [
        {
            nameKey: "motorbike_equipment",
            defaultName: "Motorcycle Equipment",
            features: [
                { code: "ABS", label: "ABS" },
                { code: "HEATED_GRIPS", label: "Heated Grips" },
                { code: "ELECTRIC_STARTER", label: "Electric Starter" },
                { code: "KICKSTARTER", label: "Kickstarter" },
                { code: "WINDSHIELD", label: "Windshield" },
                { code: "CASE_TOPCASE", label: "Topcase / Panniers" },
                { code: "CRASH_BAR", label: "Crash Bars" },
                { code: "CATALYTIC_CONVERTER", label: "Catalytic Converter" },
                { code: "TRACTION_CONTROL_SYSTEM", label: "Traction Control" },
                { code: "ROLL_OVER_BARS", label: "Roll-over Bars" },
            ],
        },
    ],
    Motorhome: [
        {
            nameKey: "motorhome_living",
            defaultName: "Camper & Living Equipment",
            features: [
                { code: "AWNING", label: "Awning (Markise)" },
                { code: "SOLAR_ENERGY_SYSTEM", label: "Solar System" },
                { code: "WC", label: "WC / Toilet" },
                { code: "SHOWER", label: "Shower" },
                { code: "AUXILIARY_HEATING", label: "Auxiliary Heating (Standheizung)" },
                { code: "REAR_GARAGE", label: "Rear Garage" },
                { code: "TV", label: "TV / Satellite System" },
                { code: "BICYCLE_RACK", label: "Bike Rack" },
                { code: "BED_FIXED", label: "Fixed Double Bed" },
                { code: "BUNK_BED", label: "Bunk Bed" },
                { code: "CIRCULAR_SEATING_ARRANGEMENT", label: "Round Seating Group" },
            ],
        },
        {
            nameKey: "motorhome_driving",
            defaultName: "Driving & Vehicle Specs",
            features: [
                { code: "NAVIGATION_SYSTEM", label: "Navigation System" },
                { code: "CRUISE_CONTROL", label: "Cruise Control" },
                { code: "PARKING_SENSORS", label: "Rear Camera / Sensors" },
                { code: "AIR_CONDITIONING", label: "Air Conditioning" },
                { code: "TRAILER_COUPLING", label: "Tow Bar (AHK)" },
                { code: "POWER_STEERING", label: "Power Steering" },
            ],
        },
    ],
    VanUpTo7500: [
        {
            nameKey: "van_cargo",
            defaultName: "Cargo & Commercial Equipment",
            features: [
                { code: "TAIL_LIFT", label: "Tail Lift (Ladebordwand)" },
                { code: "SLIDING_DOOR", label: "Sliding Door" },
                { code: "PARTITION_WALL", label: "Partition Wall" },
                { code: "TRAILER_COUPLING", label: "Tow Bar (AHK)" },
                { code: "CRUISE_CONTROL", label: "Cruise Control" },
                { code: "NAVIGATION_SYSTEM", label: "Navigation System" },
                { code: "AUTOMATIC_CLIMATISATION", label: "Air Conditioning" },
                { code: "PARKING_SENSORS", label: "Parking Sensors" },
            ],
        },
    ],
    TruckOver7500: [
        {
            nameKey: "truck_equipment",
            defaultName: "Truck & Heavy Transport",
            features: [
                { code: "TAIL_LIFT", label: "Tail Lift (Ladebordwand)" },
                { code: "CRANE", label: "Hydraulic Crane" },
                { code: "SLEEPER_CAB", label: "Sleeper Cab" },
                { code: "RETARDER", label: "Retarder / Intarder" },
                { code: "TRAILER_COUPLING", label: "Trailer Hitch" },
                { code: "CRUISE_CONTROL", label: "Cruise Control" },
                { code: "AUXILIARY_HEATING", label: "Auxiliary Heating" },
            ],
        },
    ],
    Trailer: [
        {
            nameKey: "trailer_features",
            defaultName: "Trailer Equipment",
            features: [
                { code: "ABS", label: "ABS" },
                { code: "DISC_BRAKES", label: "Disc Brakes" },
                { code: "AIR_SUSPENSION", label: "Air Suspension" },
            ],
        },
    ],
}

export function MobileDeListingModal({
    open,
    isOpen,
    onOpenChange,
    onClose,
    vehicleId,
    vehicleInternalId,
    vehicleTitle,
    vehicleVin,
}: MobileDeListingModalProps) {
    const { t } = useTranslation()

    const isModalOpen = Boolean(open ?? isOpen)
    const targetVehicleId = (vehicleId ?? vehicleInternalId) || 0
    const handleClose = () => {
        onClose?.()
        onOpenChange?.(false)
    }

    // Active tab
    const [activeTab, setActiveTab] = useState<"specs" | "features" | "envkv" | "gallery" | "description">("specs")

    // Form data state
    const [transmission, setTransmission] = useState<string>("AUTOMATIC_GEAR")
    const [condition, setCondition] = useState<string>("USED")
    const [huDate, setHuDate] = useState<string>("")
    const [features, setFeatures] = useState<string[]>([])
    const [emissionClass, setEmissionClass] = useState<string>("EURO6")
    const [emissionBadge, setEmissionBadge] = useState<string>("GREEN")
    const [fuelConsumption, setFuelConsumption] = useState<number | string>("")
    const [co2Emission, setCo2Emission] = useState<number | string>("")
    const [efficiencyClass, setEfficiencyClass] = useState<string>("")
    const [description, setDescription] = useState<string>("")
    const [confirmDelist, setConfirmDelist] = useState(false)
    const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null)

    // Data hooks
    const { data: listingData, isLoading, refetch } = useVehicleMobileDe(targetVehicleId, isModalOpen)
    const publishMutation = usePublishMobileDe()
    const delistMutation = useDelistMobileDe()
    const uploadImageMutation = useUploadGalleryImage()
    const deleteImageMutation = useDeleteGalleryImage()
    const refreshInsightsMutation = useRefreshMobileDeInsights()

    // Populate form data once query loads
    useEffect(() => {
        if (listingData) {
            setTransmission(listingData.transmission || "AUTOMATIC_GEAR")
            setCondition(listingData.condition || "USED")
            setHuDate(listingData.hu_date || "")
            setFeatures(listingData.features || [])
            setEmissionClass(listingData.emission_class || "EURO6")
            setEmissionBadge(listingData.emission_badge || "GREEN")
            setFuelConsumption(listingData.fuel_consumption_combined !== null ? listingData.fuel_consumption_combined : "")
            setCo2Emission(listingData.co2_emission_combined !== null ? listingData.co2_emission_combined : "")
            setEfficiencyClass(listingData.efficiency_class || "")
            setDescription(listingData.mobile_de_description || "")
        }
    }, [listingData])

    if (!isModalOpen) return null

    const isLive = listingData?.mobile_de_status === "active"
    const mappingIssues = listingData?.mapping_issues || []
    const hasMappingIssues = mappingIssues.length > 0
    const vehicleClass = listingData?.vehicle_class || "Car"
    const activeCategories = FEATURE_CATEGORIES_BY_CLASS[vehicleClass] || FEATURE_CATEGORIES_BY_CLASS.Car

    const toggleFeature = (code: string) => {
        setFeatures((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]))
    }

    const appendQuickTag = (tag: string) => {
        setDescription((prev) => (prev.trim() ? `${prev.trim()}\n• ${tag}` : `• ${tag}`))
    }

    const handlePublish = () => {
        setFeedback(null)

        if (hasMappingIssues) {
            setFeedback({
                type: "error",
                message: t("mobileDe.unmappedWarningDesc", "This vehicle contains unmapped attributes that must be resolved before publishing."),
            })
            return
        }

        if (!transmission) {
            setFeedback({
                type: "error",
                message: t("mobileDe.transmissionRequired", "Transmission is required to publish on mobile.de."),
            })
            setActiveTab("specs")
            return
        }

        const payload: MobileDePublishPayload = {
            transmission,
            condition,
            hu_date: huDate.trim() || null,
            features,
            emission_class: emissionClass.trim() || null,
            emission_badge: emissionBadge.trim() || null,
            fuel_consumption_combined: fuelConsumption !== "" ? Number(fuelConsumption) : null,
            co2_emission_combined: co2Emission !== "" ? Number(co2Emission) : null,
            efficiency_class: efficiencyClass.trim() || null,
            mobile_de_description: description.trim() || null,
        }

        publishMutation.mutate(
            { internalId: targetVehicleId, payload },
            {
                onSuccess: (data) => {
                    setFeedback({
                        type: "success",
                        message: data.message || t("mobileDe.publishedSuccess", "Listing published to mobile.de successfully."),
                    })
                    refetch()
                },
                onError: (err: any) => {
                    const msg = err.response?.data?.detail || t("mobileDe.publishFailed", "Failed to publish listing.")
                    setFeedback({ type: "error", message: msg })
                },
            }
        )
    }

    const handleDelist = () => {
        setFeedback(null)
        delistMutation.mutate(targetVehicleId, {
            onSuccess: (data) => {
                setConfirmDelist(false)
                setFeedback({
                    type: "success",
                    message: data.message || t("mobileDe.delistedSuccess", "Vehicle delisted from mobile.de successfully."),
                })
                refetch()
            },
            onError: (err: any) => {
                const msg = err.response?.data?.detail || t("mobileDe.delistFailed", "Failed to delist vehicle.")
                setFeedback({ type: "error", message: msg })
            },
        })
    }

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return
        const file = e.target.files[0]
        uploadImageMutation.mutate(
            { internalId: targetVehicleId, file },
            {
                onError: (err: any) => {
                    const msg = err.response?.data?.detail || t("mobileDe.imageUploadFailed", "Failed to upload image.")
                    setFeedback({ type: "error", message: msg })
                },
            }
        )
        e.target.value = ""
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto" onClick={handleClose}>
            <div className="relative w-full max-w-4xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/30">
                    <div>
                        <div className="flex items-center gap-2">
                                <h2 className="text-base font-semibold text-foreground">
                                    {vehicleTitle || `Vehicle #${targetVehicleId}`}
                                </h2>
                                {isLive ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        {t("mobileDe.liveOnMobileDe", "Live on mobile.de")}
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                                        {t("mobileDe.notListed", "Not Listed")}
                                    </span>
                                )}
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                                <span>ID: #{targetVehicleId}</span>
                                {vehicleVin && <span>• VIN: {vehicleVin}</span>}
                                {listingData?.mobile_de_url && (
                                    <a
                                        href={listingData.mobile_de_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline inline-flex items-center gap-1 font-medium ml-1"
                                    >
                                        {t("mobileDe.viewLiveAd", "View on mobile.de")}
                                        <ExternalLink className="size-3" />
                                    </a>
                                )}
                            </div>
                        </div>

                    <button
                        onClick={handleClose}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                        <X className="size-5" />
                    </button>
                </div>

                {/* Live Analytics Strip (If Active) */}
                {isLive && listingData && (
                    <div className="px-6 py-2.5 bg-emerald-50/50 border-b border-emerald-100 flex flex-wrap items-center justify-between text-xs text-emerald-900 gap-3">
                        <div className="flex items-center gap-6 font-medium">
                            <div className="flex items-center gap-1.5">
                                <span className="text-muted-foreground">{t("mobileDe.views", "Views")}:</span>
                                <span className="font-semibold text-foreground">{listingData.detail_views}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="text-muted-foreground">{t("mobileDe.searchHits", "Search Hits")}:</span>
                                <span className="font-semibold text-foreground">{listingData.search_hits}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="text-muted-foreground">{t("mobileDe.favorites", "Favorites")}:</span>
                                <span className="font-semibold text-foreground">{listingData.parkings}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="text-muted-foreground">{t("mobileDe.leads", "Leads")}:</span>
                                <span className="font-semibold text-foreground">{listingData.leads_count}</span>
                            </div>
                            {listingData.price_rating && (
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white border border-emerald-200 text-emerald-700">
                                    <TrendingUp className="size-3" />
                                    <span>{listingData.price_rating}</span>
                                </div>
                            )}
                        </div>

                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs px-2 gap-1 text-emerald-800 hover:text-emerald-900 hover:bg-emerald-100/50"
                            onClick={() => refreshInsightsMutation.mutate(targetVehicleId)}
                            disabled={refreshInsightsMutation.isPending}
                        >
                            <RefreshCw className={`size-3 ${refreshInsightsMutation.isPending ? "animate-spin" : ""}`} />
                            {t("mobileDe.refreshInsights", "Refresh")}
                        </Button>
                    </div>
                )}

                {/* Feedback alert */}
                {feedback && (
                    <div
                        className={`mx-6 mt-4 p-3 rounded-lg text-sm border flex items-start gap-2.5 ${
                            feedback.type === "success"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : "bg-rose-50 text-rose-800 border-rose-200"
                        }`}
                    >
                        {feedback.type === "success" ? (
                            <CheckCircle2 className="size-4 mt-0.5 shrink-0 text-emerald-600" />
                        ) : (
                            <AlertCircle className="size-4 mt-0.5 shrink-0 text-rose-600" />
                        )}
                        <span>{feedback.message}</span>
                    </div>
                )}

                {/* Marketplace Mapping Issues Banner */}
                {hasMappingIssues && (
                    <div className="mx-6 mt-4 p-3.5 rounded-xl border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 text-xs space-y-2 shadow-2xs">
                        <div className="flex items-center gap-2 font-semibold">
                            <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
                            <span>{t("mobileDe.unmappedWarningTitle", "Unrecognized Marketplace Values Detected")}</span>
                        </div>
                        <p className="text-amber-800 dark:text-amber-300/90 leading-relaxed">
                            {t("mobileDe.unmappedWarningDesc", "This vehicle contains attributes that are not mapped to official mobile.de standards. Publishing is disabled until mapped in Choices Management or updated in Vehicle Details:")}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                            {mappingIssues.map((issue, idx) => (
                                <div key={idx} className="flex items-start gap-1.5 px-2.5 py-1.5 rounded-md bg-white/80 dark:bg-zinc-900/50 border border-amber-200/80 dark:border-amber-800/40">
                                    <span className="font-semibold capitalize text-foreground">{issue.field.replace("_", " ")}:</span>
                                    <span className="text-amber-800 dark:text-amber-300 font-medium">{issue.name || "—"}</span>
                                    <span className="text-muted-foreground text-[11px] ml-auto">({issue.message})</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Navigation Tabs */}
                <div className="px-6 pt-3 border-b border-border flex gap-2 overflow-x-auto text-sm">
                    <button
                        type="button"
                        onClick={() => setActiveTab("specs")}
                        className={`pb-2.5 px-3 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                            activeTab === "specs"
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <Gauge className="size-4" />
                        {t("mobileDe.tabSpecs", "Specs & Pricing")}
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("features")}
                        className={`pb-2.5 px-3 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                            activeTab === "features"
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <Sparkles className="size-4" />
                        {t("mobileDe.tabFeatures", "Equipment")} ({features.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("envkv")}
                        className={`pb-2.5 px-3 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                            activeTab === "envkv"
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <Shield className="size-4" />
                        {t("mobileDe.tabEmissions", "EnVKV / Emissions")}
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("gallery")}
                        className={`pb-2.5 px-3 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                            activeTab === "gallery"
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <Camera className="size-4" />
                        {t("mobileDe.tabGallery", "Photos")} ({listingData?.gallery_images?.length || 0})
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("description")}
                        className={`pb-2.5 px-3 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                            activeTab === "description"
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <FileText className="size-4" />
                        {t("mobileDe.tabDescription", "Description")}
                    </button>
                </div>

                {/* Tab Contents */}
                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    {/* Tab 1: Specs */}
                    {activeTab === "specs" && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                                {/* Transmission */}
                                <div className="space-y-1.5">
                                    <Label htmlFor="transmission" className="text-xs font-semibold text-foreground">
                                        {t("mobileDe.transmission", "Transmission / Gearbox")} *
                                    </Label>
                                    <select
                                        id="transmission"
                                        value={transmission}
                                        onChange={(e) => setTransmission(e.target.value)}
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary"
                                    >
                                        <option value="AUTOMATIC_GEAR">{t("mobileDe.automatic", "Automatic (AUTOMATIC_GEAR)")}</option>
                                        <option value="MANUAL_GEAR">{t("mobileDe.manual", "Manual (MANUAL_GEAR)")}</option>
                                    </select>
                                </div>

                                {/* Condition */}
                                <div className="space-y-1.5">
                                    <Label htmlFor="condition" className="text-xs font-semibold text-foreground">
                                        {t("mobileDe.condition", "Vehicle Condition")}
                                    </Label>
                                    <select
                                        id="condition"
                                        value={condition}
                                        onChange={(e) => setCondition(e.target.value)}
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary"
                                    >
                                        <option value="USED">{t("mobileDe.used", "Used Vehicle (USED)")}</option>
                                        <option value="NEW">{t("mobileDe.new", "New Vehicle (NEW)")}</option>
                                    </select>
                                </div>

                                {/* HU / TÜV Expiry Date */}
                                <div className="space-y-1.5 md:col-span-2">
                                    <Label htmlFor="hu_date" className="text-xs font-semibold text-foreground">
                                        {t("mobileDe.huDate", "HU / TÜV Expiry (YYYY-MM)")}
                                    </Label>
                                    <Input
                                        id="hu_date"
                                        type="text"
                                        placeholder="e.g. 2026-08"
                                        value={huDate}
                                        onChange={(e) => setHuDate(e.target.value)}
                                        className="bg-background max-w-xs"
                                    />
                                    <p className="text-[11px] text-muted-foreground">
                                        {t("mobileDe.huDateHint", "Inspection validity month required in Germany (format: YYYY-MM)")}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Tab 2: Equipment & Features */}
                    {activeTab === "features" && (
                        <div className="space-y-6">
                            <div className="space-y-5">
                                {activeCategories.map((category) => (
                                    <div key={category.nameKey} className="space-y-2.5">
                                        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                                            {t(`mobileDe.${category.nameKey}`, category.defaultName)}
                                        </h3>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                            {category.features.map((feat) => {
                                                const checked = features.includes(feat.code)
                                                return (
                                                    <button
                                                        key={feat.code}
                                                        type="button"
                                                        onClick={() => toggleFeature(feat.code)}
                                                        className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs text-left transition-all ${
                                                            checked
                                                                ? "bg-primary/10 border-primary text-primary font-medium"
                                                                : "bg-background border-border text-foreground hover:bg-muted/50"
                                                        }`}
                                                    >
                                                        <div
                                                            className={`size-4 rounded-sm border flex items-center justify-center shrink-0 ${
                                                                checked
                                                                    ? "bg-primary border-primary text-primary-foreground"
                                                                    : "border-muted-foreground/40"
                                                            }`}
                                                        >
                                                            {checked && <CheckCircle2 className="size-3" />}
                                                        </div>
                                                        <span className="truncate">{feat.label}</span>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Tab 3: EnVKV / Emissions */}
                    {activeTab === "envkv" && (
                        <div className="space-y-5">
                            {(vehicleClass === "Motorbike" || vehicleClass === "Trailer") && (
                                <div className="p-3.5 rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/20 text-sky-900 dark:text-sky-200 text-xs space-y-1">
                                    <div className="flex items-center gap-2 font-semibold">
                                        <Shield className="size-4 text-sky-600 dark:text-sky-400 shrink-0" />
                                        <span>{t("mobileDe.envkvExemptNoticeTitle", "EnVKV Exemption for this Vehicle Class")}</span>
                                    </div>
                                    <p className="text-sky-800 dark:text-sky-300/90 leading-relaxed">
                                        {t(
                                            "mobileDe.envkvExemptNoticeDesc",
                                            "Under German and EU passenger car energy labelling regulations (EnVKV), standardized consumption and CO2 efficiency declarations do not apply to motorcycles or trailers. These fields are optional for this listing."
                                        )}
                                    </p>
                                </div>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label htmlFor="emission_class" className="text-xs font-semibold text-foreground">
                                        {t("mobileDe.emissionClass", "Emission Class")}
                                    </Label>
                                    <Input
                                        id="emission_class"
                                        type="text"
                                        placeholder="e.g. EURO6"
                                        value={emissionClass}
                                        onChange={(e) => setEmissionClass(e.target.value)}
                                        className="bg-background"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="emission_badge" className="text-xs font-semibold text-foreground">
                                        {t("mobileDe.emissionBadge", "Emission Badge (Plakette)")}
                                    </Label>
                                    <select
                                        id="emission_badge"
                                        value={emissionBadge}
                                        onChange={(e) => setEmissionBadge(e.target.value)}
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-hidden"
                                    >
                                        <option value="GREEN">{t("mobileDe.badgeGreen", "Green (4 - Grün)")}</option>
                                        <option value="YELLOW">{t("mobileDe.badgeYellow", "Yellow (3 - Gelb)")}</option>
                                        <option value="RED">{t("mobileDe.badgeRed", "Red (2 - Rot)")}</option>
                                        <option value="NONE">{t("mobileDe.badgeNone", "None (Keine)")}</option>
                                    </select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="fuel_consumption" className="text-xs font-semibold text-foreground">
                                        {t("mobileDe.fuelConsumption", "Combined Fuel Consumption (l/100km)")}
                                    </Label>
                                    <Input
                                        id="fuel_consumption"
                                        type="number"
                                        step="0.1"
                                        placeholder="e.g. 5.4"
                                        value={fuelConsumption}
                                        onChange={(e) => setFuelConsumption(e.target.value)}
                                        className="bg-background"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="co2_emission" className="text-xs font-semibold text-foreground">
                                        {t("mobileDe.co2Emissions", "Combined CO2 Emissions (g/km)")}
                                    </Label>
                                    <Input
                                        id="co2_emission"
                                        type="number"
                                        placeholder="e.g. 138"
                                        value={co2Emission}
                                        onChange={(e) => setCo2Emission(e.target.value)}
                                        className="bg-background"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="efficiency_class" className="text-xs font-semibold text-foreground">
                                        {t("mobileDe.efficiencyClass", "Efficiency Class (A+, A, B, C...)")}
                                    </Label>
                                    <Input
                                        id="efficiency_class"
                                        type="text"
                                        placeholder="e.g. A"
                                        value={efficiencyClass}
                                        onChange={(e) => setEfficiencyClass(e.target.value)}
                                        className="bg-background"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Tab 4: Photos & Gallery */}
                    {activeTab === "gallery" && (
                        <div className="space-y-5">
                            <div className="flex justify-end">
                                <label className="cursor-pointer">
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs">
                                        <Upload className="size-3.5" />
                                        {t("mobileDe.addPhoto", "Add Photo")}
                                    </span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleImageUpload}
                                        disabled={uploadImageMutation.isPending}
                                    />
                                </label>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                {/* Primary photo */}
                                {listingData?.primary_image_url && (
                                    <div className="relative rounded-xl border-2 border-primary overflow-hidden group bg-muted aspect-4/3 flex items-center justify-center">
                                        <img
                                            src={listingData.primary_image_url}
                                            alt="Primary"
                                            className="w-full h-full object-cover"
                                        />
                                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-primary text-primary-foreground shadow-xs">
                                            {t("mobileDe.primaryPhoto", "Main Photo")}
                                        </span>
                                    </div>
                                )}

                                {/* Additional gallery photos */}
                                {listingData?.gallery_images?.map((img, idx) => (
                                    <div
                                        key={img.id}
                                        className="relative rounded-xl border border-border overflow-hidden group bg-muted aspect-4/3 flex items-center justify-center"
                                    >
                                        <img src={img.image_url} alt={`Gallery ${idx}`} className="w-full h-full object-cover" />
                                        <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-black/60 text-white">
                                            #{img.order || idx + 2}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => deleteImageMutation.mutate({ internalId: targetVehicleId, imageId: img.id })}
                                            className="absolute top-2 right-2 p-1 rounded-md bg-rose-600 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-700"
                                            title={t("common.delete", "Delete")}
                                        >
                                            <Trash2 className="size-3.5" />
                                        </button>
                                    </div>
                                ))}

                                {(!listingData?.gallery_images || listingData.gallery_images.length === 0) &&
                                    !listingData?.primary_image_url && (
                                        <div className="col-span-full p-8 text-center border-2 border-dashed border-border rounded-xl text-muted-foreground text-xs">
                                            {t("mobileDe.noPhotos", "No photos uploaded yet. Add at least one photo for maximum engagement.")}
                                        </div>
                                    )}
                            </div>
                        </div>
                    )}

                    {/* Tab 5: Description */}
                    {activeTab === "description" && (
                        <div className="space-y-4">
                            <div className="flex flex-wrap gap-2 items-center">
                                <span className="text-xs text-muted-foreground">{t("mobileDe.quickTags", "Quick Insert")}:</span>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => appendQuickTag("TÜV neu")}
                                >
                                    + TÜV neu
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => appendQuickTag("Scheckheftgepflegt")}
                                >
                                    + Scheckheftgepflegt
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => appendQuickTag("1. Hand")}
                                >
                                    + 1. Hand
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => appendQuickTag("Finanzierung möglich")}
                                >
                                    + Finanzierung möglich
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => appendQuickTag("Inzahlungnahme möglich")}
                                >
                                    + Inzahlungnahme
                                </Button>
                            </div>

                            <Textarea
                                rows={8}
                                placeholder={t("mobileDe.descriptionPlaceholder", "Enter marketing text for prospective car buyers...")}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="bg-background text-sm leading-relaxed"
                            />
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="px-6 py-4 border-t border-border flex items-center justify-between bg-muted/20">
                    <div>
                        {isLive && !confirmDelist && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700 text-xs"
                                onClick={() => setConfirmDelist(true)}
                                disabled={delistMutation.isPending}
                            >
                                {t("mobileDe.delistFromMobileDe", "Remove from mobile.de")}
                            </Button>
                        )}

                        {isLive && confirmDelist && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-rose-700 font-medium">
                                    {t("mobileDe.confirmDelistPrompt", "Unpublish listing?")}
                                </span>
                                <Button
                                    type="button"
                                    size="sm"
                                    className="bg-rose-600 hover:bg-rose-700 text-white text-xs h-7"
                                    onClick={handleDelist}
                                    disabled={delistMutation.isPending}
                                >
                                    {delistMutation.isPending ? t("common.processing", "Processing...") : t("common.confirm", "Yes, Delist")}
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs h-7"
                                    onClick={() => setConfirmDelist(false)}
                                >
                                    {t("common.cancel", "Cancel")}
                                </Button>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={handleClose} className="text-xs">
                            {t("common.close", "Close")}
                        </Button>

                        <Button
                            type="button"
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={handlePublish}
                            disabled={publishMutation.isPending || isLoading || hasMappingIssues}
                            title={hasMappingIssues ? t("mobileDe.publishBlockedTooltip", "Cannot publish: resolve unmapped choices first") : undefined}
                        >
                            {publishMutation.isPending && <RefreshCw className="size-3.5 animate-spin" />}
                            {isLive
                                ? t("mobileDe.updateListing", "Update Listing & Sync")
                                : t("mobileDe.publishToMobileDe", "Publish to mobile.de")}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default MobileDeListingModal
