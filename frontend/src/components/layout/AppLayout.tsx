import { useState, useCallback } from "react"
import { Outlet } from "react-router-dom"
import { cn } from "@/lib/utils"
import { Sidebar } from "./Sidebar"
import { Header } from "./Header"
import { SidebarLayoutContext } from "./SidebarLayoutContext"

/**
 * Main application layout with compact sidebar, slim header, and soft neutral canvas background
 */
export function AppLayout() {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

    const toggleSidebar = useCallback(() => {
        setSidebarCollapsed((prev) => !prev)
    }, [])

    return (
        <SidebarLayoutContext.Provider
            value={{
                sidebarCollapsed,
                setSidebarCollapsed,
                toggleSidebar,
            }}
        >
            <div className="min-h-screen bg-[#F8F9FA] dark:bg-background">
                {/* Sidebar */}
                <Sidebar
                    collapsed={sidebarCollapsed}
                    onToggle={toggleSidebar}
                />

                {/* Header */}
                <Header sidebarCollapsed={sidebarCollapsed} />

                {/* Main Content */}
                <main
                    className={cn(
                        "min-h-screen pt-11 transition-all duration-300",
                        sidebarCollapsed ? "pl-14" : "pl-56"
                    )}
                >
                    <div className="px-3.5 pt-2 pb-16 max-w-full">
                        <Outlet />
                    </div>
                </main>
            </div>
        </SidebarLayoutContext.Provider>
    )
}
