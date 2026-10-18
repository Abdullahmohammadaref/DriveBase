import { z } from "zod"

/**
 * Zod validation schemas matching Django API schemas
 * Using Zod 4 syntax (message instead of required_error)
 */

// =============================================================================
// Vehicle Validation Schemas
// =============================================================================

/**
 * Schema for creating a new vehicle
 * Matches the VehicleCreate pydantic schema from the backend
 */
export const getVehicleCreateSchema = (
    requiresDoors: boolean = true,
    keineDoorId?: number,
    requiresMakeAndBody: boolean = true
) => {
    const base = z.object({
        // Branch & Type
        branch_id: z.number({ message: "Branch is required" }),
        vehicle_type_id: z.number({ message: "Vehicle type is required" }),
        body_type_id: requiresMakeAndBody
            ? z.preprocess(
                (val) => (val === "" || val === null || val === 0 || Number.isNaN(val) ? undefined : val),
                z.number({ message: "Body type is required" })
            )
            : z.preprocess(
                (val) => (val === "" || val === null || val === 0 || Number.isNaN(val) ? undefined : val),
                z.number().optional().nullable()
            ),

        // Vehicle Details
        make_id: requiresMakeAndBody
            ? z.preprocess(
                (val) => (val === "" || val === null || val === 0 || Number.isNaN(val) ? undefined : val),
                z.number({ message: "Make is required" })
            )
            : z.preprocess(
                (val) => (val === "" || val === null || val === 0 || Number.isNaN(val) ? undefined : val),
                z.number().optional().nullable()
            ),
        model_id: z.preprocess(
            (val) => (val === "" || val === null || val === 0 || Number.isNaN(val) ? undefined : val),
            z.number().optional().nullable()
        ),
        color_id: z.number({ message: "Color is required" }),
        doors_id: z.preprocess(
            (val) => (val === "" || val === null || val === 0 || Number.isNaN(val) ? undefined : val),
            z.number().optional().nullable()
        ),
        fuel_type_id: z.number({ message: "Fuel type is required" }),
        damage_type_id: z.number({ message: "Damage type is required" }),

        // Technical Specs
        power_kw: z.number().min(1, "Power (KW) must be at least 1"),
        first_registration_date: z.string().optional().nullable(),
        year_of_construction: z.number()
            .min(1900, "Year must be at least 1900")
            .max(new Date().getFullYear() + 2, "Year cannot be in the future"),
        kilometer: z.number().min(0, "Kilometer must be positive"),

        // Identification
        chassis_number: z.string()
            .min(1, "Chassis number is required")
            .max(17, "Chassis number must be at most 17 characters")
            .regex(/^[A-Z0-9]+$/i, "Chassis number can only contain letters and numbers"),
        motor_vehicle_registration_number: z.string().optional().nullable(),
        official_license_plate: z.string().optional().nullable(),

        // Buy Details
        buy_price: z.number().min(0, "Buy price must be positive"),
        buy_tax_id: z.number().optional().nullable(),
        buy_date: z.string().min(1, "Buy date is required"),
        buy_delivery_collection_date: z.string().optional().nullable(),
        buy_payment_method_id: z.number({ message: "Payment method is required" }),
        seller_id: z.number({ message: "Seller is required" }),

        // Optional fields
        description: z.string().optional().nullable(),
        internal_comments: z.string().optional().nullable(),
        key_number_id: z.number({ message: "Key number is required" }),
    })

    if (!requiresDoors) {
        return base
    }

    return base.superRefine((data, ctx) => {
        if (!data.doors_id || (keineDoorId && data.doors_id === keineDoorId)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Doors selection is required for this vehicle class",
                path: ["doors_id"],
            })
        }
    })
}

export const vehicleCreateSchema = getVehicleCreateSchema(true)

// Helper to transform empty/NaN values to undefined for optional number fields
const optionalNumber = z.preprocess(
    (val) => (val === "" || val === null || Number.isNaN(val) ? undefined : val),
    z.number().optional()
)

const optionalNumberWithMin = (min: number) => z.preprocess(
    (val) => (val === "" || val === null || Number.isNaN(val) ? undefined : val),
    z.number().min(min).optional()
)

