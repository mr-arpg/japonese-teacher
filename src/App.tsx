/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { CardEditorModal } from './components/CardEditorModal';
import { DeckModal } from './components/DeckModal';
import { DecksView } from './components/DecksView';
import { KanjiDictionaryView } from './components/KanjiDictionaryView';
import { PracticeArena } from './components/PracticeArena';
import { SessionSetupModal } from './components/SessionSetupModal';
import { StatsView } from './components/StatsView';
import { CloudSyncStatus, TopBar } from './components/TopBar';
import { WordDictionaryView } from './components/WordDictionaryView';
import { STARTER_DECKS } from './data/starterDecks';
import { auth, googleProvider, isFirebaseConfigured } from './firebase';
import {
  AppState,
  Deck,
  DeckType,
  ExampleSentence,
  KanjiDeckMode,
  SessionConfig,
  SrsGrade,
  StudyCard,
  StudyView,
  UserSettings,
} from './types';
import {
  ensureUserProfile,
  subscribeToUserCloudData,
  syncCreateCard,
  syncCreateDeck,
  syncDailyLog,
  syncDeleteCard,
  syncDeleteDeck,
  syncSaveSettings,
  syncUpdateCardContent,
  syncUpdateCardSentences,
  syncUpdateCardSrs,
  syncUpdateDeck,
  uploadLocalStateToCloud,
} from './utils/cloudSync';
import { calculateNextSrs } from './utils/srs';
import { collectLearnedKanji } from './utils/sentenceText';
import {
  calculateStreak,
  getLocalDateKey,
  loadFromIndexedDB,
  loadInitialStateSync,
  saveAppState,
  validateImportedState,
} from './utils/storage';

