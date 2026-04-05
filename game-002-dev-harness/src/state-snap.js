const STORAGE_PREFIX = '__dev_harness_state__';

export function snapshotState(sceneKey, stateObj) {
  if (!sceneKey || !stateObj) return;
  try {
    const key = `${STORAGE_PREFIX}${sceneKey}`;
    sessionStorage.setItem(key, JSON.stringify(stateObj));
  } catch (_) {
    // sessionStorage full or unavailable - silently skip
  }
}

export function restoreState(sceneKey) {
  if (!sceneKey) return null;
  try {
    const key = `${STORAGE_PREFIX}${sceneKey}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    sessionStorage.removeItem(key);
    return JSON.parse(raw);
  } catch (_) {
    // corrupted data - start fresh
    return null;
  }
}
