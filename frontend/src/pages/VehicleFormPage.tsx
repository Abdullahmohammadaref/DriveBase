import { useParams, useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { Loader2, ArrowLeft } from "lucide-react"
import { VehicleForm } from "@/components/vehicles/VehicleForm"
import { RelatedTransactionsTable } from "@/components/transactions/RelatedTransactionsTable"
import { useAutoSave } from "@/hooks/useAutoSave"
import { vehicleKeys } from "@/hooks/useVehicles"
import { Button } from "@/components/ui/button"
import api from "@/lib/api"
import { useAuth } from "@/lib/auth"
import type { VehicleDetail } from "@/types/vehicle"
import type { VehicleUpdateInput } from "@/lib/validations"
import { RecordNavigation } from "@/components/RecordNavigation"

export function VehicleFormPage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { user } = useAuth()
    const { business_slug, id } = useParams<{ business_slug: string; id: string }>()
    const isEditing = Boolean(id)
    const vehicleId = id ? Number(id) : 0

    // Fetch vehicle data if editing
    const { data: vehicle, isLoading, isFetching, isError } = useQuery({
        queryKey: vehicleKeys.detail(vehicleId),
        queryFn: async (): Promise<VehicleDetail> => {
            const response = await api.get(`/vehicles/${id}`)
            return response.data
        },
        enabled: isEditing && Boolean(id),
    })

    // Auto-save hook
    const { status: autoSaveStatus, errorMessage, saveNow, saveDebounced } = useAutoSave<VehicleUpdateInput>({
        endpoint: `/vehicles/${vehicleId}`,
        method: "PATCH",
        updateQueryKey: vehicleKeys.detail(vehicleId),
        invalidateQueryKeys: [vehicleKeys.lists()],
    })

    const handleBack = () => {
        if (window.history.state && window.history.state.idx > 0) {
            navigate(-1)
        } else {
            navigate(`/${business_slug}/vehicles`)
        }
    }

    const showTransactions = Boolean(
        isEditing && vehicle && vehicle.internal_id && (user?.is_manager || user?.transactions_access)
    )

    // Loading state
    if (isEditing && (isLoading || isFetching)) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    // Error state
    if (isEditing && (isError || !vehicle)) {
        return (
            <div className="space-y-4 rounded-md border border-border bg-background p-6">
                <div className="flex items-center gap-3">
                    <Button variant="outline" size="icon" className="size-7" onClick={handleBack} aria-label={t("common.back", "Back")}>
                        <ArrowLeft className="size-3.5" />
                    </Button>
                    <h1 className="text-base font-semibold text-heading">{t("vehicles.notFound", "Vehicle Not Found")}</h1>
                </div>
                <p className="text-xs text-muted-foreground">
                    {t("vehicles.notFoundDesc", "The vehicle with ID #{{id}} could not be found or has been removed.", { id })}
                </p>
            </div>
        )
    }

    const prevVehicleId = vehicle?.prev_vehicle_internal_id ?? null
    const nextVehicleId = vehicle?.next_vehicle_internal_id ?? null
    const vehicleTitle = vehicle ? `${vehicle.make_name || ""} ${vehicle.model_name || ""}`.trim() : ""

    return (
        <div className="w-full space-y-2.5 pb-12">
            {/* Sticky Page Header for Edit Mode */}
            {isEditing && vehicle && (
                <div className="flex items-center justify-between gap-2 border-b border-border pb-1.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <Button
                            variant="outline"
                            size="icon"
                            className="size-7 shrink-0"
                            onClick={handleBack}
                            aria-label={t("common.back", "Back")}
                        >
                            <ArrowLeft className="size-3.5" />
                        </Button>
                        <div className="flex items-baseline gap-2 min-w-0">
                            <h1 className="truncate text-sm font-semibold tracking-tight text-heading">
                                {vehicleTitle} <span className="text-muted-foreground font-normal">#{vehicle.internal_id}</span>
                            </h1>
                            <span className="hidden sm:inline text-[11px] text-muted-foreground truncate">
                                {t("nav.vehicles", "Vehicles")} / {vehicle.make_name} #{vehicle.internal_id}
                            </span>
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                        <RecordNavigation
                            basePath={`/${business_slug}/vehicles`}
                            prevId={prevVehicleId}
                            nextId={nextVehicleId}
                            pathSuffix="/edit"
                            label={t("vehicles.vehicleLabel", "Vehicle")}
                        />
                    </div>
                </div>
            )}

            {/* Vehicle Form with stacked full-width layout */}
            <VehicleForm
                vehicle={isEditing ? vehicle : undefined}
                isEditing={isEditing}
                onAutoSave={isEditing ? saveNow : undefined}
                onAutoSaveDebounced={isEditing ? saveDebounced : undefined}
                prevVehicleId={prevVehicleId}
                nextVehicleId={nextVehicleId}
                autoSaveStatus={autoSaveStatus}
                autoSaveErrorMessage={errorMessage}
                inlineTransactions={
                    showTransactions ? (
                        <RelatedTransactionsTable
                            vehicleId={vehicle!.internal_id!}
                            vehicleName={`${vehicle!.make_name || ""} ${vehicle!.model_name || ""}`}
                            hideNavigationLink={true}
                        />
                    ) : undefined
                }
            />
        </div>
    )
}
