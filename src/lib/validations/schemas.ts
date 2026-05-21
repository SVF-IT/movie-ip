import { z } from "zod";

// --- Reusable primitives ---

export const uuidSchema = z.string().uuid("Invalid ID format");

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format");

export const urlSchema = z
  .string()
  .url("Invalid URL")
  .or(z.literal(""))
  .optional();

// --- Auth ---

export const signInSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const createUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  temporaryPassword: z.string().min(8, "Password must be at least 8 characters"),
  profile: z.object({
    full_name: z.string().min(1, "Full name is required").max(200),
    employee_id: z.string().min(1, "Employee ID is required").max(50),
    role: z.enum(["admin", "editor", "legal", "viewer"]),
    department: z.string().max(200).optional(),
  }),
});

export const resetPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

// --- Movies ---

export const movieSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  source: z.enum(["home_production", "acquired"]),
  release_year: z.string().max(20).optional(),
  certification: z.string().max(50).optional(),
  language: z.string().optional(),
  synopsis: z.string().max(5000).optional(),
  duration: z.number().int().positive().optional(),
  trailer_url: urlSchema,
  poster_url: urlSchema,
});

// --- Rights ---

export const createRightSchema = z.object({
  movie_id: uuidSchema,
  platform_id: uuidSchema,
  category: z.string().max(100).optional(),
  nature: z.string().max(100).optional(),
  start_date: dateSchema.optional(),
  end_date: dateSchema.optional(),
  territory: z.string().max(500).optional(),
  remarks: z.string().max(2000).optional(),
});

// --- Pagination ---

const MAX_LIMIT = 200;

export const paginationSchema = z.object({
  limit: z
    .number()
    .int()
    .positive()
    .max(MAX_LIMIT)
    .default(50)
    .transform((v) => Math.min(v, MAX_LIMIT)),
  offset: z.number().int().min(0).default(0),
});

// --- Person ---

export const personSchema = z.object({
  name: z.string().min(1, "Name is required").max(200).transform((s) => s.trim()),
});

// --- Platform ---

export const platformSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  platform_type: z.string().max(100).optional(),
});

// --- Production House ---

export const productionHouseSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
});

// --- Profile Update ---

export const profileUpdateSchema = z.object({
  full_name: z.string().min(1).max(200).optional(),
  department: z.string().max(200).optional(),
});

// --- Import ---

export const importFileSchema = z.object({
  fileName: z.string().regex(/\.csv$/i, "Only CSV files are accepted"),
  fileSize: z.number().max(10 * 1024 * 1024, "File must be under 10MB"),
});
