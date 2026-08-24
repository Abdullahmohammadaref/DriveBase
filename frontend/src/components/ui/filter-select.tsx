import { useState } from "react"
import { Check, ChevronsUpDown, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"

interface FilterOption {
    value: string
    label: string
}

interface FilterSelectProps {
    /** Available options */
    options: FilterOption[]
    /** Currently selected value */
    value: string | undefined
    /** Callback when value changes */
    onChange: (value: string | undefined) => void
    /** Placeholder text when nothing is selected */
    placeholder?: string
    /** Whether the field is disabled */
    disabled?: boolean
    /** Search placeholder text */
    searchPlaceholder?: string
    /** Label for the "All" option (clears filter) */
    allLabel?: string
    /** Additional className for the trigger button */
    className?: string
}

/**
 * FilterSelect - A searchable dropdown for filter panels.
 * Includes an "All" option to clear the filter, search functionality,
 * and a scrollable list with max-height.
 */
export function FilterSelect({
    options,
    value,
    onChange,
    placeholder = "Select...",
    disabled = false,
    searchPlaceholder = "Search...",
    allLabel = "All",
    className,
}: FilterSelectProps) {
    const [open, setOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")

    // Find selected option label
    const selectedOption = options.find((opt) => opt.value === value)

    // Filter options based on search (always include "All" at the top)
    const filteredOptions = searchQuery
        ? options.filter((opt) =>
            opt.label.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : options

    const handleSelect = (optionValue: string | undefined) => {
        onChange(optionValue)
        setOpen(false)
        setSearchQuery("")
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn(
                        "w-full justify-between text-foreground font-normal text-xs md:text-sm h-8 px-2.5",
                        className
                    )}
                    disabled={disabled}
                >
                    <span className="truncate text-left">
                        {selectedOption ? selectedOption.label : placeholder}
                    </span>
                    <ChevronsUpDown className="ml-1 size-3.5 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                {/* Search Input */}
                <div className="p-1.5 border-b border-border">
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                        <Input
                            placeholder={searchPlaceholder}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-7 pl-7 text-xs text-foreground placeholder:text-muted-foreground"
                        />
                    </div>
                </div>

                {/* Options List with Scroll */}
                <div
                    className="max-h-[260px] overflow-y-auto overflow-x-hidden p-1"
                    onWheel={(e) => {
                        // Prevent the popover from closing when scrolling
                        e.stopPropagation()
                    }}
                >
                    {/* "All" option - always visible when no search or matches "all" */}
                    {(!searchQuery || allLabel.toLowerCase().includes(searchQuery.toLowerCase())) && (
                        <button
                            type="button"
                            onClick={() => handleSelect(undefined)}
                            className={cn(
                                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs md:text-sm text-foreground hover:bg-accent cursor-pointer text-left transition-colors",
                                value === undefined && "bg-accent font-medium"
                            )}
                        >
                            <Check
                                className={cn(
                                    "size-3.5 shrink-0",
                                    value === undefined ? "opacity-100 text-primary" : "opacity-0"
                                )}
                            />
                            <span className="truncate">{allLabel}</span>
                        </button>
                    )}

                    {/* Filtered Options */}
                    {filteredOptions.length === 0 && searchQuery ? (
                        <div className="p-2 text-xs text-muted-foreground text-center">
                            No results found
                        </div>
                    ) : (
                        filteredOptions.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => handleSelect(option.value)}
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
