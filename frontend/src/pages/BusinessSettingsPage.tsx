import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Building, Save, Plus, ArrowLeft, Eye, EyeOff, Download, Loader2 } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { StickyFooter } from "@/components/StickyFooter"
import { VehicleImageUpload } from "@/components/vehicles/VehicleImageUpload"
import MobileDeSettingsCard from "@/components/settings/MobileDeSettingsCard"

interface Branch {
    id: number
    name: string
    address: string
    is_active: boolean
}

interface Employee {
    id: number
    username: string
    is_active: boolean
    transactions_access: boolean
    legal_entities_access: boolean
}

interface BusinessData {
    id: number
    name: string
    logo_url: string | null
    address_country: string | null
    address_city: string | null
    address_street: string | null
    address_street_number: string | null
    address_postal_code: string | null
    telephone_number: string | null
    fax_number: string | null
    email: string | null
    bank_name: string | null
    bank_bic_swift: string | null
    bank_iban: string | null
    managing_director: string | null
    tax_id: string | null
    eori_number: string | null
    ust_id_nr: string | null
    headquarters_city: string | null
    court_district: string | null
    court_registration_number: string | null
    target_annual_return: number
    target_days_on_stock: number
    branches: Branch[]
}

export default function BusinessSettingsPage() {
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const navigate = useNavigate()

    // Form state
    const [formData, setFormData] = useState<Partial<BusinessData>>({})

    // Editable branches state
    const [editableBranches, setEditableBranches] = useState<Branch[]>([])

    // New branch state
    const [newBranch, setNewBranch] = useState({ name: "", address: "" })

    // Users state
    const [editingEmployee, setEditingEmployee] = useState<Record<number, Partial<Employee & { password?: string }>>>({})
    const [showPasswords, setShowPasswords] = useState<Record<number, boolean>>({})
    const [newEmployee, setNewEmployee] = useState({ username: "", password: "" })
    const [showNewPassword, setShowNewPassword] = useState(false)
    const [saveSuccess, setSaveSuccess] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [isSaving, setIsSaving] = useState(false)

    // Logo upload state
    const [logoFile, setLogoFile] = useState<File | null>(null)

    // Export loading state
    const [exportLoading, setExportLoading] = useState(false)

    // Fetch business data
    const { data: business, isLoading, error } = useQuery<BusinessData>({
        queryKey: ["business-settings"],
        queryFn: async () => {
            const response = await api.get("/settings/business")
            return response.data
        },
    })

    // Fetch employees
    const { data: employees = [], isLoading: isLoadingUsers } = useQuery<Employee[]>({
        queryKey: ["employees"],
        queryFn: async () => {
            const response = await api.get("/settings/users")
            return response.data
        },
    })

    // Initialize form data and branches when business data is loaded
    useEffect(() => {
        if (business) {
            setFormData(business)
            setEditableBranches(business.branches)
        }
    }, [business])

    // Update business mutation
    const updateMutation = useMutation({
        mutationFn: async (data: Partial<BusinessData>) => {
            const response = await api.put("/settings/business", data)
            return response.data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["business-settings"] })
        },
    })

    // Create branch mutation
    const createBranchMutation = useMutation({
        mutationFn: async (data: { name: string; address: string }) => {
            const response = await api.post("/settings/branches", data)
            return response.data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["business-settings"] })
            setNewBranch({ name: "", address: "" })
        },
    })

    // Logo upload mutation
    const logoUploadMutation = useMutation({
        mutationFn: async (file: File) => {
            const formData = new FormData()
            formData.append("logo", file)
            const response = await api.post("/settings/business/logo", formData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                },
            })
            return response.data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["business-settings"] })
            queryClient.invalidateQueries({ queryKey: ["auth"] })
        },
    })

    // Employee mutations
    const createEmployeeMutation = useMutation({
        mutationFn: async (data: { username: string; password: string }) => {
            const response = await api.post("/settings/users", data)
            return response.data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["employees"] })
            setNewEmployee({ username: "", password: "" })
        },
    })

    // Update branch mutation
    const updateBranchMutation = useMutation({
        mutationFn: async (branch: Branch) => {
            const response = await api.put(`/settings/branches/${branch.id}`, {
                name: branch.name,
                address: branch.address,
                is_active: branch.is_active,
            })
            return response.data
        },
    })

    // Update employee mutation
    const updateEmployeeMutation = useMutation({
        mutationFn: async (employee: Partial<Employee & { password?: string }> & { id: number }) => {
            const { id, ...data } = employee
            const response = await api.put(`/settings/users/${id}`, data)
            return response.data
        },
    })

    const handleFieldChange = (field: string, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }))
    }

    const handleSave = async () => {
        setIsSaving(true)
        setSaveSuccess(false)
        setSaveError(null)
        try {
            // 1. Save business details
            await updateMutation.mutateAsync(formData)

            // 2. Save business logo if selected
            if (logoFile) {
                await logoUploadMutation.mutateAsync(logoFile)
            }

            // 3. Save modified branches
            const modifiedBranches = editableBranches.filter((eb) => {
                const original = business?.branches.find((ob) => ob.id === eb.id)
                if (!original) return false
                return (
                    original.name !== eb.name ||
                    original.address !== eb.address ||
                    original.is_active !== eb.is_active
                )
            })
            for (const branch of modifiedBranches) {
                await updateBranchMutation.mutateAsync(branch)
            }

            // 4. Save modified employees
            const employeeIds = Object.keys(editingEmployee).map(Number)
            for (const empId of employeeIds) {
                const edits = editingEmployee[empId]
                await updateEmployeeMutation.mutateAsync({
                    id: empId,
                    ...edits,
                })
            }

            // Clear editing states on success
            setEditingEmployee({})
            setSaveSuccess(true)
            setTimeout(() => setSaveSuccess(false), 5000)
            
            // Re-fetch all queries to ensure fresh UI state
            queryClient.invalidateQueries({ queryKey: ["business-settings"] })
            queryClient.invalidateQueries({ queryKey: ["employees"] })
            queryClient.invalidateQueries({ queryKey: ["choices"] })
        } catch (error: any) {
            console.error("Failed to save changes:", error)
            setSaveError(error.response?.data?.detail || "Failed to save changes. Please try again.")
        } finally {
            setIsSaving(false)
        }
    }

    const handleCreateBranch = () => {
        if (newBranch.name.trim()) {
            createBranchMutation.mutate(newBranch)
        }
    }

    // Handle editable branch field changes
    const handleBranchFieldChange = (branchId: number, field: keyof Branch, value: string | boolean) => {
        setEditableBranches((prev) =>
            prev.map((branch) =>
                branch.id === branchId ? { ...branch, [field]: value } : branch
            )
        )
    }

    // Handle employee changes
    const handleEmployeeFieldChange = (employeeId: number, field: string, value: string | boolean) => {
        setEditingEmployee((prev) => ({
            ...prev,
            [employeeId]: {
                ...prev[employeeId],
                [field]: value,
            },
        }))
    }

    const handleCreateEmployee = () => {
        if (newEmployee.username.trim() && newEmployee.password.trim()) {
            createEmployeeMutation.mutate(newEmployee)
        }
    }

    const handleDownloadExport = async () => {
        setExportLoading(true)
        setSaveError(null)
        try {
            const response = await api.get("/settings/business/export-data", {
                responseType: "blob",
                timeout: 120000,
            })
            
            // Get content-disposition header if available to extract filename
            const contentDisposition = response.headers["content-disposition"]
            let filename = `drivebase_backup_${business?.name?.toLowerCase().replace(/\s+/g, "_") || "business"}.zip`
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="?([^";]+)"?/)
                if (match && match[1]) {
                    filename = match[1]
                }
            }
            
            const blob = new Blob([response.data], { type: "application/zip" })
            const url = window.URL.createObjectURL(blob)
            
            const link = document.createElement("a")
            link.href = url
            link.setAttribute("download", filename)
            document.body.appendChild(link)
            link.click()
            // Cleanup
            document.body.removeChild(link)
            setTimeout(() => {
                window.URL.revokeObjectURL(url)
            }, 10000)
        } catch (error) {
            console.error("Failed to download export:", error)
            setSaveError(t("businessSettings.exportError", "Failed to download export. Please try again."))
        } finally {
            setExportLoading(false)
        }
    }

    if (isLoading || isLoadingUsers) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        )
    }

    if (error || !business) {
        return (
            <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4">
                <p className="text-sm text-destructive">{t("businessSettings.failedToLoad", "Failed to load business settings. Please try again.")}</p>
            </div>
        )
    }

    const inputClass = "h-8 w-full rounded-md border border-gray-200 dark:border-border bg-[#F3F3F3] dark:bg-secondary/40 px-2.5 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"

    return (
        <div className="space-y-3 pb-24 p-3 md:p-4">
            {/* Page Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-border pb-2">
                <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
                        <Building className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-base font-semibold tracking-tight text-gray-900 dark:text-foreground">{t("businessSettings.title", "Business Settings")}</h1>
                    </div>
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadExport}
                    disabled={exportLoading}
                    className="h-7.5 px-2.5 text-xs gap-1.5"
                >
                    {exportLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    ) : (
                        <Download className="h-3.5 w-3.5" />
                    )}
                    {exportLoading ? t("businessSettings.preparingExport", "Preparing Export...") : t("businessSettings.exportBusinessData", "Export Business Data")}
                </Button>
            </div>

            {saveSuccess && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                    <p className="text-xs text-[#318d6c] font-medium">{t("businessSettings.savedSuccessfully", "All settings and changes saved successfully!")}</p>
                </div>
            )}
            {saveError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3">
                    <p className="text-xs text-[#d23a69] font-medium">{saveError}</p>
                </div>
            )}

            {/* Business Details Form */}
            <div className="rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card shadow-xs">
                <div className="p-4 space-y-4">
                    {/* Business Logo & Name Section */}
                    <div className="flex flex-col md:flex-row items-center gap-4">
                        <VehicleImageUpload
                            label={t("businessSettings.businessLogo", "Business Logo")}
                            imageUrl={business.logo_url}
                            selectedFile={logoFile}
                            onFileChange={(file) => setLogoFile(file)}
                            className="shrink-0 w-full sm:w-auto"
                        />
                        <div className="w-full md:w-1/2 space-y-1">
                            <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                                {t("businessSettings.businessName", "Business Name")} <span className="text-destructive">*</span>
                            </label>
                            <input
                                type="text"
                                value={formData.name || ""}
                                onChange={(e) => handleFieldChange("name", e.target.value)}
                                className={inputClass}
                            />
                        </div>
                    </div>

                    {/* Address Section */}
                    <div className="border-t border-gray-100 dark:border-border pt-3">
                        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2 border-b border-gray-100 dark:border-border pb-1">{t("businessSettings.address", "Address")}</h3>
                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-5">
                            <div>
                                <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-0.5">{t("businessSettings.country", "Country")}</label>
                                <input type="text" value={formData.address_country || ""} onChange={(e) => handleFieldChange("address_country", e.target.value)} className={inputClass} />
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-0.5">{t("businessSettings.city", "City")}</label>
                                <input type="text" value={formData.address_city || ""} onChange={(e) => handleFieldChange("address_city", e.target.value)} className={inputClass} />
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-0.5">{t("businessSettings.street", "Street")}</label>
                                <input type="text" value={formData.address_street || ""} onChange={(e) => handleFieldChange("address_street", e.target.value)} className={inputClass} />
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-0.5">{t("businessSettings.streetNumber", "Street Number")}</label>
                                <input type="text" value={formData.address_street_number || ""} onChange={(e) => handleFieldChange("address_street_number", e.target.value)} className={inputClass} />
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-0.5">{t("businessSettings.postalCode", "Postal Code")}</label>
                                <input type="text" value={formData.address_postal_code || ""} onChange={(e) => handleFieldChange("address_postal_code", e.target.value)} className={inputClass} />
                            </div>
                        </div>
                    </div>

                    {/* Preferences Section */}
                    <div className="border-t border-border pt-6">
                        <h3 className="text-sm font-medium text-muted-foreground mb-4">{t("businessSettings.financialPreferences", "Financial Preferences")}</h3>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1.5">{t("businessSettings.targetProfitMargin", "Target Profit Margin (%)")}</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.target_annual_return ?? 10.00}
                                    onChange={(e) => handleFieldChange("target_annual_return", e.target.value)}
                                    className={inputClass}
                                />
                                <p className="mt-1 text-xs text-muted-foreground">{t("businessSettings.targetProfitMarginDesc", "Target profit margin used to calculate break-even sale price for each vehicle")}</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1.5">{t("businessSettings.targetDaysOnStock", "Target Days on Stock")}</label>
                                <input
                                    type="number"
                                    step="1"
                                    value={formData.target_days_on_stock ?? 45}
                                    onChange={(e) => handleFieldChange("target_days_on_stock", e.target.value)}
                                    className={inputClass}
                                />
                                <p className="mt-1 text-xs text-muted-foreground">{t("businessSettings.targetDaysOnStockDesc", "Threshold for urgency indicators")}</p>
                            </div>
                        </div>
                    </div>

                    {/* Contact & Bank Details Side-by-Side Section */}
                    <div className="border-t border-border pt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <div>
                            <h3 className="text-sm font-medium text-muted-foreground mb-4">{t("businessSettings.contact", "Contact")}</h3>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1.5">{t("businessSettings.telephoneNo", "Telephone No")}</label>
                                    <input type="text" value={formData.telephone_number || ""} onChange={(e) => handleFieldChange("telephone_number", e.target.value)} className={inputClass} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1.5">{t("businessSettings.faxNumber", "Fax Number")}</label>
                                    <input type="text" value={formData.fax_number || ""} onChange={(e) => handleFieldChange("fax_number", e.target.value)} className={inputClass} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1.5">{t("businessSettings.email", "Email")}</label>
                                    <input type="email" value={formData.email || ""} onChange={(e) => handleFieldChange("email", e.target.value)} className={inputClass} />
                                </div>
                            </div>
                        </div>
                        <div>
                            <h3 className="text-sm font-medium text-muted-foreground mb-4">{t("businessSettings.bankDetails", "Bank Details")}</h3>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1.5">{t("businessSettings.bankName", "Bank Name")}</label>
                                    <input type="text" value={formData.bank_name || ""} onChange={(e) => handleFieldChange("bank_name", e.target.value)} className={inputClass} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1.5">{t("businessSettings.bicSwift", "BIC/SWIFT")}</label>
                                    <input type="text" value={formData.bank_bic_swift || ""} onChange={(e) => handleFieldChange("bank_bic_swift", e.target.value)} className={inputClass} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1.5">{t("businessSettings.iban", "IBAN")}</label>
                                    <input type="text" value={formData.bank_iban || ""} onChange={(e) => handleFieldChange("bank_iban", e.target.value)} className={inputClass} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Company Registration Section */}
                    <div className="border-t border-border pt-6 space-y-4">
                        <h3 className="text-sm font-medium text-muted-foreground mb-4">{t("businessSettings.companyRegistration", "Company Registration")}</h3>
                        
                        {/* First 4 fields */}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1.5">{t("businessSettings.managingDirector", "Managing Director")}</label>
                                <input type="text" value={formData.managing_director || ""} onChange={(e) => handleFieldChange("managing_director", e.target.value)} className={inputClass} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1.5">{t("businessSettings.taxId", "Tax ID")}</label>
                                <input type="text" value={formData.tax_id || ""} onChange={(e) => handleFieldChange("tax_id", e.target.value)} className={inputClass} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1.5">{t("businessSettings.eoriNumber", "EORI Number")}</label>
                                <input type="text" value={formData.eori_number || ""} onChange={(e) => handleFieldChange("eori_number", e.target.value)} className={inputClass} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1.5">{t("businessSettings.ustIdNr", "USt-IdNr")}</label>
                                <input type="text" value={formData.ust_id_nr || ""} onChange={(e) => handleFieldChange("ust_id_nr", e.target.value)} className={inputClass} />
                            </div>
                        </div>

                        {/* Last 3 fields */}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1.5">{t("businessSettings.headquarters", "Headquarters City")}</label>
                                <input type="text" value={formData.headquarters_city || ""} onChange={(e) => handleFieldChange("headquarters_city", e.target.value)} className={inputClass} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1.5">{t("businessSettings.courtDistrict", "Court District")}</label>
                                <input type="text" value={formData.court_district || ""} onChange={(e) => handleFieldChange("court_district", e.target.value)} className={inputClass} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1.5">{t("businessSettings.courtRegistrationNumber", "Court Reg Number")}</label>
                                <input type="text" value={formData.court_registration_number || ""} onChange={(e) => handleFieldChange("court_registration_number", e.target.value)} className={inputClass} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* mobile.de Marketplace Integration Card */}
            <MobileDeSettingsCard />

            {/* Branches and Users Side-by-Side Layout */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                {/* Branches Section */}
                <div className="rounded-xl border border-border bg-card">
                    <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                        <h2 className="text-lg font-medium text-foreground">{t("businessSettings.branches", "Branches")}</h2>
                    </div>
                    <div className="p-6 overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border bg-muted/50">
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t("businessSettings.branchName", "Branch Name")}</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t("businessSettings.address", "Address")}</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t("businessSettings.status", "Status")}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {editableBranches.map((branch) => (
                                    <tr key={branch.id} className="hover:bg-muted/30">
                                        <td className="px-4 py-3">
                                            <input
                                                type="text"
                                                value={branch.name}
                                                onChange={(e) => handleBranchFieldChange(branch.id, "name", e.target.value)}
                                                className={inputClass}
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <input
                                                type="text"
                                                value={branch.address}
                                                onChange={(e) => handleBranchFieldChange(branch.id, "address", e.target.value)}
                                                className={inputClass}
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={branch.is_active}
                                                    onChange={(e) => handleBranchFieldChange(branch.id, "is_active", e.target.checked)}
                                                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                                                />
                                                <span className="text-sm text-muted-foreground">{t("businessSettings.active", "Active")}</span>
                                            </label>
                                        </td>
                                    </tr>
                                ))}
                                {editableBranches.length === 0 && (
                                    <tr>
                                        <td colSpan={3} className="px-4 py-6 text-center text-sm text-muted-foreground">
                                            {t("businessSettings.noBranchesFound", "No branches found.")}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                        
                        <div className="mt-4 pt-4 border-t border-border">
                            <h3 className="text-sm font-medium text-foreground mb-3">{t("businessSettings.addNewBranch", "Add New Branch")}</h3>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <input
                                    type="text"
                                    value={newBranch.name}
                                    onChange={(e) => setNewBranch((prev) => ({ ...prev, name: e.target.value }))}
                                    placeholder={t("businessSettings.branchNameRequired", "Branch Name *")}
                                    className={inputClass}
                                />
                                <input
                                    type="text"
                                    value={newBranch.address}
                                    onChange={(e) => setNewBranch((prev) => ({ ...prev, address: e.target.value }))}
                                    placeholder={t("businessSettings.branchAddress", "Branch Address")}
                                    className={inputClass}
                                />
                            </div>
                            <button
                                onClick={handleCreateBranch}
                                disabled={!newBranch.name.trim() || createBranchMutation.isPending}
                                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            >
                                <Plus className="h-4 w-4" /> {t("businessSettings.addBranch", "Add Branch")}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Users Section */}
                <div className="rounded-xl border border-border bg-card">
                    <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                        <h2 className="text-lg font-medium text-foreground">{t("businessSettings.users", "Users")}</h2>
                    </div>
                    <div className="p-6 overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border bg-muted/50">
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t("businessSettings.username", "Username")}</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t("businessSettings.password", "Password")}</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t("businessSettings.access", "Access")}</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t("businessSettings.status", "Status")}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {employees.map((employee) => (
                                    <tr key={employee.id} className="hover:bg-muted/30">
                                        <td className="px-4 py-3">
                                            <input
                                                type="text"
                                                defaultValue={employee.username}
                                                onChange={(e) => handleEmployeeFieldChange(employee.id, "username", e.target.value)}
                                                className={inputClass}
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="relative">
                                                <input
                                                    type={showPasswords[employee.id] ? "text" : "password"}
                                                    placeholder={t("businessSettings.newPassword", "New Password")}
                                                    onChange={(e) => handleEmployeeFieldChange(employee.id, "password", e.target.value)}
                                                    className={`${inputClass} pr-9`}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPasswords((prev) => ({ ...prev, [employee.id]: !prev[employee.id] }))}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                                >
                                                    {showPasswords[employee.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                </button>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    defaultChecked={employee.transactions_access}
                                                    onChange={(e) => handleEmployeeFieldChange(employee.id, "transactions_access", e.target.checked)}
                                                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                                                />
                                                <span className="text-sm text-muted-foreground">{t("businessSettings.transactions", "Transactions")}</span>
                                            </label>
                                        </td>
                                        <td className="px-4 py-3">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    defaultChecked={employee.is_active}
                                                    onChange={(e) => handleEmployeeFieldChange(employee.id, "is_active", e.target.checked)}
                                                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                                                />
                                                <span className="text-sm text-muted-foreground">{t("businessSettings.active", "Active")}</span>
                                            </label>
                                        </td>
                                    </tr>
                                ))}
                                {employees.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">
                                            {t("businessSettings.noUsersFound", "No users found.")}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                        
                        <div className="mt-4 pt-4 border-t border-border">
                            <h3 className="text-sm font-medium text-foreground mb-3">{t("businessSettings.addNewUser", "Add New User")}</h3>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <input
                                    type="text"
                                    value={newEmployee.username}
                                    onChange={(e) => setNewEmployee((prev) => ({ ...prev, username: e.target.value }))}
                                    placeholder={t("businessSettings.usernameRequired", "Username *")}
                                    className={inputClass}
                                />
                                <div className="relative">
                                    <input
                                        type={showNewPassword ? "text" : "password"}
                                        value={newEmployee.password}
                                        onChange={(e) => setNewEmployee((prev) => ({ ...prev, password: e.target.value }))}
                                        placeholder={t("businessSettings.passwordRequired", "Password *")}
                                        className={`${inputClass} pr-9`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowNewPassword(!showNewPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                            <button
                                onClick={handleCreateEmployee}
                                disabled={!newEmployee.username.trim() || !newEmployee.password.trim() || createEmployeeMutation.isPending}
                                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            >
                                <Plus className="h-4 w-4" /> {t("businessSettings.addUser", "Add User")}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Form Actions - Sticky Footer */}
            <StickyFooter>
                <div className="flex w-full items-center justify-between">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(-1)}
                        className="h-7 px-2.5 text-xs gap-1.5"
                    >
                        <ArrowLeft className="size-3.5" />
                        {t("common.back", "Back")}
                    </Button>

                    <Button
                        type="button"
                        size="sm"
                        onClick={handleSave}
                        disabled={isSaving}
                        className="h-7 px-3.5 text-xs gap-1.5 font-medium"
                    >
                        {isSaving ? (
                            <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                            <Save className="size-3.5" />
                        )}
                        {isSaving ? t("common.saving", "Saving...") : t("common.saveChanges", "Save Changes")}
                    </Button>
                </div>
            </StickyFooter>
        </div>
    )
}
