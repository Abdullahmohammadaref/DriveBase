import { cn } from "@/lib/utils"

interface StickyFooterProps {
    children: React.ReactNode
    className?: string
}

export function StickyFooter({ children, className }: StickyFooterProps) {
    return (
        <footer
            className={cn(
                "fixed bottom-0 right-0 z-40 flex h-10 items-center justify-between border-t border-border bg-background px-4 py-1.5 transition-all duration-300",
                "left-0 md:left-52",
                className
            )}
        >
            {children}
        </footer>
    )
}
