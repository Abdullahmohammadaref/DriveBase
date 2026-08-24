import { RotateCcw } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { FilterSelect } from "@/components/ui/filter-select"
import { useChoices } from "@/hooks/useVehicles"
import type { LegalEntityFilters } from "@/hooks/useLegalEntities"

interface LegalEntityFiltersSidebarProps {
    filters: LegalEntityFilters
    onTypeFilterChange: (value: string) => void
    onStatusFilterChange: (value: string) => void
    onCountryFilterChange: (value: number | undefined) => void
    onCityFilterChange: (value: number | undefined) => void
    onResetFilters: () => void
}

export function LegalEntityFiltersSidebar({
    filters,
    onTypeFilterChange,
    onStatusFilterChange,
    onCountryFilterChange,
    onCityFilterChange,
    onResetFilters,
}: LegalEntityFiltersSidebarProps) {
    const { t } = useTranslation()
    const { data: choicesData } = useChoices()

    return (
        <div className="flex flex-col bg-white dark:bg-card rounded-lg border border-gray-200 dark:border-border shadow-xs overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-200 dark:border-border bg-gray-50/50 dark:bg-muted/30 flex items-center justify-between">
                <h2 className="text-[12px] font-semibold uppercase tracking-wider text-gray-700 dark:text-foreground">{t("common.filters", "Filters")}</h2>
                <button
                    type="button"
                    onClick={onResetFilters}
                    className="text-[11px] font-medium text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                    <RotateCcw className="size-3" /> {t("common.reset", "Reset")}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3.5">
                <div className="space-y-2.5">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-muted-foreground">
                        {t("legalEntities.details", "Details")}
                    </h3>

                    <div className="space-y-2.5">
                        <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                                {t("legalEntities.type", "Type")}
                            </label>
                            <FilterSelect
                                options={[
                                    { value: "individual", label: t("legalEntities.individual", "Individual") },
                                    { value: "company", label: t("legalEntities.company", "Company") },
                                ]}
                                value={filters.type || undefined}
                                onChange={(value) => onTypeFilterChange(value || "all")}
                                placeholder={t("legalEntities.allTypes", "All Types")}
                                allLabel={t("legalEntities.allTypes", "All Types")}
                                searchPlaceholder={t("legalEntities.searchTypes", "Search types...")}
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                                {t("legalEntities.status", "Status")}
                            </label>
                            <FilterSelect
                                options={[
                                    { value: "active", label: t("legalEntities.active", "Active") },
                                    { value: "inactive", label: t("legalEntities.inactive", "Inactive") },
                                ]}
                                value={filters.status || undefined}
                                onChange={(value) => onStatusFilterChange(value || "all")}
                                placeholder={t("legalEntities.allStatuses", "All Statuses")}
                                allLabel={t("legalEntities.allStatuses", "All Statuses")}
                                searchPlaceholder={t("legalEntities.searchStatuses", "Search statuses...")}
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                                {t("legalEntities.country", "Country")}
                            </label>
                            <FilterSelect
                                options={choicesData?.countries?.map(c => ({ value: c.id.toString(), label: c.name })) || []}
                                value={filters.country_id?.toString() || undefined}
                                onChange={(value) => onCountryFilterChange(value ? parseInt(value, 10) : undefined)}
                                placeholder={t("legalEntities.allCountries", "All Countries")}
                                allLabel={t("legalEntities.allCountries", "All Countries")}
                                searchPlaceholder={t("common.search", "Search...")}
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                                {t("legalEntities.city", "City")}
                            </label>
                            <FilterSelect
                                options={choicesData?.cities?.filter(c => !filters.country_id || c.country_id === filters.country_id).map(c => ({ value: c.id.toString(), label: c.name })) || []}
                                value={filters.city_id?.toString() || undefined}
                                onChange={(value) => onCityFilterChange(value ? parseInt(value, 10) : undefined)}
                                placeholder={t("legalEntities.allCities", "All Cities")}
                                allLabel={t("legalEntities.allCities", "All Cities")}
                                searchPlaceholder={t("common.search", "Search...")}
                                disabled={!filters.country_id}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {(filters.type || filters.status || filters.country_id || filters.city_id) && (
                <div className="p-3 border-t border-gray-200 dark:border-border bg-gray-50/50 dark:bg-muted/30 flex gap-2">
                    <Button variant="outline" size="sm" onClick={onResetFilters} className="w-full h-7.5 text-xs text-foreground">
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        {t("common.reset", "Reset")}
                    </Button>
                </div>
            )}
        </div>
    )
}
