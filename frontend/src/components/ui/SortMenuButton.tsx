import { ArrowUpDown } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export interface SortMenuOption {
    value: string
    label: string
}

interface SortMenuButtonProps {
    options: SortMenuOption[]
    sort: string
    order: "asc" | "desc"
    onSortChange: (value: string) => void
    onOrderChange: (value: "asc" | "desc") => void
}

export function SortMenuButton({
    options,
    sort,
    order,
    onSortChange,
    onOrderChange,
}: SortMenuButtonProps) {
    const { t } = useTranslation()
    const activeOption = options.find((option) => option.value === sort)

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                    <ArrowUpDown className="h-4 w-4" />
                    {t("sort.sort", "Sort")}
                    {activeOption && (
                        <span className="hidden text-muted-foreground lg:inline">
                            {activeOption.label}
                        </span>
                    )}
                </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>{t("sort.sortBy", "Sort By")}</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={sort} onValueChange={onSortChange}>
                    {options.map((option) => (
                        <DropdownMenuRadioItem key={option.value} value={option.value}>
                            {option.label}
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>

                <DropdownMenuSeparator />

                <DropdownMenuLabel>{t("sort.order", "Order")}</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                    value={order}
                    onValueChange={(value) => onOrderChange(value as "asc" | "desc")}
                >
                    <DropdownMenuRadioItem value="desc">{t("sort.descending", "Descending")}</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="asc">{t("sort.ascending", "Ascending")}</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
