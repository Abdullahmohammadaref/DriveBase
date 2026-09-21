import { createContext, useContext } from "react"

export interface SidebarLayoutContextType {
    sidebarCollapsed: boolean
    setSidebarCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void
    toggleSidebar: () => void
}

export const SidebarLayoutContext = createContext<SidebarLayoutContextType>({
    sidebarCollapsed: false,
    setSidebarCollapsed: () => {},
    toggleSidebar: () => {},
})

export function useSidebarLayout() {
    return useContext(SidebarLayoutContext)
}
