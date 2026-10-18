import { Input } from "@/components/ui/input"
import { useState, useEffect } from "react"

interface PerPageInputProps {
    value: number
    onChange: (value: number) => void
    label?: string
    total?: number
}

export function PerPageInput({ value, onChange, label = "per page", total }: PerPageInputProps) {
    const [isFocused, setIsFocused] = useState(false)

    // When total is less than the user's preference, display total (or 0 if total is 0)
    const effectiveDisplay = typeof total === "number" && total < value ? Math.max(0, total) : value
    const [inputValue, setInputValue] = useState(String(effectiveDisplay))

    // Keep input in sync when effectiveDisplay changes (e.g. filter applied/removed or preference changed)
    useEffect(() => {
        if (!isFocused) {
            setInputValue(String(effectiveDisplay))
        }
    }, [effectiveDisplay, isFocused])

    const commit = () => {
        setIsFocused(false)
        const num = parseInt(inputValue, 10)
        
        // If empty, NaN, or non-positive
        if (isNaN(num) || num < 1) {
            setInputValue(String(effectiveDisplay))
            return
        }

        // If the value matches the automatic clamped display, the user did not change their preference
        if (num === effectiveDisplay && effectiveDisplay !== value) {
            setInputValue(String(effectiveDisplay))
            return
        }

        const clamped = Math.min(10000, Math.max(1, num))
        if (clamped !== value) {
            onChange(clamped)
        } else {
            setInputValue(String(effectiveDisplay))
        }
    }

    return (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Input
                type="number"
                value={inputValue}
                onFocus={(e) => {
                    setIsFocused(true)
                    e.target.select()
                }}
                onChange={(e) => setInputValue(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.preventDefault()
                        commit()
                    }
                }}
                className="h-7 min-w-[3.5rem] w-auto max-w-[5.5rem] text-center px-1.5 text-sm font-medium text-foreground"
            />
            {label ? <span>{label}</span> : null}
        </div>
    )
}
