import { Link } from "react-router-dom"
import { Car, FileText } from "lucide-react"

import { Button } from "@/components/ui/button"
import { withMediaCacheKey, formatCurrency } from "@/lib/utils"
import {
    calcDaysOnStock,
    getDaysOnStockBgColor,
    formatPercent,
    formatDays,
} from "@/lib/vehicleFinancials"
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
 */
export function VehicleCard({
    vehicle,
    onStatusChange,
    onDelete,
    onGenerateContract,
}: VehicleCardProps) {
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

    // Compact financial indicators
    const hasBothPrices = vehicle.buy_price_net != null && vehicle.sale_price_net != null
    const buyNetNum = typeof vehicle.buy_price_net === 'string' ? parseFloat(vehicle.buy_price_net) : (vehicle.buy_price_net ?? 0)
    const saleNetNum = typeof vehicle.sale_price_net === 'string' ? parseFloat(vehicle.sale_price_net) : (vehicle.sale_price_net ?? 0)
    const totalProfit = hasBothPrices ? Math.round((saleNetNum - buyNetNum) * 100) / 100 : null
    const profitMargin = totalProfit !== null && saleNetNum !== 0
        ? Math.round((totalProfit / saleNetNum) * 100 * 10) / 10
        : null
    const daysOnStock = calcDaysOnStock(vehicle.buy_date, vehicle.sale_date)

    return (
        <article
            className="relative w-full bg-white dark:bg-card border border-gray-200 dark:border-border rounded-lg p-3 shadow-xs hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all cursor-pointer"
        >
            <Link
                to={`${vehicle.internal_id}/edit`}
                aria-label={`Edit vehicle #${vehicle.internal_id}`}
                className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />

            <div className="pointer-events-none relative z-10 grid grid-cols-12 gap-3.5 items-start">
                {/* Image */}
                <div className="col-span-12 sm:col-span-2 flex items-center justify-center self-center">
                    <div className="w-full sm:w-40 h-28 sm:h-28 rounded-md overflow-hidden bg-[#F3F3F3] dark:bg-muted flex items-center justify-center">
                        {vehicleImageUrl ? (
                            <img
                                src={vehicleImageUrl}
                                alt={`${vehicle.make_name} ${vehicle.model_name}`}
                                className="w-full h-full object-contain"
                                loading="lazy"
                            />
                        ) : (
                            <Car className="w-12 h-12 text-muted-foreground" />
                        )}
                    </div>
                </div>

                {/* Details */}
                <div className="col-span-12 sm:col-span-8 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-foreground truncate">
                                {vehicle.make_name} {vehicle.model_name}
                                {vehicle.year_of_construction && ` • ${vehicle.year_of_construction}`}
                            </h4>
                            <div className="text-sm font-bold text-gray-900 dark:text-foreground mt-0.5 truncate">
                                #{vehicle.internal_id} <span className="text-xs font-normal text-muted-foreground">• Branch: {vehicle.branch_name || "—"}</span>
                            </div>
                        </div>

                        <div className="text-right flex-shrink-0">
                            {vehicle.sale_price ? (
                                <div className="text-base font-bold font-mono text-gray-900 dark:text-foreground">
                                    {formatPrice(vehicle.sale_price)}
                                </div>
                            ) : vehicle.buy_price ? (
                                <div className="text-base font-bold font-mono text-gray-900 dark:text-foreground">
                                    {formatPrice(vehicle.buy_price)}
                                </div>
                            ) : (
                                <div className="text-xs text-muted-foreground font-mono">—</div>
                            )}
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                                Active for: {vehicle.active_for ?? 0} days
                            </div>
                            {/* Compact Financial Indicators */}
                            {hasBothPrices && (
                                <div className="flex items-center justify-end gap-2 mt-1 text-xs">
                                    {totalProfit !== null && (
                                        <span className={`font-mono font-bold ${totalProfit >= 0 ? "text-[#318d6c]" : "text-[#d23a69]"}`}>
                                            {formatCurrency(totalProfit)}
                                        </span>
                                    )}
                                    {profitMargin !== null && (
                                        <span className={`font-mono font-medium ${profitMargin >= 0 ? "text-[#318d6c]" : "text-[#d23a69]"}`}>
                                            {formatPercent(profitMargin)}
                                        </span>
                                    )}
                                    {daysOnStock !== null && (
                                        <span className="inline-flex items-center gap-0.5 font-mono text-[11px]">
                                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${getDaysOnStockBgColor(daysOnStock)}`} />
                                            <span className="text-[#d97706] font-semibold">
                                                {formatDays(daysOnStock)}
                                            </span>
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Details Grid */}
                    <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs text-gray-600 dark:text-muted-foreground">
                        {/* Column 1: Buy & Sale */}
                        <div className="space-y-1">
                            <div className="truncate">
                                <strong>Buy (Gross):</strong>{" "}
                                {formatPrice(vehicle.buy_price)}
                            </div>
                            <div className="truncate">
                                <strong>Buy date:</strong>{" "}
                                {vehicle.buy_date || "—"}
                            </div>
                            <div className="mt-2 truncate">
                                <strong>Sale (Gross):</strong>{" "}
                                {formatPrice(vehicle.sale_price)}
                            </div>
                            <div className="truncate">
                                <strong>Sale date:</strong>{" "}
                                {vehicle.sale_date || "—"}
                            </div>
                        </div>

                        {/* Column 2: Identifiers */}
                        <div className="space-y-1">
                            <div className="truncate">
                                <strong>Chassis:</strong>{" "}
                                {vehicle.chassis_number || "—"}
                            </div>
                            <div className="truncate">
                                <strong>Reg:</strong>{" "}
                                {vehicle.motor_vehicle_registration_number || "—"}
                            </div>
                            <div className="truncate">
                                <strong>Plate:</strong>{" "}
                                {vehicle.official_license_plate || "—"}
                            </div>
                        </div>

                        {/* Column 3: Specs */}
                        <div className="space-y-1">
                            <div className="truncate">
                                <strong>Damage:</strong>{" "}
                                {vehicle.damage_type_name || "—"}
                            </div>
                            <div className="truncate">
                                <strong>Year:</strong>{" "}
                                {vehicle.year_of_construction || "—"}
                            </div>
                            <div className="truncate">
                                <strong>KM:</strong>{" "}
                                {vehicle.kilometer?.toLocaleString() || "—"}
                            </div>
                        </div>

                        {/* Column 4: More Details */}
                        <div className="space-y-1">
                            <div className="truncate">
                                <strong>Type:</strong> {vehicle.vehicle_type_name || "—"}
                            </div>
                            <div className="truncate">
                                <strong>Body:</strong> {vehicle.body_type_name || "—"}
                            </div>
                            <div className="truncate">
                                <strong>Color:</strong> {vehicle.color_name || "—"}
                            </div>
                            <div className="truncate">
                                <strong>Fuel:</strong> {vehicle.fuel_type_name || "—"}
                            </div>
                            <div className="truncate">
                                <strong>Power:</strong> {vehicle.power_kw || "—"} KW
                            </div>
                        </div>
                    </div>

                    {vehicle.internal_comments && (
                        <div className="mt-2 text-sm text-muted-foreground truncate">
                            {vehicle.internal_comments}
                        </div>
                    )}
                </div>

                {/* Actions Column */}
                <div className="pointer-events-none relative z-20 col-span-12 sm:col-span-2 flex flex-col items-end gap-2">
                    {/* Vehicle Pipeline Component */}
                    <div className="pointer-events-auto w-full">
                        <VehiclePipeline
                            currentStatus={(status as VehicleStatus)}
                            canMoveTo={vehicle.can_move_to || []}
                            onStatusChange={(newStatus) => onStatusChange?.(vehicle, newStatus)}
                            orientation="vertical"
                        />
                    </div>

                    {/* Single Contract Button - always enabled to show modal */}
                    <Button
                        variant="outline"
                        size="sm"
                        className={canGenerateAnyContract
                            ? "gap-2 pointer-events-auto"
                            : "gap-2 opacity-75 pointer-events-auto"
                        }
                        onClick={(e) => {
                            e.stopPropagation()
                            onGenerateContract?.(vehicle)
                        }}
                        title="Generate documents"
                    >
                        <FileText className="h-4 w-4" />
                        Documents
                    </Button>

                    {/* Delete/Activate */}
                    <div className="w-full mt-2 flex flex-col items-end gap-2">
                        {status === "inactive" ? (
                            <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 text-white pointer-events-auto"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onStatusChange?.(vehicle, "purchased")
                                }}
                            >
                                Activate
                            </Button>
                        ) : (
                            <Button
                                size="sm"
                                variant="destructive"
                                className="pointer-events-auto"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onDelete?.(vehicle)
                                }}
                            >
                                Delete
                            </Button>
                        )}
                    </div>


                </div>
            </div>
        </article>
    )
}
