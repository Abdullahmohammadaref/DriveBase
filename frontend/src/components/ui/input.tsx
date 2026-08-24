import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, onWheel, onKeyDown, ...props }: React.ComponentProps<"input">) {
  /**
   * UX Fix: Prevent accidental value changes on number inputs
   * 
   * 1. Scroll Wheel: When a number input is focused and user scrolls,
   *    the value would change instead of the page scrolling. We blur
   *    the input to prevent this.
   * 
   * 2. Arrow Keys: ArrowUp/ArrowDown increment/decrement the value,
   *    which can cause data entry errors. We block these keys.
   */

  const handleWheel = (e: React.WheelEvent<HTMLInputElement>) => {
    // Blur the input to prevent scroll from changing the value
    if (type === "number") {
      (e.target as HTMLInputElement).blur()
    }
    // Call user-provided handler if any
    onWheel?.(e)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Block arrow keys on number inputs to prevent value changes
    if (type === "number" && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault()
    }
    // Call user-provided handler if any
    onKeyDown?.(e)
  }

  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-8 w-full min-w-0 rounded-md border border-gray-200 dark:border-border bg-[#F3F3F3] dark:bg-secondary px-2.5 py-1 text-xs text-left text-gray-800 dark:text-foreground shadow-none transition-colors outline-none",
        type === "date" && "pr-7 relative",
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-foreground",
        "placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground",
        "hover:border-gray-300 dark:hover:border-gray-600 focus-visible:border-gray-400 focus-visible:bg-white dark:focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-gray-200 dark:focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive",
        className
      )}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
      {...props}
    />
  )
}

export { Input }
