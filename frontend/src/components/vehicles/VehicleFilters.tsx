import { useState, useEffect } from "react"
import { RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FilterSelect } from "@/components/ui/filter-select"
import { Separator } from "@/components/ui/separator"
import { useChoices } from "@/hooks/useVehicles"
import type { VehicleFilters } from "@/types/vehicle"

interface VehicleFiltersProps {
    filters: VehicleFilters
    onApplyFilters: (filters: VehicleFilters) => void
}

export function VehicleFiltersSidebar({
    filters,
    onApplyFilters,
}: VehicleFiltersProps) {
    const { data: choices } = useChoices()
    const [localFilters, setLocalFilters] = useState<VehicleFilters>(filters)

    useEffect(() => {
        setLocalFilters(filters)
    }, [filters])

    const handleApply = () => {
        onApplyFilters(localFilters)
    }

    const handleReset = () => {
        const resetFilters: VehicleFilters = {
            page: 1,
            per_page: filters.per_page || 20,
        }
        setLocalFilters(resetFilters)
        onApplyFilters(resetFilters)
    }

    // Update a single filter value
    const updateFilter = <K extends keyof VehicleFilters>(
        key: K,
        value: VehicleFilters[K]
    ) => {
        setLocalFilters((prev) => ({
            ...prev,
            [key]: value || undefined,
        }))
    }

    return (
        <div className="flex flex-col bg-white dark:bg-card rounded-lg border border-gray-200 dark:border-border shadow-xs overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-200 dark:border-border bg-gray-50/50 dark:bg-muted/30 flex items-center justify-between">
                <h2 className="text-[12px] font-semibold uppercase tracking-wider text-gray-700 dark:text-foreground">Filters</h2>
                <button
                    type="button"
                    onClick={handleReset}
                    className="text-[11px] font-medium text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                    <RotateCcw className="size-3" /> Reset
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4">
                {/* Quick Search Section */}
                <div className="space-y-2.5">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-muted-foreground">
                        Quick Search
                    </h3>

                    <div className="space-y-3">
                        <div className="space-y-2">
                            <Label htmlFor="vehicle_id" className="text-foreground">Vehicle ID</Label>
                            <Input
                                id="vehicle_id"
                                type="number"
                                placeholder="Enter ID..."
                                className="text-foreground placeholder:text-muted-foreground"
                                value={localFilters.vehicle_id_search ?? ""}
                                onChange={(e) =>
                                    updateFilter(
                                        "vehicle_id_search",
                                        e.target.value ? Number(e.target.value) : undefined
                                    )
                                }
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="chassis" className="text-foreground">Chassis Number (VIN)</Label>
                            <Input
                                id="chassis"
                                placeholder="Enter VIN..."
                                className="text-foreground placeholder:text-muted-foreground"
                                value={localFilters.chassis_number_search ?? ""}
                                onChange={(e) =>
                                    updateFilter("chassis_number_search", e.target.value || undefined)
                                }
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="license_plate" className="text-foreground">License Plate</Label>
                            <Input
                                id="license_plate"
                                placeholder="Enter plate..."
                                className="text-foreground placeholder:text-muted-foreground"
                                value={localFilters.official_license_plate_search ?? ""}
                                onChange={(e) =>
                                    updateFilter("official_license_plate_search", e.target.value || undefined)
                                }
                            />
                        </div>
                    </div>
                </div>

                <Separator />

                {/* Vehicle Details Section */}
                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-foreground">
                        Vehicle Details
                    </h3>

                    <div className="space-y-3">
                        <div className="space-y-2">
                            <Label className="text-foreground">Status</Label>
                            <FilterSelect
                                options={choices?.status_choices?.map((s) => ({
                                    value: s.value,
                                    label: s.label,
                                })) ?? []}
                                value={localFilters.status}
                                onChange={(value) => updateFilter("status", value)}
                                placeholder="All statuses"
                                allLabel="All statuses"
                                searchPlaceholder="Search statuses..."
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-foreground">Key Number</Label>
                            <FilterSelect
                                options={choices?.key_numbers?.map((kn) => ({
                                    value: kn.id.toString(),
                                    label: kn.name,
                                })) ?? []}
                                value={localFilters.key_number?.toString()}
                                onChange={(value) => updateFilter("key_number", value ? Number(value) : undefined)}
                                placeholder="All key numbers"
                                allLabel="All key numbers"
                                searchPlaceholder="Search key numbers..."
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-foreground">Make</Label>
                            <FilterSelect
                                options={choices?.makes?.map((mk) => ({
                                    value: mk.id.toString(),
                                    label: `#${mk.id} - ${mk.name}`,
                                })) ?? []}
                                value={localFilters.make?.toString()}
                                onChange={(value) => updateFilter("make", value ? Number(value) : undefined)}
                                placeholder="All makes"
                                allLabel="All makes"
                                searchPlaceholder="Search makes..."
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-foreground">Body Type</Label>
                            <FilterSelect
                                options={choices?.body_types?.map((bt) => ({
                                    value: bt.id.toString(),
                                    label: bt.name,
                                })) ?? []}
                                value={localFilters.body_type?.toString()}
                                onChange={(value) => updateFilter("body_type", value ? Number(value) : undefined)}
                                placeholder="All body types"
                                allLabel="All body types"
                                searchPlaceholder="Search body types..."
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-foreground">Fuel Type</Label>
                            <FilterSelect
                                options={choices?.fuel_types?.map((ft) => ({
                                    value: ft.id.toString(),
                                    label: ft.name,
                                })) ?? []}
                                value={localFilters.fuel_type?.toString()}
                                onChange={(value) => updateFilter("fuel_type", value ? Number(value) : undefined)}
                                placeholder="All fuel types"
                                allLabel="All fuel types"
                                searchPlaceholder="Search fuel types..."
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-foreground">Color</Label>
                            <FilterSelect
                                options={choices?.colors?.map((c) => ({
                                    value: c.id.toString(),
                                    label: c.name,
                                })) ?? []}
                                value={localFilters.color?.toString()}
                                onChange={(value) => updateFilter("color", value ? Number(value) : undefined)}
                                placeholder="All colors"
                                allLabel="All colors"
                                searchPlaceholder="Search colors..."
                            />
                        </div>
                    </div>
                </div>

                <Separator />

                {/* Price Range Section */}
                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-foreground">
                        Price Range
                    </h3>

                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="min_buy" className="text-foreground">Min Buy Price</Label>
                                <Input
                                    id="min_buy"
                                    type="number"
                                    placeholder="€ Min"
                                    className="text-foreground placeholder:text-muted-foreground"
                                    value={localFilters.min_buy_price ?? ""}
                                    onChange={(e) =>
                                        updateFilter(
                                            "min_buy_price",
                                            e.target.value ? Number(e.target.value) : undefined
                                        )
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="max_buy" className="text-foreground">Max Buy Price</Label>
                                <Input
                                    id="max_buy"
                                    type="number"
                                    placeholder="€ Max"
                                    className="text-foreground placeholder:text-muted-foreground"
                                    value={localFilters.max_buy_price ?? ""}
                                    onChange={(e) =>
                                        updateFilter(
                                            "max_buy_price",
                                            e.target.value ? Number(e.target.value) : undefined
                                        )
                                    }
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="min_sale" className="text-foreground">Min Sale Price</Label>
                                <Input
                                    id="min_sale"
                                    type="number"
                                    placeholder="€ Min"
                                    className="text-foreground placeholder:text-muted-foreground"
                                    value={localFilters.min_sale_price ?? ""}
                                    onChange={(e) =>
                                        updateFilter(
                                            "min_sale_price",
                                            e.target.value ? Number(e.target.value) : undefined
                                        )
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="max_sale" className="text-foreground">Max Sale Price</Label>
                                <Input
                                    id="max_sale"
                                    type="number"
                                    placeholder="€ Max"
                                    className="text-foreground placeholder:text-muted-foreground"
                                    value={localFilters.max_sale_price ?? ""}
                                    onChange={(e) =>
                                        updateFilter(
                                            "max_sale_price",
                                            e.target.value ? Number(e.target.value) : undefined
                                        )
                                    }
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <Separator />

                {/* Date Range Section */}
                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-foreground">
                        Date Range
                    </h3>

                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="min_buy_date" className="text-foreground">Buy Date From</Label>
                                <Input
                                    id="min_buy_date"
                                    type="date"
                                    className="text-foreground"
                                    value={localFilters.min_buy_date ?? ""}
                                    onChange={(e) =>
                                        updateFilter("min_buy_date", e.target.value || undefined)
                                    }
                                    onClick={(e) => { try { e.currentTarget.showPicker(); } catch (err) { } }}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="max_buy_date" className="text-foreground">Buy Date To</Label>
                                <Input
                                    id="max_buy_date"
                                    type="date"
                                    className="text-foreground"
                                    value={localFilters.max_buy_date ?? ""}
                                    onChange={(e) =>
                                        updateFilter("max_buy_date", e.target.value || undefined)
                                    }
                                    onClick={(e) => { try { e.currentTarget.showPicker(); } catch (err) { } }}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="min_sale_date" className="text-foreground">Sale Date From</Label>
                                <Input
                                    id="min_sale_date"
                                    type="date"
                                    className="text-foreground"
                                    value={localFilters.min_sale_date ?? ""}
                                    onChange={(e) =>
                                        updateFilter("min_sale_date", e.target.value || undefined)
                                    }
                                    onClick={(e) => { try { e.currentTarget.showPicker(); } catch (err) { } }}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="max_sale_date" className="text-foreground">Sale Date To</Label>
                                <Input
                                    id="max_sale_date"
                                    type="date"
                                    className="text-foreground"
                                    value={localFilters.max_sale_date ?? ""}
                                    onChange={(e) =>
                                        updateFilter("max_sale_date", e.target.value || undefined)
                                    }
                                    onClick={(e) => { try { e.currentTarget.showPicker(); } catch (err) { } }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <Separator />

                {/* Technical Specs Section */}
                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-foreground">
                        Technical Specs
                    </h3>

                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="min_year" className="text-foreground">Year From</Label>
                                <Input
                                    id="min_year"
                                    type="number"
                                    placeholder="e.g. 2018"
                                    className="text-foreground placeholder:text-muted-foreground"
                                    value={localFilters.min_year ?? ""}
                                    onChange={(e) =>
                                        updateFilter(
                                            "min_year",
                                            e.target.value ? Number(e.target.value) : undefined
                                        )
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="max_year" className="text-foreground">Year To</Label>
                                <Input
                                    id="max_year"
                                    type="number"
                                    placeholder="e.g. 2024"
                                    className="text-foreground placeholder:text-muted-foreground"
                                    value={localFilters.max_year ?? ""}
                                    onChange={(e) =>
                                        updateFilter(
                                            "max_year",
                                            e.target.value ? Number(e.target.value) : undefined
                                        )
                                    }
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="min_km" className="text-foreground">Min Kilometer</Label>
                                <Input
                                    id="min_km"
                                    type="number"
                                    placeholder="0"
                                    className="text-foreground placeholder:text-muted-foreground"
                                    value={localFilters.min_kilometer ?? ""}
                                    onChange={(e) =>
                                        updateFilter(
                                            "min_kilometer",
                                            e.target.value ? Number(e.target.value) : undefined
                                        )
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="max_km" className="text-foreground">Max Kilometer</Label>
                                <Input
                                    id="max_km"
                                    type="number"
                                    placeholder="200000"
                                    className="text-foreground placeholder:text-muted-foreground"
                                    value={localFilters.max_kilometer ?? ""}
                                    onChange={(e) =>
                                        updateFilter(
                                            "max_kilometer",
                                            e.target.value ? Number(e.target.value) : undefined
                                        )
                                    }
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-3 border-t border-gray-200 dark:border-border bg-gray-50/50 dark:bg-muted/30 flex gap-2">
                <Button variant="outline" size="sm" onClick={handleReset} className="flex-1 h-7.5 text-xs">
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    Reset
                </Button>
                <Button size="sm" onClick={handleApply} className="flex-1 h-7.5 text-xs">
                    Apply Filters
                </Button>
            </div>
        </div>
    )
}
