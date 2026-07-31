interface ClerkErrorDetail {
  code?: string;
  longMessage?: string;
  message?: string;
}

interface ClerkErrorLike {
  errors?: ClerkErrorDetail[];
  longMessage?: string;
  message?: string;
}

export function normalizeEmailAddress(value: string) {
  return value.trim().toLowerCase();
}

export function isValidEmailAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function getClerkErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (!error || typeof error !== "object") return fallback;

  const clerkError = error as ClerkErrorLike;
  const firstError = Array.isArray(clerkError.errors)
    ? clerkError.errors[0]
    : undefined;

  return (
    firstError?.longMessage ||
    firstError?.message ||
    clerkError.longMessage ||
    clerkError.message ||
    fallback
  );
}
