import { useState, useEffect, useRef, useCallback } from "react"
import { useTranslation } from "react-i18next"
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
    const { t } = useTranslation()
    const { data: choices } = useChoices()
    const [localFilters, setLocalFilters] = useState<VehicleFilters>(filters)

    // Debounce timer for text/number inputs
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Sync local state when parent resets filters externally
    useEffect(() => {
        setLocalFilters(filters)
    }, [filters])

    const handleReset = () => {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
        const resetFilters: VehicleFilters = {
            page: 1,
            per_page: filters.per_page || 20,
        }
        setLocalFilters(resetFilters)
        onApplyFilters(resetFilters)
    }

    /**
     * Update a filter field.
     * - immediate=true (selects, date pickers): fires onApplyFilters right away.
     * - immediate=false (text/number inputs): debounces 400 ms.
     */
    const updateFilter = useCallback(<K extends keyof VehicleFilters>(
        key: K,
        value: VehicleFilters[K],
        immediate = false
    ) => {
        setLocalFilters((prev) => {
            const newFilters: VehicleFilters = {
                ...prev,
                [key]: value || undefined,
                page: 1,
            }

            if (immediate) {
                onApplyFilters(newFilters)
            } else {
                if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
                debounceTimerRef.current = setTimeout(() => {
                    onApplyFilters(newFilters)
                }, 400)
            }

            return newFilters
        })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onApplyFilters])

    return (
        <div className="flex flex-col bg-white dark:bg-card rounded-lg border border-gray-200 dark:border-border shadow-xs overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-200 dark:border-border bg-gray-50/50 dark:bg-muted/30 flex items-center justify-between">
                <h2 className="text-[12px] font-semibold uppercase tracking-wider text-gray-700 dark:text-foreground">
                    {t("vehicles.filters", "Filters")}
                </h2>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReset}
                    className="h-6 px-2 text-[11px] font-medium gap-1"
                >
                    <RotateCcw className="size-3" />
                    {t("vehicles.reset", "Reset")}
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4">
                {/* Quick Search Section */}
                <div className="space-y-2.5">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-muted-foreground">
                        {t("vehicles.quickSearch", "Quick Search")}
                    </h3>

                    <div className="space-y-3">
                        <div className="space-y-2">
                            <Label htmlFor="vehicle_id" className="text-foreground">
                                {t("vehicles.vehicleId", "Vehicle ID")}
                            </Label>
                            <Input
                                id="vehicle_id"
                                type="number"
                                placeholder={t("vehicles.enterId", "Enter ID...")}
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
                            <Label htmlFor="chassis" className="text-foreground">
                                {t("vehicles.chassisNumberVin", "Chassis Number (VIN)")}
                            </Label>
                            <Input
                                id="chassis"
                                placeholder={t("vehicles.enterVin", "Enter VIN...")}
                                className="text-foreground placeholder:text-muted-foreground"
                                value={localFilters.chassis_number_search ?? ""}
                                onChange={(e) =>
                                    updateFilter("chassis_number_search", e.target.value || undefined)
                                }
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="license_plate" className="text-foreground">
                                {t("vehicles.licensePlate", "License Plate")}
                            </Label>
                            <Input
                                id="license_plate"
                                placeholder={t("vehicles.enterPlate", "Enter plate...")}
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
                        {t("vehicles.vehicleDetails", "Vehicle Details")}
                    </h3>

                    <div className="space-y-3">
                        <div className="space-y-2">
                            <Label className="text-foreground">{t("vehicles.status", "Status")}</Label>
                            <FilterSelect
                                options={choices?.status_choices?.map((s) => ({
                                    value: s.value,
                                    label: t(`nav.${s.value === "ready_for_sale" ? "readyForSale" : s.value}`, s.label),
                                })) ?? []}
                                value={localFilters.status}
                                onChange={(value) => updateFilter("status", value, true)}
                                placeholder={t("vehicles.allStatuses", "All statuses")}
                                allLabel={t("vehicles.allStatuses", "All statuses")}
                                searchPlaceholder={t("vehicles.searchStatuses", "Search statuses...")}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-foreground">{t("vehicles.keyNumber", "Key Number")}</Label>
                            <FilterSelect
                                options={choices?.key_numbers?.map((kn) => ({
                                    value: kn.id.toString(),
                                    label: kn.name,
                                })) ?? []}
                                value={localFilters.key_number?.toString()}
                                onChange={(value) => updateFilter("key_number", value ? Number(value) : undefined, true)}
                                placeholder={t("vehicles.allKeyNumbers", "All key numbers")}
                                allLabel={t("vehicles.allKeyNumbers", "All key numbers")}
                                searchPlaceholder={t("vehicles.searchKeyNumbers", "Search key numbers...")}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-foreground">{t("vehicles.make", "Make")}</Label>
                            <FilterSelect
                                options={choices?.makes?.map((mk) => ({
                                    value: mk.id.toString(),
                                    label: `#${mk.id} - ${mk.name}`,
                                })) ?? []}
                                value={localFilters.make?.toString()}
                                onChange={(value) => updateFilter("make", value ? Number(value) : undefined, true)}
                                placeholder={t("vehicles.allMakes", "All makes")}
                                allLabel={t("vehicles.allMakes", "All makes")}
                                searchPlaceholder={t("vehicles.searchMakes", "Search makes...")}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-foreground">{t("vehicles.bodyType", "Body Type")}</Label>
                            <FilterSelect
                                options={choices?.body_types?.map((bt) => ({
                                    value: bt.id.toString(),
                                    label: bt.name,
                                })) ?? []}
                                value={localFilters.body_type?.toString()}
                                onChange={(value) => updateFilter("body_type", value ? Number(value) : undefined, true)}
                                placeholder={t("vehicles.allBodyTypes", "All body types")}
                                allLabel={t("vehicles.allBodyTypes", "All body types")}
                                searchPlaceholder={t("vehicles.searchBodyTypes", "Search body types...")}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-foreground">{t("vehicles.fuelType", "Fuel Type")}</Label>
                            <FilterSelect
                                options={choices?.fuel_types?.map((ft) => ({
                                    value: ft.id.toString(),
                                    label: ft.name,
                                })) ?? []}
                                value={localFilters.fuel_type?.toString()}
                                onChange={(value) => updateFilter("fuel_type", value ? Number(value) : undefined, true)}
                                placeholder={t("vehicles.allFuelTypes", "All fuel types")}
                                allLabel={t("vehicles.allFuelTypes", "All fuel types")}
                                searchPlaceholder={t("vehicles.searchFuelTypes", "Search fuel types...")}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-foreground">{t("vehicles.color", "Color")}</Label>
                            <FilterSelect
                                options={choices?.colors?.map((c) => ({
                                    value: c.id.toString(),
                                    label: c.name,
                                })) ?? []}
                                value={localFilters.color?.toString()}
                                onChange={(value) => updateFilter("color", value ? Number(value) : undefined, true)}
                                placeholder={t("vehicles.allColors", "All colors")}
                                allLabel={t("vehicles.allColors", "All colors")}
                                searchPlaceholder={t("vehicles.searchColors", "Search colors...")}
                            />
                        </div>
                    </div>
                </div>

                <Separator />

                {/* Price Range Section */}
                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-foreground">
                        {t("vehicles.priceRange", "Price Range")}
                    </h3>

                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="min_buy" className="text-foreground">{t("vehicles.minBuyPrice", "Min Buy Price")}</Label>
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
                                <Label htmlFor="max_buy" className="text-foreground">{t("vehicles.maxBuyPrice", "Max Buy Price")}</Label>
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
                                <Label htmlFor="min_sale" className="text-foreground">{t("vehicles.minSalePrice", "Min Sale Price")}</Label>
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
                                <Label htmlFor="max_sale" className="text-foreground">{t("vehicles.maxSalePrice", "Max Sale Price")}</Label>
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
                        {t("vehicles.dateRange", "Date Range")}
                    </h3>

                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="min_buy_date" className="text-foreground">{t("vehicles.buyDateFrom", "Buy Date From")}</Label>
                                <Input
                                    id="min_buy_date"
                                    type="date"
                                    className="text-foreground"
                                    value={localFilters.min_buy_date ?? ""}
                                    onChange={(e) =>
                                        updateFilter("min_buy_date", e.target.value || undefined, true)
                                    }
                                    onClick={(e) => { try { e.currentTarget.showPicker(); } catch (err) { } }}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="max_buy_date" className="text-foreground">{t("vehicles.buyDateTo", "Buy Date To")}</Label>
                                <Input
                                    id="max_buy_date"
                                    type="date"
                                    className="text-foreground"
                                    value={localFilters.max_buy_date ?? ""}
                                    onChange={(e) =>
                                        updateFilter("max_buy_date", e.target.value || undefined, true)
                                    }
                                    onClick={(e) => { try { e.currentTarget.showPicker(); } catch (err) { } }}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="min_sale_date" className="text-foreground">{t("vehicles.saleDateFrom", "Sale Date From")}</Label>
                                <Input
                                    id="min_sale_date"
                                    type="date"
                                    className="text-foreground"
                                    value={localFilters.min_sale_date ?? ""}
                                    onChange={(e) =>
                                        updateFilter("min_sale_date", e.target.value || undefined, true)
                                    }
                                    onClick={(e) => { try { e.currentTarget.showPicker(); } catch (err) { } }}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="max_sale_date" className="text-foreground">{t("vehicles.saleDateTo", "Sale Date To")}</Label>
                                <Input
                                    id="max_sale_date"
                                    type="date"
                                    className="text-foreground"
                                    value={localFilters.max_sale_date ?? ""}
                                    onChange={(e) =>
                                        updateFilter("max_sale_date", e.target.value || undefined, true)
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
                        {t("vehicles.technicalSpecs", "Technical Specs")}
                    </h3>

                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="min_year" className="text-foreground">{t("vehicles.yearFrom", "Year From")}</Label>
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
                                <Label htmlFor="max_year" className="text-foreground">{t("vehicles.yearTo", "Year To")}</Label>
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
                                <Label htmlFor="min_km" className="text-foreground">{t("vehicles.minKilometer", "Min Kilometer")}</Label>
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
                                <Label htmlFor="max_km" className="text-foreground">{t("vehicles.maxKilometer", "Max Kilometer")}</Label>
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
        </div>
    )
}
