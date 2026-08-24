import { useEffect, useMemo, useRef, useState } from "react"
import { Image as ImageIcon, Loader2, UploadCloud, X } from "lucide-react"
import { cn, withMediaCacheKey } from "@/lib/utils"

interface VehicleImageUploadProps {
    imageUrl?: string | null
    selectedFile?: File | null
    onFileChange: (file: File | null) => void | Promise<void>
    isUploading?: boolean
    errorMessage?: string | null
    disabled?: boolean
    className?: string
    label?: string
}

const ACCEPTED_IMAGE_EXTENSIONS = [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".bmp",
    ".tif",
    ".tiff",
    ".avif",
]

const ACCEPTED_IMAGE_INPUT = `image/*,${ACCEPTED_IMAGE_EXTENSIONS.join(",")}`
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024

function isAcceptedImageFile(file: File) {
    const lowercaseName = file.name.toLowerCase()
    return file.type.startsWith("image/") || ACCEPTED_IMAGE_EXTENSIONS.some((extension) => lowercaseName.endsWith(extension))
}

function getFileValidationError(file: File) {
    if (!isAcceptedImageFile(file)) {
        return "Please choose an image file. PDFs and other document types are not allowed."
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
        return "Image is too large. Maximum size is 10MB."
    }

    return null
}

export function VehicleImageUpload({
    imageUrl,
    selectedFile,
    onFileChange,
    isUploading = false,
    errorMessage,
    disabled = false,
    className,
    label = "Vehicle Photo",
}: VehicleImageUploadProps) {
    const inputRef = useRef<HTMLInputElement | null>(null)
    const [isDragActive, setIsDragActive] = useState(false)
    const [localError, setLocalError] = useState<string | null>(null)
    const previewUrl = useMemo(
        () => (selectedFile ? URL.createObjectURL(selectedFile) : null),
        [selectedFile]
    )

    useEffect(() => {
        return () => {
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl)
            }
        }
    }, [previewUrl])

    const displayError = localError || errorMessage
    const currentPreviewUrl = previewUrl || withMediaCacheKey(imageUrl, "vehicle-photo") || null

    const handleCandidateFile = (file: File | null) => {
        if (!file) {
            return
        }

        const validationError = getFileValidationError(file)
        if (validationError) {
            setLocalError(validationError)
            return
        }

        setLocalError(null)
        void onFileChange(file)
    }

    const openFileDialog = () => {
        if (disabled) {
            return
        }
        inputRef.current?.click()
    }

    return (
        <div className={cn("min-w-0 flex flex-col", className)}>
            <div className="mb-0.5 flex items-center justify-between">
                <span className="text-[11px] font-medium leading-[14px] text-muted-foreground truncate">
                    {label}
                </span>
                {selectedFile && (
                    <button
                        type="button"
                        className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                        onClick={() => {
                            setLocalError(null)
                            void onFileChange(null)
                        }}
                    >
                        <X className="size-3" /> Clear
                    </button>
                )}
            </div>

            <div
                role="button"
                tabIndex={disabled ? -1 : 0}
                onClick={openFileDialog}
                onKeyDown={(event) => {
                    if ((event.key === "Enter" || event.key === " ") && !disabled) {
                        event.preventDefault()
                        openFileDialog()
                    }
                }}
                onDragEnter={(event) => {
                    event.preventDefault()
                    if (!disabled) setIsDragActive(true)
                }}
                onDragOver={(event) => {
                    event.preventDefault()
                    if (!disabled) setIsDragActive(true)
                }}
                onDragLeave={(event) => {
                    event.preventDefault()
                    if (event.currentTarget === event.target) {
                        setIsDragActive(false)
                    }
                }}
                onDrop={(event) => {
                    event.preventDefault()
                    setIsDragActive(false)
                    if (disabled) return
                    handleCandidateFile(event.dataTransfer.files?.[0] ?? null)
                }}
                className={cn(
                    "flex h-[115px] min-h-[110px] items-center gap-3 rounded-md border border-gray-200 dark:border-border bg-[#F3F3F3] dark:bg-secondary/40 p-2 transition-colors",
                    !disabled && "cursor-pointer hover:bg-gray-200/60 dark:hover:bg-accent/40",
                    isDragActive && "border-primary bg-primary/5",
                    disabled && "cursor-not-allowed opacity-70"
                )}
            >
                {/* Left Thumbnail Box */}
                <div className="grid h-[96px] w-[96px] shrink-0 place-items-center overflow-hidden rounded-md border border-gray-200 dark:border-border bg-white dark:bg-background">
                    {currentPreviewUrl ? (
                        <img
                            src={currentPreviewUrl}
                            alt={`${label} preview`}
                            className="h-full w-full object-contain p-0.5"
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                            <ImageIcon className="size-4 text-muted-foreground/40" />
                            <span className="text-[8px] text-muted-foreground/60 leading-tight mt-0.5">No photo</span>
                        </div>
                    )}
                </div>

                {/* Right Upload Instructions */}
                <div className="flex min-w-0 flex-1 flex-col justify-center">
                    <button
                        type="button"
                        className="inline-flex h-5 shrink-0 items-center gap-1 self-start rounded-md border border-border bg-background px-1.5 text-[10px] font-medium text-foreground hover:bg-accent"
                    >
                        {isUploading ? (
                            <Loader2 className="size-2.5 animate-spin text-primary" />
                        ) : (
                            <UploadCloud className="size-2.5 text-muted-foreground" />
                        )}
                        <span>{isUploading ? "Uploading..." : "Click or drag"}</span>
                    </button>
                    <p className="mt-0.5 text-[9px] leading-[11px] text-muted-foreground line-clamp-1">
                        JPG, PNG, WebP, GIF, AVIF (Max 10MB)
                    </p>
                    {selectedFile && (
                        <p className="truncate text-[9px] text-foreground font-medium">
                            {selectedFile.name}
                        </p>
                    )}
                </div>
            </div>

            <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED_IMAGE_INPUT}
                className="hidden"
                disabled={disabled}
                onChange={(event) => {
                    handleCandidateFile(event.target.files?.[0] ?? null)
                    event.target.value = ""
                }}
            />

            {displayError && (
                <p className="mt-1 text-xs text-destructive">{displayError}</p>
            )}
        </div>
    )
}
