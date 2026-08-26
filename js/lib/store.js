/**
 * The smallest thing that counts as state management: a value plus
 * subscribers. Pages subscribe on mount and unsubscribe on navigate.
 */
export function createStore(initial) {
  let value = initial;
  const listeners = new Set();

  return {
    get: () => value,
    set(next) {
      value = typeof next === "function" ? next(value) : { ...value, ...next };
      for (const fn of listeners) fn(value);
    },
    subscribe(fn, { immediate = true } = {}) {
      listeners.add(fn);
      if (immediate) fn(value);
      return () => listeners.delete(fn);
    },
  };
}
