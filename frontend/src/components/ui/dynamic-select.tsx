import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Check, ChevronsUpDown, Plus, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import api from "@/lib/api"
import { vehicleKeys } from "@/hooks/useVehicles"
import { transactionKeys } from "@/hooks/useTransactions"

interface Choice {
    id: number
    name: string
    [key: string]: any
}

interface DynamicSelectProps {
    /** The type of choice (e.g., "manufacturer", "color") */
    choiceType: string
    /** Available options */
    options: Choice[]
    /** Currently selected value (ID) */
    value: number | null | undefined
    /** Callback when value changes */
    onChange: (value: number | null) => void
    /** Placeholder text */
    placeholder?: string
    /** Whether the field is disabled */
    disabled?: boolean
    /** Whether to show the "Add new" option */
    allowCreate?: boolean
    /** Label for the "Add new" dialog */
    createLabel?: string
    /** For vehicle_model: the parent make ID */
    parentId?: number
    /** Additional fields for tax_percentage */
    showPercentage?: boolean
    /** Allow deselecting by clicking the selected option (default: false) */
    allowDeselect?: boolean
    /** Callback when a new item is created (receives full item data including percentage) */
    onCreated?: (item: { id: number; name: string; percentage?: number }) => void
    /** Custom handler for Add new button. If provided, skips the built-in dialog */
    onAddClick?: () => void
    /** Optional styling flag to indicate error state */
    hasError?: boolean
}