/**
 * Schema for updating an existing vehicle
 * All fields are optional for PATCH updates
 */
export const vehicleUpdateSchema = z.object({
    // Status
    status: z.enum(["purchased", "ready_for_sale", "reserved", "sold", "inactive"]).optional(),

    // Branch & Type
    branch_id: optionalNumber,
    vehicle_type_id: optionalNumber,
    body_type_id: optionalNumber,

    // Vehicle Details
    make_id: optionalNumber,
    model_id: optionalNumber.nullable(),
    color_id: optionalNumber,
    doors_id: optionalNumber,
    fuel_type_id: optionalNumber,
    damage_type_id: optionalNumber,

    // Technical Specs
    power_kw: optionalNumberWithMin(1),
    first_registration_date: z.string().optional().nullable(),
    year_of_construction: z.preprocess(
        (val) => (val === "" || val === null || Number.isNaN(val) ? undefined : val),
        z.number().min(1900).max(new Date().getFullYear() + 2).optional()
    ),
    kilometer: optionalNumberWithMin(0),

    // Identification
    chassis_number: z.string().max(17).optional(),
    motor_vehicle_registration_number: z.string().optional().nullable(),
    official_license_plate: z.string().optional().nullable(),

    // Buy Details
    buy_price: optionalNumberWithMin(0),
    buy_tax_id: optionalNumber.nullable(),
    buy_date: z.string().optional(),
    buy_delivery_collection_date: z.string().optional().nullable(),
    buy_payment_method_id: optionalNumber,
    seller_id: optionalNumber,

    // Sale Details
    sale_price: optionalNumberWithMin(0).nullable(),
    sale_tax_id: optionalNumber.nullable(),
    sale_date: z.string().optional().nullable(),
    sale_delivery_collection_date: z.string().optional().nullable(),
    sale_payment_method_id: optionalNumber.nullable(),
    buyer_id: optionalNumber.nullable(),
    sale_invoice_number: z.string().optional().nullable(),

    // Optional fields
    description: z.string().optional().nullable(),
    internal_comments: z.string().optional().nullable(),
    key_number_id: optionalNumber.nullable(),
})

export function getVehicleUpdateSchema(requiresDoors: boolean = true, keineDoorId?: number) {
    if (!requiresDoors) {
        return vehicleUpdateSchema
    }
    return vehicleUpdateSchema.superRefine((data, ctx) => {
        if (keineDoorId && data.doors_id === keineDoorId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Doors selection is required for this vehicle class",
                path: ["doors_id"],
            })
        }
    })
}

// =============================================================================
// Choice Creation Schemas
// =============================================================================

export const choiceCreateSchema = z.object({
    name: z.string().min(1, "Name is required").max(100, "Name is too long"),
})

export const taxPercentageCreateSchema = z.object({
    name: z.string().min(1, "Name is required"),
    percentage: z.number().min(0, "Percentage must be positive").max(100, "Percentage cannot exceed 100"),
})

export const vehicleModelCreateSchema = z.object({
    name: z.string().min(1, "Model name is required"),
    make_id: z.number({ message: "Make is required" }),
})

export const legalEntityCreateSchema = z.object({
    name: z.string().min(1, "Name is required"),
    type: z.enum(["person", "company"]),
    address_street: z.string().optional().nullable(),
    address_street_number: z.string().optional().nullable(),
    address_postal_code: z.string().optional().nullable(),
    address_city: z.string().optional().nullable(),
    address_country: z.string().optional().nullable(),
    email: z.string().email("Invalid email").optional().nullable().or(z.literal("")),
    phone_number: z.string().optional().nullable(),
    tax_identification_number: z.string().optional().nullable(),
})

// =============================================================================
// Type Exports
// =============================================================================

export type VehicleCreateInput = z.infer<typeof vehicleCreateSchema>
export type VehicleUpdateInput = z.infer<typeof vehicleUpdateSchema>
export type ChoiceCreateInput = z.infer<typeof choiceCreateSchema>
export type TaxPercentageCreateInput = z.infer<typeof taxPercentageCreateSchema>
export type VehicleModelCreateInput = z.infer<typeof vehicleModelCreateSchema>
export type LegalEntityCreateInput = z.infer<typeof legalEntityCreateSchema>
