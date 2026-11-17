// localStorage with try/catch: private windows and blocked storage must not
// break the app.
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {}
}
