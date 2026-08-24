/**
 * Reusable Legal Entity form component.
 * Extracted from LegalEntitiesPage so it can be used both on the Legal Entities page
 * and inline from Vehicle forms (Buyer/Seller modals).
 *
 * Renders the full form: Name, Type, Tax ID (companies), Address, and Contact fields.
 */
import { useTranslation } from "react-i18next"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { DynamicSelect } from "@/components/ui/dynamic-select"
import { useChoices } from "@/hooks/useVehicles"
import type { LegalEntityCreatePayload } from "@/hooks/useLegalEntities"
import { cn } from "@/lib/utils"

export interface EntityFormProps {
    data: Partial<LegalEntityCreatePayload>
    onChange: (data: Partial<LegalEntityCreatePayload>) => void
    isNew?: boolean
    errors?: Record<string, string>
}

export function EntityForm({ data, onChange, errors }: EntityFormProps) {
    const { t } = useTranslation()
    const { data: choicesData } = useChoices()

    const handleChange = (field: keyof LegalEntityCreatePayload, value: any) => {
        onChange({ ...data, [field]: value })
    }

    return (
        <div className="space-y-4">
            {/* Basic Info */}
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                    <Label htmlFor="le-name" className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">{t("legalEntities.name", "Name")} <span className="text-destructive">*</span></Label>
                    <Input
                        id="le-name"
                        value={data.name || ""}
                        onChange={(e) => handleChange("name", e.target.value)}
                        className={cn("h-8 text-xs", errors?.name && "border-destructive focus-visible:ring-destructive")}
                        required
                    />
                    {errors?.name && <p className="text-[11px] font-medium text-destructive">{errors.name}</p>}
                </div>
                <div className="space-y-1">
                    <Label htmlFor="le-type" className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">{t("legalEntities.type", "Type")} <span className="text-destructive">*</span></Label>
                    <Select value={data.type || "individual"} onValueChange={(v) => handleChange("type", v)}>
                        <SelectTrigger id="le-type" className={cn("h-8 text-xs", errors?.type && "border-destructive focus:ring-destructive")}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="individual" className="text-xs">{t("legalEntities.individual", "Individual")}</SelectItem>
                            <SelectItem value="company" className="text-xs">{t("legalEntities.company", "Company")}</SelectItem>
                        </SelectContent>
                    </Select>
                    {errors?.type && <p className="text-[11px] font-medium text-destructive">{errors.type}</p>}
                </div>
            </div>

            {/* Tax ID (only for companies) */}
            {data.type === "company" && (
                <div className="space-y-1">
                    <Label htmlFor="le-tax_id" className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">{t("legalEntities.taxId", "Tax Identification Number")} <span className="text-destructive">*</span></Label>
                    <Input
                        id="le-tax_id"
                        value={data.tax_identification_number || ""}
                        onChange={(e) => handleChange("tax_identification_number", e.target.value)}
                        className={cn("h-8 text-xs", errors?.tax_identification_number && "border-destructive focus-visible:ring-destructive")}
                        required
                    />
                    {errors?.tax_identification_number && <p className="text-[11px] font-medium text-destructive">{errors.tax_identification_number}</p>}
                </div>
            )}

            {/* Address Section */}
            <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2 border-b border-gray-100 dark:border-border pb-1">{t("legalEntities.address", "Address")}</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                        <Label htmlFor="le-street" className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">{t("legalEntities.street", "Street")} <span className="text-red-500">*</span></Label>
                        <Input
                            id="le-street"
                            value={data.address_street || ""}
                            onChange={(e) => handleChange("address_street", e.target.value)}
                            className={cn("h-8 text-xs", errors?.address_street && "border-destructive focus-visible:ring-destructive")}
                            required
                        />
                        {errors?.address_street && <p className="text-[11px] font-medium text-destructive">{errors.address_street}</p>}
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="le-street_number" className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">{t("legalEntities.streetNumber", "Street Number")} <span className="text-red-500">*</span></Label>
                        <Input
                            id="le-street_number"
                            value={data.address_street_number || ""}
                            onChange={(e) => handleChange("address_street_number", e.target.value)}
                            className={cn("h-8 text-xs", errors?.address_street_number && "border-destructive focus-visible:ring-destructive")}
                            required
                        />
                        {errors?.address_street_number && <p className="text-[11px] font-medium text-destructive">{errors.address_street_number}</p>}
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="le-postal_code" className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">{t("legalEntities.postalCode", "Postal Code")} <span className="text-red-500">*</span></Label>
                        <Input
                            id="le-postal_code"
                            value={data.address_postal_code || ""}
                            onChange={(e) => handleChange("address_postal_code", e.target.value)}
                            className={cn("h-8 text-xs", errors?.address_postal_code && "border-destructive focus-visible:ring-destructive")}
                            required
                        />
                        {errors?.address_postal_code && <p className="text-[11px] font-medium text-destructive">{errors.address_postal_code}</p>}
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                        <Label htmlFor="le-country" className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">{t("legalEntities.country", "Country")} <span className="text-red-500">*</span></Label>
                        <DynamicSelect
                            choiceType="country"
                            options={choicesData?.countries || []}
                            value={data.address_country_id}
                            onChange={(v) => {
                                onChange({
                                    ...data,
                                    address_country_id: v,
                                    address_city_id: null
                                })
                            }}
                            placeholder={t("legalEntities.selectCountry", "Select Country")}
                            hasError={!!errors?.address_country_id}
                            allowCreate={true}
                            createLabel="Country"
                        />
                        {errors?.address_country_id && <p className="text-[11px] font-medium text-destructive">{errors.address_country_id}</p>}
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                        <Label htmlFor="le-city" className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">{t("legalEntities.city", "City")} <span className="text-red-500">*</span></Label>
                        <DynamicSelect
                            choiceType="city"
                            options={choicesData?.cities?.filter(c => c.country_id === data.address_country_id) || []}
                            value={data.address_city_id}
                            onChange={(v) => handleChange("address_city_id", v)}
                            placeholder={t("legalEntities.selectCity", "Select City")}
                            disabled={!data.address_country_id}
                            parentId={data.address_country_id || undefined}
                            hasError={!!errors?.address_city_id}
                            allowCreate={!!data.address_country_id}
                            createLabel="City"
                        />
                        {errors?.address_city_id && <p className="text-[11px] font-medium text-destructive">{errors.address_city_id}</p>}
                    </div>
                </div>
            </div>

            {/* Contact Section */}
            <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2 border-b border-gray-100 dark:border-border pb-1">{t("legalEntities.contact", "Contact Information")}</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                        <Label htmlFor="le-email" className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">{t("legalEntities.email", "Email")}</Label>
                        <Input
                            id="le-email"
                            type="email"
                            value={data.email || ""}
                            onChange={(e) => handleChange("email", e.target.value)}
                            className="h-8 text-xs"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="le-phone" className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">{t("legalEntities.phone", "Phone Number")}</Label>
                        <Input
                            id="le-phone"
                            value={data.phone_number || ""}
                            onChange={(e) => handleChange("phone_number", e.target.value)}
                            className="h-8 text-xs"
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
