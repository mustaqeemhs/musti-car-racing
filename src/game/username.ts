export function normalizeUsername(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function usernameKey(value: string): string {
  return normalizeUsername(value).toLowerCase();
}

export function isValidUsername(value: string): boolean {
  const normalized = normalizeUsername(value);
  return (
    normalized.length >= 3 &&
    normalized.length <= 18 &&
    /^[a-zA-Z0-9 _-]+$/.test(normalized)
  );
}
