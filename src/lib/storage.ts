/**
 * Defensive localStorage helpers. Any access can throw (private browsing, blocked
 * site data, a full quota), so every call is guarded and degrades to "nothing stored".
 * Browser-only: call from event handlers, effects or external-store callbacks.
 */

function getStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readStorage(key: string): string | null {
  try {
    return getStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): boolean {
  try {
    const storage = getStorage();
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeStorage(key: string): void {
  try {
    getStorage()?.removeItem(key);
  } catch {
    // Storage is unavailable, so there is nothing to remove.
  }
}

export interface StoredValue<T> {
  /** Client snapshot. Keeps the same reference until the value changes. */
  get: () => T;
  /** Server and hydration snapshot: always the fallback, so markup matches. */
  getServer: () => T;
  set: (update: T | ((current: T) => T)) => void;
  /** Fires on local writes and on writes from other tabs (the `storage` event). */
  subscribe: (listener: () => void) => () => void;
}

export interface StoredValueOptions<T> {
  fallback: T;
  /** Validates untrusted JSON read back from storage. Return the fallback for anything unexpected. */
  parse: (value: unknown) => T;
}

/**
 * A JSON value mirrored to localStorage, shaped for `useSyncExternalStore`.
 * The in-memory copy is the source of truth for this tab, so the UI keeps working
 * when storage is unavailable; it just won't persist.
 */
export function createStoredValue<T>(
  key: string,
  { fallback, parse }: StoredValueOptions<T>,
): StoredValue<T> {
  let loaded = false;
  let current = fallback;
  let lastRaw: string | null = null;
  const listeners = new Set<() => void>();

  const load = () => {
    const raw = readStorage(key);
    lastRaw = raw;
    loaded = true;
    if (raw === null) return fallback;
    try {
      return parse(JSON.parse(raw));
    } catch {
      return fallback;
    }
  };

  const get = () => {
    if (!loaded) current = load();
    return current;
  };

  const emit = () => listeners.forEach((listener) => listener());

  const onStorage = (event: StorageEvent) => {
    // `key` is null when another tab clears storage entirely.
    if (event.key !== null && event.key !== key) return;
    if (readStorage(key) === lastRaw) return;
    current = load();
    emit();
  };

  return {
    get,
    getServer: () => fallback,
    set(update) {
      const previous = get();
      const next = typeof update === "function" ? (update as (value: T) => T)(previous) : update;
      if (Object.is(next, previous)) return;
      current = next;
      lastRaw = JSON.stringify(next);
      writeStorage(key, lastRaw);
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) window.removeEventListener("storage", onStorage);
      };
    },
  };
}
