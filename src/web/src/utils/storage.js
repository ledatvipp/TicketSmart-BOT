function getStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getStoredValue(key) {
  try {
    return getStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function setStoredValue(key, value) {
  try {
    getStorage()?.setItem(key, value);
  } catch {
    // Storage can be disabled by browser privacy settings; the app still works without preferences.
  }
}

export function removeStoredValue(key) {
  try {
    getStorage()?.removeItem(key);
  } catch {
    // Storage can be disabled by browser privacy settings; stale state is ignored in that case.
  }
}
