import { Input } from "@/components/ui/input"
import { useState, useEffect } from "react"

interface PerPageInputProps {
    value: number
    onChange: (value: number) => void
    label?: string
    total?: number
}

export function PerPageInput({ value, onChange, label = "per page", total }: PerPageInputProps) {
    const [inputValue, setInputValue] = useState(String(value))

    // Keep input in sync when value changes from external sources
    useEffect(() => {
        setInputValue(String(value))
    }, [value])

    const commit = () => {
        const num = parseInt(inputValue, 10)
        
        // If empty, NaN, or non-positive
        if (isNaN(num) || num < 1) {
            const defaultValue = 20
            setInputValue(String(defaultValue))
            onChange(defaultValue)
            return
        }

        // If the user enters a number greater than the total count, default to the total count!
        let finalValue = num
        if (typeof total === "number" && total > 0 && num > total) {
            finalValue = total
            setInputValue(String(total))
        } else if (num > 10000) {
            finalValue = 10000
            setInputValue(String(10000))
        }

        onChange(finalValue)
    }

    return (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Input
                type="number"
                value={inputValue}
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
