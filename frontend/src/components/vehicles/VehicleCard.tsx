import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Car, FileText } from "lucide-react"

import { Button } from "@/components/ui/button"
import { withMediaCacheKey } from "@/lib/utils"
import type { VehicleListItem } from "@/types/vehicle"
import { VehiclePipeline, VehicleStatus } from "./VehiclePipeline"

interface VehicleCardProps {
    vehicle: VehicleListItem
    onStatusChange?: (vehicle: VehicleListItem, newStatus: string) => void
    onDelete?: (vehicle: VehicleListItem) => void
    onGenerateContract?: (vehicle: VehicleListItem) => void
}

/**
 * E-commerce style vehicle card component
 * - Entire card is clickable to navigate to edit page
 * - Interactive buttons use stopPropagation to prevent navigation
 * - Compact horizontal layout to maximize cards visible at once
 */
export function VehicleCard({
    vehicle,
    onStatusChange,
    onDelete,
    onGenerateContract,
}: VehicleCardProps) {
    const { t } = useTranslation()
    const status = vehicle.status || "unknown"
    const vehicleImageUrl = withMediaCacheKey(vehicle.image_url, "vehicle-photo")

    // Helper for safe price formatting
    const formatPrice = (price: number | string | null | undefined): string => {
        if (price === null || price === undefined) return "—"
        const num = typeof price === 'string' ? parseFloat(price) : price
        return isNaN(num) ? "—" : `€${num.toFixed(2)}`
    }

    // Can generate any contract?
    const canGenerateAnyContract = vehicle.can_generate_buy_contract || vehicle.can_generate_sale_contract

    return (
        <article
            className="relative w-full bg-white dark:bg-card border border-gray-200 dark:border-border rounded-lg p-3 shadow-xs hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all cursor-pointer"
        >
            <Link
                to={`${vehicle.internal_id}/edit`}
                aria-label={`Edit vehicle #${vehicle.internal_id}`}
                className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />

            {/* Top Bar: Horizontal Lifecycle Pipeline on top, Delete/Activate to its right, Documents to its right */}
            <div className="pointer-events-auto relative z-20 flex flex-wrap items-center justify-between gap-2 pb-2 mb-2.5 border-b border-gray-100 dark:border-border/60">
                <div className="flex items-center gap-1.5 overflow-x-auto min-w-0">
                    <VehiclePipeline
                        currentStatus={(status as VehicleStatus)}
                        canMoveTo={vehicle.can_move_to || []}
                        onStatusChange={(newStatus) => onStatusChange?.(vehicle, newStatus)}
                        orientation="horizontal"
                    />
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                    {status === "inactive" ? (
                        <Button
                            size="sm"
                            className="h-6 text-xs px-2.5 bg-green-600 hover:bg-green-700 text-white pointer-events-auto shadow-2xs"
                            onClick={(e) => {
                                e.stopPropagation()
                                onStatusChange?.(vehicle, "purchased")
                            }}
                            title={t("common.activate", "Activate")}
                        >
                            {t("common.activate", "Activate")}
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            variant="destructive"
                            className="h-6 text-xs px-2.5 pointer-events-auto shadow-2xs"
                            onClick={(e) => {
                                e.stopPropagation()
                                onDelete?.(vehicle)
                            }}
                            title={t("common.delete", "Delete")}
                        >
                            {t("common.delete", "Delete")}
                        </Button>
                    )}

                    <Button
                        variant="outline"
                        size="sm"
                        className={`h-6 text-xs px-2 gap-1 pointer-events-auto border-border/80 shadow-2xs ${canGenerateAnyContract ? "" : "opacity-75"}`}
                        onClick={(e) => {
                            e.stopPropagation()
                            onGenerateContract?.(vehicle)
                        }}
                        title={t("vehicles.generateDocuments", "Generate documents")}
                    >
                        <FileText className="h-3 w-3" />
                        {t("vehicles.documents", "Docs")}
                    </Button>
                </div>
            </div>

            {/* Main Content: Image + Info & Specs */}
            <div className="pointer-events-none relative z-10 flex flex-col sm:flex-row gap-3.5 items-start">
                {/* Image */}
                <div className="w-full sm:w-36 h-24 shrink-0 rounded-md overflow-hidden bg-[#F3F3F3] dark:bg-muted flex items-center justify-center self-start">
                    {vehicleImageUrl ? (
                        <img
                            src={vehicleImageUrl}
                            alt={`${vehicle.make_name} ${vehicle.model_name}`}
                            className="w-full h-full object-contain"
                            loading="lazy"
                        />
                    ) : (
                        <Car className="w-10 h-10 text-muted-foreground" />
                    )}
                </div>

                {/* Details & Specs */}
                <div className="flex-1 min-w-0 w-full">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-foreground truncate">
                                {vehicle.make_name} {vehicle.model_name}
                                {vehicle.year_of_construction && ` • ${vehicle.year_of_construction}`}
                            </h4>
                            <div className="text-xs font-bold text-gray-900 dark:text-foreground mt-0.5 truncate">
                                #{vehicle.internal_id} <span className="font-normal text-muted-foreground">• {t("vehicles.branch", "Branch")}: {vehicle.branch_name || "—"}</span>
                            </div>
                        </div>

                        <div className="text-right shrink-0">
                            {vehicle.sale_price ? (
                                <div className="text-sm font-bold font-mono text-gray-900 dark:text-foreground">
                                    {formatPrice(vehicle.sale_price)}
                                </div>
                            ) : vehicle.buy_price ? (
                                <div className="text-sm font-bold font-mono text-gray-900 dark:text-foreground">
                                    {formatPrice(vehicle.buy_price)}
                                </div>
                            ) : (
                                <div className="text-xs text-muted-foreground font-mono">—</div>
                            )}
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                                {t("vehicles.activeFor", "Active for")}: {vehicle.active_for ?? 0} {t("vehicles.days", "days")}
                            </div>
                        </div>
                    </div>

                    {/* Details Grid (5 Columns: 3 items each, last column 2 items) */}
                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-2.5 gap-y-1 text-[11px] text-gray-600 dark:text-muted-foreground">
                        {/* Column 1: Buy & Sale (3 items max) */}
                        <div className="space-y-0.5">
                            <div className="truncate">
                                <strong>{t("vehicles.buyGross", "Buy (Gross):")}</strong>{" "}
                                {formatPrice(vehicle.buy_price)}
                            </div>
                            <div className="truncate">
                                <strong>{t("vehicles.buyDate", "Buy date:")}</strong>{" "}
                                {vehicle.buy_date || "—"}
                            </div>
                            {vehicle.sale_price ? (
                                <div className="truncate">
                                    <strong>{t("vehicles.saleGross", "Sale (Gross):")}</strong>{" "}
                                    {formatPrice(vehicle.sale_price)} {vehicle.sale_date && <span className="text-[10px] text-muted-foreground">({vehicle.sale_date})</span>}
                                </div>
                            ) : vehicle.sale_date ? (
                                <div className="truncate">
                                    <strong>{t("vehicles.saleDate", "Sale date:")}</strong>{" "}
                                    {vehicle.sale_date}
                                </div>
                            ) : null}
                        </div>

                        {/* Column 2: Identifiers (3 items) */}
                        <div className="space-y-0.5">
                            <div className="truncate">
                                <strong>{t("vehicles.chassis", "Chassis:")}</strong>{" "}
                                {vehicle.chassis_number || "—"}
                            </div>
                            <div className="truncate">
                                <strong>{t("vehicles.regDoc", "Reg:")}</strong>{" "}
                                {vehicle.motor_vehicle_registration_number || "—"}
                            </div>
                            <div className="truncate">
                                <strong>{t("vehicles.plate", "Plate:")}</strong>{" "}
                                {vehicle.official_license_plate || "—"}
                            </div>
                        </div>

                        {/* Column 3: Specs (3 items) */}
                        <div className="space-y-0.5">
                            <div className="truncate">
                                <strong>{t("vehicles.damage", "Damage:")}</strong>{" "}
                                {vehicle.damage_type_name || "—"}
                            </div>
                            <div className="truncate">
                                <strong>{t("vehicles.year", "Year:")}</strong>{" "}
                                {vehicle.year_of_construction || "—"}
                            </div>
                            <div className="truncate">
                                <strong>{t("vehicles.km", "KM:")}</strong>{" "}
                                {vehicle.kilometer?.toLocaleString() || "—"}
                            </div>
                        </div>

                        {/* Column 4: Characteristics (3 items) */}
                        <div className="space-y-0.5">
                            <div className="truncate">
                                <strong>{t("vehicles.type", "Type:")}</strong> {vehicle.vehicle_type_name || "—"}
                            </div>
                            <div className="truncate">
                                <strong>{t("vehicles.body", "Body:")}</strong> {vehicle.body_type_name || "—"}
                            </div>
                            <div className="truncate">
                                <strong>{t("vehicles.color", "Color:")}</strong> {vehicle.color_name || "—"}
                            </div>
                        </div>

                        {/* Column 5: Engine & Power (2 items) */}
                        <div className="space-y-0.5">
                            <div className="truncate">
                                <strong>{t("vehicles.fuel", "Fuel:")}</strong> {vehicle.fuel_type_name || "—"}
                            </div>
                            <div className="truncate">
                                <strong>{t("vehicles.power", "Power:")}</strong> {vehicle.power_kw ? `${vehicle.power_kw} KW` : "—"}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </article>
    )
}