export default function App() {
  const [appState, setAppState] = useState<AppState>(() =>
    loadInitialStateSync(STARTER_DECKS)
  );
  const [activeView, setActiveView] = useState<StudyView>('decks');

  // Firebase Auth & Cloud Sync state
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>('local');
  const [authBanner, setAuthBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Modals & Session state
  const [sessionSetupDeck, setSessionSetupDeck] = useState<Deck | null>(null);
  const [activeSessionConfig, setActiveSessionConfig] = useState<SessionConfig | null>(null);

  const [deckModalState, setDeckModalState] = useState<{
    open: boolean;
    deck?: Deck;
  }>({ open: false });

  const [cardEditorState, setCardEditorState] = useState<{
    open: boolean;
    deckId: string;
    deckType: DeckType;
    card?: StudyCard;
  } | null>(null);

  const [pendingDeleteDeckId, setPendingDeleteDeckId] = useState<string | null>(null);
  const [dictSelectedKanji, setDictSelectedKanji] = useState<string | null>(null);
  const [dictWordQuery, setDictWordQuery] = useState<string | null>(null);
  const [backupMessage, setBackupMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Refs for async sync access without stale closures
  const latestStateRef = useRef<AppState>(appState);
  latestStateRef.current = appState;
  const userRef = useRef<User | null>(user);
  userRef.current = user;
  const knownRemoteLogKeysRef = useRef<Set<string>>(new Set());
  const pendingLogDateRef = useRef<string | null>(null);
  const cloudUnsubRef = useRef<(() => void) | null>(null);
  const [asyncError, setAsyncError] = useState<Error | null>(null);

  if (asyncError) {
    throw asyncError;
  }

  const runCloudTask = useCallback((task: () => Promise<void>) => {
    setSyncStatus('syncing');
    void task()
      .then(() => {
        setSyncStatus('synced');
      })
      .catch((err) => {
        setSyncStatus('error');
        setAsyncError(err instanceof Error ? err : new Error(String(err)));
      });
  }, []);

  // Hydrate from IndexedDB if localStorage was cleared (only while signed out)
  useEffect(() => {
    let mounted = true;
    void loadFromIndexedDB().then((idbState) => {
      if (!mounted || !idbState || userRef.current) return;
      setAppState((current) => {
        const hasLocal = Boolean(localStorage.getItem('kakuso_studio_state_v1'));
        return hasLocal ? current : idbState;
      });
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Listen to Firebase Auth state & attach Firestore real-time sync when signed in
  useEffect(() => {
    if (!isFirebaseConfigured) {
      setAuthReady(false);
      setSyncStatus('local');
      return;
    }

    let cancelled = false;
    const unsubAuth = onAuthStateChanged(auth, (nextUser) => {
      cloudUnsubRef.current?.();
      cloudUnsubRef.current = null;
      knownRemoteLogKeysRef.current.clear();
      pendingLogDateRef.current = null;

      setUser(nextUser);
      setAuthReady(true);

      if (!nextUser) {
        setSyncStatus('local');
        return;
      }

      setSyncStatus('syncing');

      void (async () => {
        try {
          const { hasRemoteDecks } = await ensureUserProfile(
            nextUser,
            latestStateRef.current.settings
          );
          if (cancelled || userRef.current?.uid !== nextUser.uid) return;

          if (!hasRemoteDecks) {
            await uploadLocalStateToCloud(nextUser.uid, latestStateRef.current);
          }
          if (cancelled || userRef.current?.uid !== nextUser.uid) return;

          const unsubCloud = subscribeToUserCloudData(nextUser.uid, {
            onSettings: (remoteSettings) => {
              setAppState((prev) => ({
                ...prev,
                settings: remoteSettings,
              }));
            },
            onDecks: (remoteDecks) => {
              setAppState((prev) => ({
                ...prev,
                decks: remoteDecks,
              }));
            },
            onLogs: (remoteLogs, remoteKeys) => {
              knownRemoteLogKeysRef.current = remoteKeys;
              setAppState((prev) => {
                const merged = { ...remoteLogs };
                const todayKey = getLocalDateKey();
                const localToday = prev.logs[todayKey];
                const remoteToday = remoteLogs[todayKey];
                if (localToday && remoteToday) {
                  merged[todayKey] = {
                    date: todayKey,
                    seconds: Math.max(localToday.seconds, remoteToday.seconds),
                    cardsReviewed: Math.max(
                      localToday.cardsReviewed,
                      remoteToday.cardsReviewed
                    ),
                    strokesAttempted: Math.max(
                      localToday.strokesAttempted,
                      remoteToday.strokesAttempted
                    ),
                    strokesCorrect: Math.max(
                      localToday.strokesCorrect,
                      remoteToday.strokesCorrect
                    ),
                  };
                } else if (localToday && !remoteToday && pendingLogDateRef.current === todayKey) {
                  merged[todayKey] = localToday;
                }
                return {
                  ...prev,
                  logs: merged,
                };
              });
            },
            onSynced: () => {
              setSyncStatus('synced');
            },
          });

          cloudUnsubRef.current = unsubCloud;
        } catch (err) {
          if (!cancelled) {
            setSyncStatus('error');
            setAsyncError(err instanceof Error ? err : new Error(String(err)));
          }
        }
      })();
    });

    return () => {
      cancelled = true;
      unsubAuth();
      cloudUnsubRef.current?.();
      cloudUnsubRef.current = null;
    };
  }, []);

  // Flush pending active-second / stroke logs to Firestore every 15s and when tab hides
  const flushPendingLog = useCallback(async () => {
    const activeUser = userRef.current;
    const dateKey = pendingLogDateRef.current;
    if (!activeUser || !dateKey) return;
    const log = latestStateRef.current.logs[dateKey];
    if (!log) return;
    pendingLogDateRef.current = null;
    await syncDailyLog(activeUser.uid, log, knownRemoteLogKeysRef.current);
  }, []);

  useEffect(() => {
    if (!user) return;
    const intervalId = window.setInterval(() => {
      if (pendingLogDateRef.current) {
        runCloudTask(() => flushPendingLog());
      }
    }, 15000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && pendingLogDateRef.current) {
        void flushPendingLog().catch(() => {
          // Best effort flush on tab hide
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, flushPendingLog, runCloudTask]);

  // Persist every state change locally as fast offline cache
  useEffect(() => {
    saveAppState(appState);
  }, [appState]);

  // Sync Tailwind dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (appState.settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [appState.settings.theme]);

  const handleSignIn = async () => {
    setAuthBusy(true);
    setAuthBanner(null);
    try {
      await signInWithPopup(auth, googleProvider);
      setAuthBanner({
        type: 'success',
        text: 'Signed in with Google. Your decks and study progress now sync across devices.',
      });
      setTimeout(() => setAuthBanner(null), 4000);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        const message =
          code === 'auth/popup-blocked'
            ? 'Sign-in popup was blocked by your browser. Please allow popups for this site and try again.'
            : 'Unable to sign in with Google right now. Please try again.';
        setAuthBanner({ type: 'error', text: message });
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    setAuthBusy(true);
    try {
      await flushPendingLog().catch(() => {});
      await signOut(auth);
      setAuthBanner({
        type: 'success',
        text: 'Signed out. Local study mode is active on this device.',
      });
      setTimeout(() => setAuthBanner(null), 3500);
    } catch {
      setAuthBanner({
        type: 'error',
        text: 'Could not sign out cleanly. Please try again.',
      });
    } finally {
      setAuthBusy(false);
    }
  };

  const handleUploadLocalToCloud = () => {
    const activeUser = userRef.current;
    if (!activeUser) return;
    runCloudTask(async () => {
      await uploadLocalStateToCloud(activeUser.uid, latestStateRef.current);
      setAuthBanner({
        type: 'success',
        text: 'Synced local decks and study telemetry to your Google account.',
      });
      setTimeout(() => setAuthBanner(null), 3500);
    });
  };

  const streak = useMemo(
    () => calculateStreak(appState.logs, appState.settings),
    [appState.logs, appState.settings]
  );

  const todayProgressText = useMemo(() => {
    const todayKey = getLocalDateKey();
    const log = appState.logs[todayKey];
    if (appState.settings.dailyGoalType === 'minutes') {
      const mins = log ? Math.floor(log.seconds / 60) : 0;
      return `${mins}/${appState.settings.dailyGoalTarget}m`;
    }
    const cards = log ? log.cardsReviewed : 0;
    return `${cards}/${appState.settings.dailyGoalTarget}c`;
  }, [appState.logs, appState.settings]);

  const handleToggleTheme = () => {
    const nextSettings: UserSettings = {
      ...latestStateRef.current.settings,
      theme: latestStateRef.current.settings.theme === 'dark' ? 'light' : 'dark',
    };
    setAppState((prev) => ({
      ...prev,
      settings: nextSettings,
    }));
    if (userRef.current) {
      const uid = userRef.current.uid;
      runCloudTask(() => syncSaveSettings(uid, nextSettings));
    }
  };

  const handleUpdateSettings = (patch: Partial<UserSettings>) => {
    const nextSettings: UserSettings = {
      ...latestStateRef.current.settings,
      ...patch,
    };
    setAppState((prev) => ({
      ...prev,
      settings: nextSettings,
    }));
    if (userRef.current) {
      const uid = userRef.current.uid;
      runCloudTask(() => syncSaveSettings(uid, nextSettings));
    }
  };

  const handleQuickPractice = () => {
    const firstNonEmpty =
      appState.decks.find((d) => d.cards.length > 0) ?? appState.decks[0];
    if (firstNonEmpty) {
      setSessionSetupDeck(firstNonEmpty);
    } else {
      setActiveView('practice');
    }
  };

  const handleStartSession = (config: SessionConfig) => {
    setSessionSetupDeck(null);
    setActiveSessionConfig(config);
    setActiveView('practice');
  };

  const handleRecordActiveSecond = useCallback(() => {
    const todayKey = getLocalDateKey();
    if (userRef.current) {
      pendingLogDateRef.current = todayKey;
    }
    setAppState((prev) => {
      const existing = prev.logs[todayKey] ?? {
        date: todayKey,
        seconds: 0,
        cardsReviewed: 0,
        strokesAttempted: 0,
        strokesCorrect: 0,
      };
      return {
        ...prev,
        logs: {
          ...prev.logs,
          [todayKey]: {
            ...existing,
            seconds: existing.seconds + 1,
          },
        },
      };
    });
  }, []);

  const handleRecordStrokeAttempt = useCallback((isCorrect: boolean) => {
    const todayKey = getLocalDateKey();
    if (userRef.current) {
      pendingLogDateRef.current = todayKey;
    }
    setAppState((prev) => {
      const existing = prev.logs[todayKey] ?? {
        date: todayKey,
        seconds: 0,
        cardsReviewed: 0,
        strokesAttempted: 0,
        strokesCorrect: 0,
      };
      return {
        ...prev,
        logs: {
          ...prev.logs,
          [todayKey]: {
            ...existing,
            strokesAttempted: existing.strokesAttempted + 1,
            strokesCorrect: existing.strokesCorrect + (isCorrect ? 1 : 0),
          },
        },
      };
    });
  }, []);

  const handleGradeCard = useCallback(
    (deckId: string, cardId: string, grade: SrsGrade, wasCorrect: boolean) => {
      const todayKey = getLocalDateKey();
      const now = Date.now();

      let updatedCardForCloud: StudyCard | null = null;
      let updatedLogForCloud = latestStateRef.current.logs[todayKey] ?? {
        date: todayKey,
        seconds: 0,
        cardsReviewed: 0,
        strokesAttempted: 0,
        strokesCorrect: 0,
      };

      const targetDeck = latestStateRef.current.decks.find((d) => d.id === deckId);
      const targetCard = targetDeck?.cards.find((c) => c.id === cardId);
      if (targetCard) {
        const srsPatch = calculateNextSrs(targetCard, grade, now);
        updatedCardForCloud = {
          ...targetCard,
          ...srsPatch,
          attemptCount: targetCard.attemptCount + 1,
          correctCount: targetCard.correctCount + (wasCorrect ? 1 : 0),
        };
      }
      updatedLogForCloud = {
        ...updatedLogForCloud,
        cardsReviewed: updatedLogForCloud.cardsReviewed + 1,
      };

      setAppState((prev) => {
        const updatedDecks = prev.decks.map((deck) => {
          if (deck.id !== deckId) return deck;
          return {
            ...deck,
            cards: deck.cards.map((card) => {
              if (card.id !== cardId) return card;
              const srsPatch = calculateNextSrs(card, grade, now);
              return {
                ...card,
                ...srsPatch,
                attemptCount: card.attemptCount + 1,
                correctCount: card.correctCount + (wasCorrect ? 1 : 0),
              };
            }),
          };
        });

        const existingLog = prev.logs[todayKey] ?? {
          date: todayKey,
          seconds: 0,
          cardsReviewed: 0,
          strokesAttempted: 0,
          strokesCorrect: 0,
        };

        return {
          ...prev,
          decks: updatedDecks,
          logs: {
            ...prev.logs,
            [todayKey]: {
              ...existingLog,
              cardsReviewed: existingLog.cardsReviewed + 1,
            },
          },
        };
      });

      if (userRef.current) {
        const uid = userRef.current.uid;
        pendingLogDateRef.current = null;
        runCloudTask(async () => {
          if (updatedCardForCloud) {
            await syncUpdateCardSrs(uid, deckId, updatedCardForCloud);
          }
          await syncDailyLog(uid, updatedLogForCloud, knownRemoteLogKeysRef.current);
        });
      }
    },
    [runCloudTask]
  );

  const handleSaveDeck = (data: {
    title: string;
    description: string;
    type: DeckType;
    kanjiMode?: KanjiDeckMode;
    category: string;
  }) => {
    if (deckModalState.deck) {
      const targetId = deckModalState.deck.id;
      const updatedDeck: Deck = {
        ...deckModalState.deck,
        title: data.title,
        description: data.description,
        category: data.category,
        kanjiMode:
          deckModalState.deck.type === 'kanji'
            ? (data.kanjiMode ?? deckModalState.deck.kanjiMode ?? 'writing')
            : undefined,
      };
      setAppState((prev) => ({
        ...prev,
        decks: prev.decks.map((d) => (d.id === targetId ? updatedDeck : d)),
      }));
      if (userRef.current) {
        const uid = userRef.current.uid;
        runCloudTask(() => syncUpdateDeck(uid, updatedDeck));
      }
    } else {
      const newDeck: Deck = {
        id: `deck-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: data.title,
        description: data.description,
        type: data.type,
        kanjiMode: data.type === 'kanji' ? (data.kanjiMode ?? 'writing') : undefined,
        category: data.category,
        createdAt: Date.now(),
        cards: [],
      };
      setAppState((prev) => ({
        ...prev,
        decks: [newDeck, ...prev.decks],
      }));
      if (userRef.current) {
        const uid = userRef.current.uid;
        runCloudTask(() => syncCreateDeck(uid, newDeck));
      }
    }
    setDeckModalState({ open: false });
  };

  const handleConfirmDeleteDeck = () => {
    if (!pendingDeleteDeckId) return;
    const deckIdToDelete = pendingDeleteDeckId;
    setAppState((prev) => ({
      ...prev,
      decks: prev.decks.filter((d) => d.id !== deckIdToDelete),
    }));
    if (activeSessionConfig?.deckId === deckIdToDelete) {
      setActiveSessionConfig(null);
    }
    setPendingDeleteDeckId(null);
    if (userRef.current) {
      const uid = userRef.current.uid;
      runCloudTask(() => syncDeleteDeck(uid, deckIdToDelete));
    }
  };

  const handleSaveCard = (card: StudyCard) => {
    const targetDeck = latestStateRef.current.decks.find((d) => d.id === card.deckId);
    const exists = Boolean(targetDeck?.cards.some((c) => c.id === card.id));

    setAppState((prev) => ({
      ...prev,
      decks: prev.decks.map((deck) => {
        if (deck.id !== card.deckId) return deck;
        const cardExists = deck.cards.some((c) => c.id === card.id);
        return {
          ...deck,
          cards: cardExists
            ? deck.cards.map((c) => (c.id === card.id ? card : c))
            : [card, ...deck.cards],
        };
      }),
    }));
    setCardEditorState(null);

    if (userRef.current) {
      const uid = userRef.current.uid;
      runCloudTask(() =>
        exists
          ? syncUpdateCardContent(uid, card.deckId, card)
          : syncCreateCard(uid, card.deckId, card)
      );
    }
  };

  const handleDeleteCard = (deckId: string, cardId: string) => {
    setAppState((prev) => ({
      ...prev,
      decks: prev.decks.map((deck) =>
        deck.id === deckId
          ? { ...deck, cards: deck.cards.filter((c) => c.id !== cardId) }
          : deck
      ),
    }));
    if (userRef.current) {
      const uid = userRef.current.uid;
      runCloudTask(() => syncDeleteCard(uid, deckId, cardId));
    }
  };

  const handleAppendCardSentences = useCallback(
    (deckId: string, cardId: string, newSentences: ExampleSentence[]) => {
      const targetDeck = latestStateRef.current.decks.find((d) => d.id === deckId);
      const targetCard = targetDeck?.cards.find((c) => c.id === cardId);
      const nextSentences = targetCard
        ? [...targetCard.sentences, ...newSentences]
        : newSentences;

      setAppState((prev) => ({
        ...prev,
        decks: prev.decks.map((deck) => {
          if (deck.id !== deckId) return deck;
          return {
            ...deck,
            cards: deck.cards.map((card) =>
              card.id === cardId
                ? { ...card, sentences: [...card.sentences, ...newSentences] }
                : card
            ),
          };
        }),
      }));

      if (userRef.current) {
        const uid = userRef.current.uid;
        runCloudTask(() =>
          syncUpdateCardSentences(uid, deckId, cardId, nextSentences)
        );
      }
    },
    [runCloudTask]
  );

  const handleSaveDictionaryCardToDeck = useCallback(
    (deckId: string, card: StudyCard) => {
      const targetDeck = latestStateRef.current.decks.find((d) => d.id === deckId);
      if (!targetDeck) return;
      const duplicate = targetDeck.cards.some((c) =>
        targetDeck.type === 'kanji'
          ? c.character === card.character
          : c.kana === card.kana && c.character === card.character
      );
      if (duplicate) return;

      setAppState((prev) => ({
        ...prev,
        decks: prev.decks.map((deck) => {
          if (deck.id !== deckId) return deck;
          const dup = deck.cards.some((c) =>
            deck.type === 'kanji'
              ? c.character === card.character
              : c.kana === card.kana && c.character === card.character
          );
          if (dup) return deck;
          return {
            ...deck,
            cards: [card, ...deck.cards],
          };
        }),
      }));

      if (userRef.current) {
        const uid = userRef.current.uid;
        runCloudTask(() => syncCreateCard(uid, deckId, card));
      }
    },
    [runCloudTask]
  );

  const kanjiDecks = useMemo(
    () => appState.decks.filter((d) => d.type === 'kanji'),
    [appState.decks]
  );

  const vocabDecks = useMemo(
    () => appState.decks.filter((d) => d.type === 'vocab'),
    [appState.decks]
  );

  const learnedKanji = useMemo(
    () =>
      collectLearnedKanji(
        appState.decks,
        appState.settings.customLearnedKanji ?? []
      ),
    [appState.decks, appState.settings.customLearnedKanji]
  );

  const handleToggleLearnedKanji = useCallback(
    (kanji: string) => {
      const ch = Array.from(kanji.trim())[0];
      if (!ch) return;
      const existing = latestStateRef.current.settings.customLearnedKanji ?? [];
      const isAlreadyCustom = existing.includes(ch);
      const nextCustom = isAlreadyCustom
        ? existing.filter((k) => k !== ch)
        : [...existing, ch];
      const nextSettings: UserSettings = {
        ...latestStateRef.current.settings,
        customLearnedKanji: nextCustom,
      };
      setAppState((prev) => ({
        ...prev,
        settings: nextSettings,
      }));
      if (userRef.current) {
        const uid = userRef.current.uid;
        runCloudTask(() => syncSaveSettings(uid, nextSettings));
      }
    },
    [runCloudTask]
  );

  const handleExportBackup = () => {
    const payload = JSON.stringify(appState, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kakuso-backup-${getLocalDateKey()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setBackupMessage({
      type: 'success',
      text: `Exported ${appState.decks.length} decks and study telemetry to JSON.`,
    });
    setTimeout(() => setBackupMessage(null), 4000);
  };

  const handleImportBackup = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const validated = validateImportedState(parsed);
      if (!validated) {
        setBackupMessage({
          type: 'error',
          text: 'Invalid backup file structure. Please select a valid Kakuso JSON export.',
        });
        return;
      }
      setAppState(validated);
      if (userRef.current) {
        const uid = userRef.current.uid;
        runCloudTask(() => uploadLocalStateToCloud(uid, validated));
      }
      setBackupMessage({
        type: 'success',
        text: `Imported ${validated.decks.length} study decks and restored progress.`,
      });
      setTimeout(() => setBackupMessage(null), 4000);
    } catch {
      setBackupMessage({
        type: 'error',
        text: 'Could not read JSON backup file.',
      });
    }
  };

  const pendingDeleteDeck = useMemo(
    () => appState.decks.find((d) => d.id === pendingDeleteDeckId) ?? null,
    [appState.decks, pendingDeleteDeckId]
  );

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#18181B] dark:bg-[#121316] dark:text-[#F4F4F5] transition-colors">
      <TopBar
        activeView={activeView}
        onNavigate={setActiveView}
        streak={streak}
        todayProgressText={todayProgressText}
        settings={appState.settings}
        onToggleTheme={handleToggleTheme}
        onQuickPractice={handleQuickPractice}
        user={user}
        authReady={authReady}
        authBusy={authBusy}
        syncStatus={syncStatus}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        onUploadLocalToCloud={handleUploadLocalToCloud}
      />

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        {authBanner && (
          <div
            role="status"
            className={`mb-6 flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-xs font-medium ${
              authBanner.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
            }`}
          >
            <span>{authBanner.text}</span>
            <button
              type="button"
              onClick={() => setAuthBanner(null)}
              className="text-xs opacity-70 hover:opacity-100 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {activeView === 'decks' && (
          <DecksView
            decks={appState.decks}
            onOpenSessionSetup={(deck) => setSessionSetupDeck(deck)}
            onCreateDeck={() => setDeckModalState({ open: true })}
            onEditDeck={(deck) => setDeckModalState({ open: true, deck })}
            onDeleteDeck={(deckId) => setPendingDeleteDeckId(deckId)}
            onAddCard={(deck) =>
              setCardEditorState({
                open: true,
                deckId: deck.id,
                deckType: deck.type,
              })
            }
            onEditCard={(deck, card) =>
              setCardEditorState({
                open: true,
                deckId: deck.id,
                deckType: deck.type,
                card,
              })
            }
            onDeleteCard={handleDeleteCard}
            onExportBackup={handleExportBackup}
            onImportBackup={handleImportBackup}
            backupMessage={backupMessage}
          />
        )}

        {activeView === 'kanji-dict' && (
          <KanjiDictionaryView
            initialKanji={dictSelectedKanji}
            kanjiDecks={kanjiDecks}
            learnedKanji={learnedKanji}
            defaultTracingGuide={appState.settings.showTracingGuideByDefault}
            onToggleLearnedKanji={handleToggleLearnedKanji}
            onOpenWordInDictionary={(term) => {
              setDictWordQuery(term);
              setActiveView('word-dict');
            }}
            onSaveKanjiToDeck={handleSaveDictionaryCardToDeck}
            onRecordStrokeAttempt={handleRecordStrokeAttempt}
          />
        )}

        {activeView === 'word-dict' && (
          <WordDictionaryView
            initialQuery={dictWordQuery}
            vocabDecks={vocabDecks}
            learnedKanji={learnedKanji}
            onInspectKanji={(char) => {
              setDictSelectedKanji(char);
              setActiveView('kanji-dict');
            }}
            onSaveWordToDeck={handleSaveDictionaryCardToDeck}
          />
        )}

        {activeView === 'practice' && (
          <PracticeArena
            decks={appState.decks}
            sessionConfig={activeSessionConfig}
            defaultTracingGuide={appState.settings.showTracingGuideByDefault}
            learnedKanji={learnedKanji}
            onSelectDeckToPractice={(deck) => setSessionSetupDeck(deck)}
            onExitSession={() => {
              setActiveSessionConfig(null);
              setActiveView('decks');
            }}
            onRecordActiveSecond={handleRecordActiveSecond}
            onRecordStrokeAttempt={handleRecordStrokeAttempt}
            onGradeCard={handleGradeCard}
            onAppendCardSentences={handleAppendCardSentences}
          />
        )}

        {activeView === 'stats' && (
          <StatsView
            decks={appState.decks}
            logs={appState.logs}
            settings={appState.settings}
            streak={streak}
            onUpdateSettings={handleUpdateSettings}
          />
        )}
      </main>

      {/* Modals */}
      {sessionSetupDeck && (
        <SessionSetupModal
          deck={sessionSetupDeck}
          onClose={() => setSessionSetupDeck(null)}
          onStart={handleStartSession}
        />
      )}

      {deckModalState.open && (
        <DeckModal
          existingDeck={deckModalState.deck}
          onClose={() => setDeckModalState({ open: false })}
          onSave={handleSaveDeck}
        />
      )}

      {cardEditorState?.open && (
        <CardEditorModal
          deckId={cardEditorState.deckId}
          deckType={cardEditorState.deckType}
          existingCard={cardEditorState.card}
          onClose={() => setCardEditorState(null)}
          onSave={handleSaveCard}
        />
      )}

      {/* In-app Delete Deck Confirmation Modal (never uses window.confirm) */}
      {pendingDeleteDeck && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-deck-title"
        >
          <div className="w-full max-w-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-[#16181D] p-6 shadow-xl space-y-4">
            <h2
              id="delete-deck-title"
              className="text-base font-semibold text-zinc-900 dark:text-zinc-100"
            >
              Delete "{pendingDeleteDeck.title}"?
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              This removes the deck and all {pendingDeleteDeck.cards.length} cards inside it from your {user ? 'synced account and local storage' : 'local storage'}. Export a JSON backup first if you want to keep a copy.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setPendingDeleteDeckId(null)}
                className="rounded-lg px-3.5 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteDeck}
                className="rounded-lg bg-red-600 hover:bg-red-700 px-3.5 py-2 text-xs font-semibold text-white cursor-pointer"
              >
                Delete Deck
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
