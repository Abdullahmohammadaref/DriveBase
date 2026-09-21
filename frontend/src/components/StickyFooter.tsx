import { cn } from "@/lib/utils"
import { useSidebarLayout } from "@/components/layout/SidebarLayoutContext"

interface StickyFooterProps {
    children: React.ReactNode
    className?: string
}

export function StickyFooter({ children, className }: StickyFooterProps) {
    const { sidebarCollapsed } = useSidebarLayout()

    return (
        <footer
            className={cn(
                "fixed bottom-0 right-0 z-30 flex h-10 items-center justify-between border-t border-border bg-background px-4 py-1.5 transition-all duration-300",
                sidebarCollapsed ? "left-14" : "left-56",
                className
            )}
        >
            {children}
        </footer>
    )
}

