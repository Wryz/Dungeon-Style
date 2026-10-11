/** Player preferences (separate from progress saves). */
export interface Prefs {
  blood: boolean;
}

const KEY = 'brawler.prefs.v1';
export const DEFAULT_PREFS: Prefs = { blood: true };

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    // Unavailable storage: defaults.
  }
  return { ...DEFAULT_PREFS };
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Not persisted.
  }
}
