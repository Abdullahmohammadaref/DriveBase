import { useState, useMemo } from "react"
import { Link, useParams } from "react-router-dom"
import {
    useReactTable,
    getCoreRowModel,
    flexRender,
    ColumnDef,
    SortingState,
    OnChangeFn,
} from "@tanstack/react-table"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    MoreHorizontal,
    Pencil,
    Trash2,
    Eye,
    FileText,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Car,
} from "lucide-react"
import { cn, formatCurrency, formatNumber, getStatusColor } from "@/lib/utils"
import type { VehicleListItem, PaginatedVehicles } from "@/types/vehicle"

interface VehicleTableProps {
    data: PaginatedVehicles | undefined
    isLoading: boolean
    sorting: SortingState
    onSortingChange: OnChangeFn<SortingState>
    onPageChange: (page: number) => void
    onDeleteClick: (vehicle: VehicleListItem) => void
}

// Vehicle thumbnail component with fallback
function VehicleThumbnail({ src, alt }: { src: string | null; alt: string }) {
    const [hasError, setHasError] = useState(false)

    if (!src || hasError) {
        return (
            <div className="flex h-12 w-16 items-center justify-center rounded-lg bg-muted">
                <Car className="h-6 w-6 text-muted-foreground" />
            </div>
        )
    }

    return (
        <img
            src={src}
            alt={alt}
            className="h-12 w-16 rounded-lg object-cover"
            onError={() => setHasError(true)}
        />
    )
}

