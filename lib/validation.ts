/** Reusable input validators for API route handlers. */

export const MAX_TITLE_LENGTH = 500;
export const MAX_DESCRIPTION_LENGTH = 5000;

export function validateString(value: unknown, fieldName: string, maxLength: number): string | null {
  if (typeof value !== "string") return `${fieldName} must be a string`;
  if (value.trim().length === 0) return `${fieldName} cannot be empty`;
  if (value.length > maxLength) return `${fieldName} exceeds ${maxLength} characters`;
  return null;
}

export function validateDate(value: unknown, fieldName: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") return `${fieldName} must be a date string or null`;
  if (isNaN(Date.parse(value))) return `${fieldName} is not a valid date`;
  return null;
}

export function safeParseInt(value: string | null, fallback: number): number {
  if (value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}
