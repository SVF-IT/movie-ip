export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
  }
}

const SUPABASE_CODE_MAP: Record<string, { message: string; status: number }> = {
  "23505": { message: "A record with this value already exists.", status: 409 },
  "23503": { message: "Referenced record not found.", status: 404 },
  "23502": { message: "A required field is missing.", status: 400 },
  "22007": { message: "Invalid date format. Please check your date fields.", status: 400 },
  "22P02": { message: "Invalid value format. Please check your inputs.", status: 400 },
  "42501": { message: "You do not have permission to perform this action.", status: 403 },
  PGRST116: { message: "Record not found.", status: 404 },
};

// Friendly messages for Postgres error message substrings
const MESSAGE_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /invalid input syntax for type date/i, message: "One or more date fields contain an invalid value. Please check and try again." },
  { pattern: /invalid input syntax for type/i, message: "One or more fields contain an invalid value. Please check your inputs." },
  { pattern: /value too long for type/i, message: "One or more fields exceed the maximum allowed length." },
  { pattern: /null value in column/i, message: "A required field is missing." },
  { pattern: /duplicate key/i, message: "A record with this value already exists." },
  { pattern: /foreign key/i, message: "Referenced record not found." },
  { pattern: /permission denied/i, message: "You do not have permission to perform this action." },
  { pattern: /jwt expired/i, message: "Your session has expired. Please log in again." },
];

export function sanitizeError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const err = error as { code?: string; message?: string; status?: number };
  const code = err?.code;
  const rawMessage = err?.message ?? "";

  if (code && SUPABASE_CODE_MAP[code]) {
    const mapped = SUPABASE_CODE_MAP[code];
    return new AppError(mapped.message, mapped.status);
  }

  for (const { pattern, message } of MESSAGE_PATTERNS) {
    if (pattern.test(rawMessage)) {
      return new AppError(message, 400);
    }
  }

  // In dev, surface the raw message so developers can diagnose
  if (process.env.NODE_ENV === "development" && rawMessage) {
    console.error("[Unexpected Error]", rawMessage);
    return new AppError(`Error: ${rawMessage}`, 500);
  }

  return new AppError("An unexpected error occurred. Please try again.", 500);
}
