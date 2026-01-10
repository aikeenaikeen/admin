export function resolveBaseUrl(envValue?: string): string {
  const v = (envValue ?? "").trim().replace(/\/+$/, "");
  if (v) return v;

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  return "";
}

