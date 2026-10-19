import { useState } from "react"
import { Check, ChevronsUpDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"

interface StringChoice {
    value: string
    label: string
}

interface SearchableSelectProps {
    /** Available options */
    options: StringChoice[]
    /** Currently selected value */
    value: string | undefined
    /** Callback when value changes */
    onChange: (value: string) => void
    /** Placeholder text */
    placeholder?: string
    /** Whether the field is disabled */
    disabled?: boolean
    /** Search placeholder text */
    searchPlaceholder?: string
    /** Whether the selection can be cleared */
    isClearable?: boolean
}

/**
 * SearchableSelect - A searchable dropdown for string-based choices
 * Similar to DynamicSelect but works with { value: string, label: string } format
 * Does not include Quick Add functionality (for that, use DynamicSelect with ID-based choices)
 */
export function SearchableSelect({
    options,
    value,
    onChange,
    placeholder = "Select...",
    disabled = false,
    searchPlaceholder = "Search...",
    isClearable = false,
}: SearchableSelectProps) {
    const [open, setOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")

    // Find selected option
    const selectedOption = options.find((opt) => opt.value === value)

    // Filter options based on search
    const filteredOptions = searchQuery
        ? options.filter((opt) =>
            opt.label.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : options

    return (
        <Popover modal={true} open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between text-gray-800 dark:text-foreground font-normal text-xs h-8 px-2.5 bg-[#F3F3F3] dark:bg-secondary hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-200/60 dark:hover:bg-secondary/80 focus:bg-white dark:focus:bg-background focus:border-gray-400 border-gray-200 dark:border-border"
                    disabled={disabled}
                >
                    <span className="truncate text-left flex-1 mr-1">
                        {selectedOption ? selectedOption.label : placeholder}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                        {isClearable && value && !disabled && (
                            <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    e.preventDefault()
                                    onChange("")
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.stopPropagation()
                                        e.preventDefault()
                                        onChange("")
                                    }
                                }}
                                className="p-0.5 rounded-full hover:bg-gray-300 dark:hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                                title="Clear selection"
                            >
                                <X className="size-3" />
                            </span>
                        )}
                        <ChevronsUpDown className="size-3.5 opacity-50" />
                    </div>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <div className="p-1.5 border-b border-border">
                    <Input
                        placeholder={searchPlaceholder}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-7 text-xs text-foreground placeholder:text-muted-foreground"
                    />
                </div>
                <div
                    className="max-h-[260px] overflow-y-auto overflow-x-hidden p-1"
                    onWheel={(e) => e.stopPropagation()}
                >
                    {filteredOptions.length === 0 ? (
                        <div className="p-2 text-xs text-muted-foreground text-center">
                            No results found
                        </div>
                    ) : (
                        filteredOptions.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => {
                                    onChange(option.value)
                                    setOpen(false)
                                    setSearchQuery("")
                                }}
                                className={cn(
                                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs md:text-sm text-foreground hover:bg-accent cursor-pointer text-left transition-colors",
                                    value === option.value && "bg-accent font-medium"
                                )}
                            >
                                <Check
                                    className={cn(
                                        "size-3.5 shrink-0",
                                        value === option.value ? "opacity-100 text-primary" : "opacity-0"
                                    )}
                                />
                                <span className="truncate">{option.label}</span>
                            </button>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}