export function VehicleTable({
    data,
    isLoading,
    sorting,
    onSortingChange,
    onPageChange,
    onDeleteClick,
}: VehicleTableProps) {
    const { business_slug, locale } = useParams<{ business_slug: string; locale?: string }>()
    const basePath = locale ? `/${business_slug}/${locale}` : `/${business_slug}`

    // Define columns
    const columns = useMemo<ColumnDef<VehicleListItem>[]>(
        () => [
            // Thumbnail column
            {
                id: "thumbnail",
                header: "",
                cell: ({ row }) => (
                    <VehicleThumbnail
                        src={row.original.image_url}
                        alt={`${row.original.make_name} ${row.original.model_name}`}
                    />
                ),
                size: 80,
            },
            {
                accessorKey: "status",
                header: () => (
                    <span className="text-muted-foreground">Status</span>
                ),
                cell: ({ row }) => {
                    const status = row.original.status
                    const statusDisplay = row.original.status_display
                    return (
                        <Badge
                            variant="outline"
                            className={cn("font-medium", getStatusColor(status))}
                        >
                            {statusDisplay || status || "-"}
                        </Badge>
                    )
                },
                size: 120,
            },
            {
                accessorKey: "internal_id",
                header: ({ column }) => (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3 h-8 text-muted-foreground hover:text-foreground"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    >
                        ID
                        {column.getIsSorted() === "asc" ? (
                            <ArrowUp className="ml-1 h-4 w-4" />
                        ) : column.getIsSorted() === "desc" ? (
                            <ArrowDown className="ml-1 h-4 w-4" />
                        ) : (
                            <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
                        )}
                    </Button>
                ),
                cell: ({ row }) => (
                    <span className="font-medium text-foreground">
                        #{row.original.internal_id}
                    </span>
                ),
                size: 80,
            },
            {
                accessorKey: "make_name",
                header: ({ column }) => (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3 h-8 text-muted-foreground hover:text-foreground"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    >
                        Make
                        {column.getIsSorted() === "asc" ? (
                            <ArrowUp className="ml-1 h-4 w-4" />
                        ) : column.getIsSorted() === "desc" ? (
                            <ArrowDown className="ml-1 h-4 w-4" />
                        ) : (
                            <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
                        )}
                    </Button>
                ),
                cell: ({ row }) => (
                    <span className="font-medium text-foreground">
                        {row.original.make_name || "-"}
                    </span>
                ),
                size: 130,
            },
            {
                accessorKey: "model_name",
                header: () => (
                    <span className="text-muted-foreground">Model</span>
                ),
                cell: ({ row }) => (
                    <div>
                        <div className="font-medium text-foreground">
                            {row.original.model_name || "-"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                            {row.original.body_type_name} • {row.original.color_name}
                        </div>
                    </div>
                ),
                size: 150,
            },
            {
                accessorKey: "chassis_number",
                header: () => (
                    <span className="text-muted-foreground">VIN / Chassis</span>
                ),
                cell: ({ row }) => (
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground">
                        {row.original.chassis_number || "-"}
                    </code>
                ),
                size: 180,
            },
            {
                accessorKey: "year_of_construction",
                header: () => (
                    <span className="text-muted-foreground">Year</span>
                ),
                cell: ({ row }) => (
                    <span className="text-foreground">
                        {row.original.year_of_construction || "-"}
                    </span>
                ),
                size: 70,
            },
            {
                accessorKey: "kilometer",
                header: () => (
                    <span className="text-muted-foreground">KM</span>
                ),
                cell: ({ row }) => (
                    <span className="text-foreground">
                        {row.original.kilometer
                            ? `${formatNumber(row.original.kilometer)} km`
                            : "-"}
                    </span>
                ),
                size: 100,
            },
            {
                accessorKey: "buy_price",
                header: ({ column }) => (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3 h-8 text-muted-foreground hover:text-foreground"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    >
                        Buy Price
                        {column.getIsSorted() === "asc" ? (
                            <ArrowUp className="ml-1 h-4 w-4" />
                        ) : column.getIsSorted() === "desc" ? (
                            <ArrowDown className="ml-1 h-4 w-4" />
                        ) : (
                            <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
                        )}
                    </Button>
                ),
                cell: ({ row }) => (
                    <span className="font-medium text-red-500 dark:text-red-400">
                        {formatCurrency(row.original.buy_price)}
                    </span>
                ),
                size: 120,
            },
            {
                accessorKey: "sale_price",
                header: ({ column }) => (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3 h-8 text-muted-foreground hover:text-foreground"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    >
                        Sale Price
                        {column.getIsSorted() === "asc" ? (
                            <ArrowUp className="ml-1 h-4 w-4" />
                        ) : column.getIsSorted() === "desc" ? (
                            <ArrowDown className="ml-1 h-4 w-4" />
                        ) : (
                            <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
                        )}
                    </Button>
                ),
                cell: ({ row }) => (
                    <span className="font-medium text-green-500 dark:text-green-400">
                        {formatCurrency(row.original.sale_price)}
                    </span>
                ),
                size: 120,
            },
            {
                id: "actions",
                header: "",
                cell: ({ row }) => (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            >
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Actions</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                                <Link
                                    to={`${basePath}/vehicles/${row.original.internal_id}`}
                                    className="flex items-center"
                                >
                                    <Eye className="mr-2 h-4 w-4" />
                                    View Details
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <Link
                                    to={`${basePath}/vehicles/${row.original.internal_id}/edit`}
                                    className="flex items-center"
                                >
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Edit
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                                <a
                                    href={`/api/vehicles/${row.original.internal_id}/pdf/sale-contract`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center"
                                >
                                    <FileText className="mr-2 h-4 w-4" />
                                    Download PDF
                                </a>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => onDeleteClick(row.original)}
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ),
                size: 50,
            },
        ],
        [onDeleteClick]
    )

    // Create table instance
    const table = useReactTable({
        data: data?.items ?? [],
        columns,
        getCoreRowModel: getCoreRowModel(),
        manualSorting: true,
        manualPagination: true,
        state: {
            sorting,
        },
        onSortingChange,
        pageCount: data?.pages ?? 0,
    })

    // Loading skeleton
    if (isLoading) {
        return (
            <div className="rounded-xl border border-border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            {columns.map((_, index) => (
                                <TableHead key={index}>
                                    <Skeleton className="h-4 w-20" />
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {Array.from({ length: 10 }).map((_, rowIndex) => (
                            <TableRow key={rowIndex}>
                                {columns.map((_, colIndex) => (
                                    <TableCell key={colIndex}>
                                        {colIndex === 0 ? (
                                            <Skeleton className="h-12 w-16 rounded-lg" />
                                        ) : (
                                            <Skeleton className="h-4 w-full" />
                                        )}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        )
    }

    // Empty state
    if (!data?.items.length) {
        return (
            <div className="rounded-xl border border-border bg-card p-12 text-center">
                <Car className="mx-auto h-12 w-12 text-muted-foreground" />
                <p className="mt-4 text-foreground">No vehicles found</p>
                <p className="mt-1 text-sm text-muted-foreground">
                    Try adjusting your filters or add a new vehicle
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Table */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <TableHead
                                        key={header.id}
                                        style={{ width: header.getSize() }}
                                    >
                                        {header.isPlaceholder
                                            ? null
                                            : flexRender(
                                                header.column.columnDef.header,
                                                header.getContext()
                                            )}
                                    </TableHead>
                                ))}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows.map((row) => (
                            <TableRow
                                key={row.id}
                                className="cursor-pointer hover:bg-muted/50"
                            >
                                {row.getVisibleCells().map((cell) => (
                                    <TableCell key={cell.id}>
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                    Showing {(data.page - 1) * data.per_page + 1} to{" "}
                    {Math.min(data.page * data.per_page, data.total)} of {data.total}{" "}
                    vehicles
                </p>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onPageChange(1)}
                        disabled={data.page <= 1}
                    >
                        <ChevronsLeft className="h-4 w-4" />
                        <span className="sr-only">First page</span>
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onPageChange(data.page - 1)}
                        disabled={data.page <= 1}
                    >
                        <ChevronLeft className="h-4 w-4" />
                        <span className="sr-only">Previous page</span>
                    </Button>

                    <span className="text-sm text-foreground">
                        Page {data.page} of {data.pages}
                    </span>

                    <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onPageChange(data.page + 1)}
                        disabled={data.page >= data.pages}
                    >
                        <ChevronRight className="h-4 w-4" />
                        <span className="sr-only">Next page</span>
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onPageChange(data.pages)}
                        disabled={data.page >= data.pages}
                    >
                        <ChevronsRight className="h-4 w-4" />
                        <span className="sr-only">Last page</span>
                    </Button>
                </div>
            </div>
        </div>
    )
}
