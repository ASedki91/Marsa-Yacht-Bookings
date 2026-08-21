function normalizeBaseUrl(value: string | undefined): string {
  const trimmed = value?.trim().replace(/\/+$/, "") ?? "";
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export const API_BASE_URL = normalizeBaseUrl(
  process.env.EXPO_PUBLIC_API_URL ?? process.env.EXPO_PUBLIC_DOMAIN,
);