export function DynamicSelect({
    choiceType,
    options,
    value,
    onChange,
    placeholder = "Select...",
    disabled = false,
    allowCreate = true,
    createLabel,
    parentId,
    showPercentage = false,
    allowDeselect = false,
    onCreated,
    onAddClick,
    hasError = false,
}: DynamicSelectProps) {
    const [open, setOpen] = useState(false)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [newName, setNewName] = useState("")
    const [newPercentage, setNewPercentage] = useState("")
    const [newCode, setNewCode] = useState("") // For currency code
    const [searchQuery, setSearchQuery] = useState("")
    const [error, setError] = useState<string | null>(null) // For duplicate/validation errors
    const [createdOptions, setCreatedOptions] = useState<Choice[]>([])

    const queryClient = useQueryClient()

    const mergedOptions = [
        ...options,
        ...createdOptions.filter((created) => !options.some((option) => option.id === created.id)),
    ]

    // Find selected option
    const selectedOption = mergedOptions.find((opt) => opt.id === value)

    // Create mutation
    const createMutation = useMutation({
        mutationFn: async (data: { name: string; percentage?: number; make_id?: number; category_id?: number; country_id?: number; code?: string }) => {
            const formData = new FormData()
            formData.append("name", data.name)
            if (data.percentage !== undefined) {
                formData.append("percentage", String(data.percentage))
            }
            if (data.make_id !== undefined) {
                formData.append("make_id", String(data.make_id))
            }
            if (data.category_id !== undefined) {
                formData.append("category_id", String(data.category_id))
            }
            if (data.country_id !== undefined) {
                formData.append("country_id", String(data.country_id))
            }
            if (data.code !== undefined) {
                formData.append("code", data.code)
            }

            // Use transactions API for transaction-related types, otherwise use choices API
            const isTransactionType = ["category", "subcategory", "method", "currency"].includes(choiceType)
            const apiPath = isTransactionType
                ? `/transactions/choices/${choiceType}`
                : `/choices/${choiceType}`

            const response = await api.post(apiPath, formData, {
                headers: { "Content-Type": "multipart/form-data" },
            })
            return response.data
        },
        onSuccess: (data) => {
            const createdItem = {
                ...data,
                id: data.id,
                name: data.name || newName.trim(),
                percentage: newPercentage ? Number(newPercentage) : data.percentage,
            }
            setCreatedOptions((previous) => [
                createdItem,
                ...previous.filter((item) => item.id !== createdItem.id),
            ])

            // Select the newly created item
            onChange(createdItem.id)

            // Notify parent of the full created item data (for immediate use before cache updates)
            // This is critical for tax_percentage where we need the percentage value immediately
            // NOTE: We use the locally known newPercentage instead of data.percentage because
            // the backend API response may not include the percentage field
            if (onCreated) {
                onCreated({
                    id: createdItem.id,
                    name: createdItem.name,
                    percentage: createdItem.percentage,
                })
            }

            // Invalidate appropriate queries based on choice type
            if (choiceType === "category" || choiceType === "method" || choiceType === "currency") {
                // These create new items in transaction choices - invalidate transaction choices
                queryClient.invalidateQueries({ queryKey: transactionKeys.choices() })
            } else if (choiceType === "subcategory" && parentId) {
                // Subcategory created - invalidate subcategories for this category
                queryClient.invalidateQueries({ queryKey: transactionKeys.subcategories(parentId.toString()) })
            } else if (choiceType === "vehicle_model" && parentId) {
                // Vehicle model created - invalidate models for this make
                queryClient.invalidateQueries({ queryKey: vehicleKeys.models(parentId) })
                queryClient.invalidateQueries({ queryKey: ["choices"] })
            } else {
                // Default: invalidate vehicle choices
                queryClient.invalidateQueries({ queryKey: ["choices"] })
            }
            queryClient.invalidateQueries({ queryKey: ["choices-management"] })

            // Close dialogs
            setDialogOpen(false)
            setOpen(false)
            setNewName("")
            setNewPercentage("")
            setNewCode("")
            setError(null)
        },
        onError: (err: unknown) => {
            // Extract error message from axios error response
            const axiosError = err as { response?: { data?: { message?: string } } }
            const message = axiosError?.response?.data?.message
            if (message) {
                setError(message)
            } else {
                setError(`${newName} already exists.`)
            }
        },
    })

    const handleCreate = () => {

        if (choiceType === "key_number") {
            const val = Number(newName.trim())
            if (!Number.isInteger(val) || val <= 0) {
                setError("Key number must be a positive integer without zero.")
                return
            }
        }

        if (!newName.trim()) return
        // Currency requires code
        if (choiceType === "currency" && !newCode.trim()) return

        const data: { name: string; percentage?: number; make_id?: number; category_id?: number; country_id?: number; code?: string } = {
            name: newName.trim(),
        }

        if (showPercentage && newPercentage) {
            data.percentage = Number(newPercentage)
        }

        // Handle parent ID based on choice type
        if (choiceType === "vehicle_model" && parentId) {
            data.make_id = parentId
        } else if (choiceType === "subcategory" && parentId) {
            data.category_id = parentId
        } else if (choiceType === "city" && parentId) {
            data.country_id = parentId
        }

        // Currency requires code
        if (choiceType === "currency" && newCode.trim()) {
            data.code = newCode.trim().toUpperCase()
        }

        createMutation.mutate(data)
    }

    // Filter options based on search
    const filteredOptions = searchQuery
        ? mergedOptions.filter((opt) =>
            opt.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : mergedOptions

    return (
        <>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className={cn(
                            "w-full justify-between text-gray-800 dark:text-foreground font-normal text-xs h-8 px-2.5 bg-[#F3F3F3] dark:bg-secondary hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-200/60 dark:hover:bg-secondary/80 focus:bg-white dark:focus:bg-background focus:border-gray-400 border-gray-200 dark:border-border",
                            hasError && "border-destructive focus-visible:ring-destructive"
                        )}
                        disabled={disabled}
                    >
                        <span className="truncate text-left">
                            {selectedOption ? selectedOption.name : placeholder}
                        </span>
                        <ChevronsUpDown className="ml-1 size-3.5 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <div className="p-1.5 border-b border-border">
                        <Input
                            placeholder={`Search ${createLabel || choiceType}...`}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-7 text-xs text-foreground placeholder:text-muted-foreground"
                        />
                    </div>
                    <div className="max-h-[260px] overflow-y-auto overflow-x-hidden p-1">
                        {filteredOptions.length === 0 ? (
                            <div className="p-2 text-xs text-muted-foreground">
                                {allowCreate && searchQuery ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setNewName(searchQuery)
                                            setDialogOpen(true)
                                        }}
                                        className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs md:text-sm text-foreground hover:bg-accent cursor-pointer transition-colors"
                                    >
                                        <Plus className="size-3.5 shrink-0" />
                                        <span>Create "{searchQuery}"</span>
                                    </button>
                                ) : (
                                    <span className="text-center block">No results found</span>
                                )}
                            </div>
                        ) : (
                            filteredOptions.map((option) => (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => {
                                        // Only deselect if allowDeselect is true AND clicking the already-selected option
                                        if (allowDeselect && option.id === value) {
                                            onChange(null)
                                        } else {
                                            onChange(option.id)
                                        }
                                        setOpen(false)
                                        setSearchQuery("")
                                    }}
                                    className={cn(
                                        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs md:text-sm text-foreground hover:bg-accent cursor-pointer text-left transition-colors",
                                        value === option.id && "bg-accent font-medium"
                                    )}
                                >
                                    <Check
                                        className={cn(
                                            "size-3.5 shrink-0",
                                            value === option.id ? "opacity-100 text-primary" : "opacity-0"
                                        )}
                                    />
                                    <span className="truncate">{option.name}</span>
                                </button>
                            ))
                        )}
                    </div>
                    {allowCreate && (
                        <div className="border-t border-border p-1">
                            <button
                                type="button"
                                onClick={() => {
                                    if (onAddClick) {
                                        setOpen(false)
                                        setSearchQuery("")
                                        onAddClick()
                                    } else {
                                        setNewName("")
                                        setNewCode("")
                                        setError(null)
                                        setDialogOpen(true)
                                    }
                                }}
                                className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs md:text-sm font-medium text-foreground hover:bg-accent cursor-pointer transition-colors"
                            >
                                <Plus className="size-3.5 shrink-0 text-muted-foreground" />
                                <span>Add new {createLabel || choiceType}</span>
                            </button>
                        </div>
                    )}
                </PopoverContent>
            </Popover>

            {/* Create Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-foreground">
                            Add New {createLabel || choiceType}
                        </DialogTitle>
                        <DialogDescription>
                            Create a new option that will be immediately available.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="name" className="text-foreground">Name</Label>
                            <Input
                                id="name"
                                value={newName}
                                onChange={(e) => {
                                    setNewName(e.target.value)
                                    setError(null) // Clear error when user types
                                }}
                                placeholder={`Enter ${createLabel || choiceType} name`}
                                className={`text-foreground ${error ? 'border-destructive' : ''}`}
                                autoFocus
                            />
                            {error && (
                                <p className="text-sm text-destructive mt-1">{error}</p>
                            )}
                        </div>

                        {/* Currency code input - only for currency type */}
                        {choiceType === "currency" && (
                            <div className="space-y-2">
                                <Label htmlFor="code" className="text-foreground">Code (e.g., EUR, USD)</Label>
                                <Input
                                    id="code"
                                    value={newCode}
                                    onChange={(e) => setNewCode(e.target.value)}
                                    placeholder="Enter currency code (max 10 chars)"
                                    className="text-foreground uppercase"
                                    maxLength={10}
                                />
                            </div>
                        )}

                        {showPercentage && (
                            <div className="space-y-2">
                                <Label htmlFor="percentage" className="text-foreground">Percentage (%)</Label>
                                <Input
                                    id="percentage"
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.01"
                                    value={newPercentage}
                                    onChange={(e) => setNewPercentage(e.target.value)}
                                    placeholder="e.g., 19"
                                    className="text-foreground"
                                />
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDialogOpen(false)}
                            className="text-foreground"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleCreate}
                            disabled={!newName.trim() || createMutation.isPending}
                        >
                            {createMutation.isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                "Create"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
