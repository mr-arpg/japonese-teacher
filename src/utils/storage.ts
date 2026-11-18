import { AppState, DailyStudyLog, Deck, UserSettings } from '../types';

const STORAGE_KEY = 'kakuso_studio_state_v1';
const IDB_NAME = 'kakuso_studio_db';
const IDB_STORE = 'app_state';
const IDB_KEY = 'primary';

export function getLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'light',
  dailyGoalType: 'minutes',
  dailyGoalTarget: 15,
  showTracingGuideByDefault: false,
  customLearnedKanji: [],
};

export function loadInitialStateSync(fallbackDecks: Deck[]): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppState>;
      if (parsed && Array.isArray(parsed.decks)) {
        return {
          decks: parsed.decks,
          logs: parsed.logs ?? {},
          settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
        };
      }
    }
  } catch {
    // Ignore parse errors and fall back to starter state
  }

  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  return {
    decks: fallbackDecks,
    logs: createSeededRecentLogs(),
    settings: {
      ...DEFAULT_SETTINGS,
      theme: prefersDark ? 'dark' : 'light',
    },
  };
}

function createSeededRecentLogs(): Record<string, DailyStudyLog> {
  // Keep initial telemetry clean & honest (empty today, ready to record real study time)
  return {};
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadFromIndexedDB(): Promise<AppState | null> {
  try {
    const db = await openDatabase();
    return await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_KEY);
      req.onsuccess = () => {
        const val = req.result as AppState | undefined;
        if (val && Array.isArray(val.decks)) {
          resolve({
            decks: val.decks,
            logs: val.logs ?? {},
            settings: { ...DEFAULT_SETTINGS, ...(val.settings ?? {}) },
          });
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export function saveAppState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage quota exceeded — IndexedDB will still persist
  }

  void openDatabase()
    .then((db) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(state, IDB_KEY);
    })
    .catch(() => {
      // Ignore IDB failures silently
    });
}

export function validateImportedState(raw: unknown): AppState | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<AppState>;
  if (!Array.isArray(candidate.decks)) return null;

  const validDecks = candidate.decks.every(
    (d) =>
      d &&
      typeof d.id === 'string' &&
      typeof d.title === 'string' &&
      (d.type === 'kanji' || d.type === 'vocab') &&
      (d.kanjiMode === undefined ||
        d.kanjiMode === 'writing' ||
        d.kanjiMode === 'reading') &&
      Array.isArray(d.cards)
  );
  if (!validDecks) return null;

  return {
    decks: candidate.decks,
    logs: candidate.logs && typeof candidate.logs === 'object' ? candidate.logs : {},
    settings: { ...DEFAULT_SETTINGS, ...(candidate.settings ?? {}) },
  };
}

export function calculateStreak(
  logs: Record<string, DailyStudyLog>,
  settings: UserSettings
): number {
  const today = new Date();
  let streak = 0;

  // Check if today already has activity; if not, allow streak to count up to yesterday
  const todayKey = getLocalDateKey(today);
  const todayLog = logs[todayKey];
  const hasAnyActivityToday =
    todayLog && (todayLog.seconds >= 30 || todayLog.cardsReviewed > 0);

  let offset = hasAnyActivityToday ? 0 : 1;

  while (true) {
    const d = new Date(today);
    d.setDate(today.getDate() - offset);
    const key = getLocalDateKey(d);
    const log = logs[key];
    if (!log) break;

    const metMinimum = log.seconds >= 30 || log.cardsReviewed >= 1;
    // Also check if goal threshold is tracked elsewhere; streak counts active study days
    if (metMinimum) {
      streak += 1;
      offset += 1;
    } else {
      break;
    }
  }

  void settings; // kept for future strict-goal mode extension
  return streak;
}
