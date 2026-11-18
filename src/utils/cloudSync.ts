import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  AppState,
  DailyStudyLog,
  Deck,
  ExampleSentence,
  StudyCard,
  UserSettings,
} from '../types';
import { DEFAULT_SETTINGS } from './storage';

const VALID_ID_RE = /^[a-zA-Z0-9_-]+$/;

export function sanitizeFirestoreId(raw: string, fallbackPrefix: string): string {
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120);
  if (cleaned.length > 0 && VALID_ID_RE.test(cleaned)) {
    return cleaned;
  }
  return `${fallbackPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function clampString(val: unknown, maxLen: number, fallback = ''): string {
  if (typeof val !== 'string') return fallback;
  return val.slice(0, maxLen);
}

function clampStringArray(
  arr: unknown,
  maxItems: number,
  maxItemLen: number
): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((v): v is string => typeof v === 'string')
    .slice(0, maxItems)
    .map((s) => s.slice(0, maxItemLen));
}

function clampSentences(sentences: unknown): ExampleSentence[] {
  if (!Array.isArray(sentences)) return [];
  return sentences
    .filter((s): s is ExampleSentence => Boolean(s && typeof s === 'object'))
    .slice(0, 50)
    .map((s, idx) => {
      const clean: ExampleSentence = {
        id: clampString(s.id, 128, `sent-${idx}`),
        japanese: clampString(s.japanese, 500),
        furigana: clampString(s.furigana, 800),
        english: clampString(s.english, 500),
      };
      if (typeof s.targetHighlight === 'string' && s.targetHighlight) {
        clean.targetHighlight = clampString(s.targetHighlight, 128);
      }
      if (Array.isArray(s.segments) && s.segments.length > 0) {
        clean.segments = s.segments.slice(0, 100).map((seg) =>
          seg.reading
            ? {
                text: clampString(seg.text, 64),
                reading: clampString(seg.reading, 64),
              }
            : { text: clampString(seg.text, 64) }
        );
      }
      return clean;
    });
}

export function sanitizeSettingsForCloud(settings: UserSettings): UserSettings {
  const customLearnedKanji = clampStringArray(
    settings.customLearnedKanji ?? [],
    3500,
    8
  );
  return {
    theme: settings.theme === 'dark' ? 'dark' : 'light',
    dailyGoalType: settings.dailyGoalType === 'cards' ? 'cards' : 'minutes',
    dailyGoalTarget: Math.max(
      1,
      Math.min(240, Math.round(Number(settings.dailyGoalTarget) || 15))
    ),
    showTracingGuideByDefault: Boolean(settings.showTracingGuideByDefault),
    customLearnedKanji,
  };
}

function buildDeckPayload(uid: string, deck: Deck, isCreate: boolean) {
  const deckId = sanitizeFirestoreId(deck.id, 'deck');
  const payload: Record<string, unknown> = {
    id: deckId,
    uid,
    title: clampString(deck.title.trim() || 'Untitled Deck', 120),
    description: clampString(deck.description ?? '', 600),
    type: deck.type === 'vocab' ? 'vocab' : 'kanji',
    category: clampString(deck.category.trim() || 'Custom', 80),
    updatedAt: serverTimestamp(),
  };
  if (deck.type === 'kanji' && (deck.kanjiMode === 'writing' || deck.kanjiMode === 'reading')) {
    payload.kanjiMode = deck.kanjiMode;
  }
  if (isCreate) {
    payload.createdAt = serverTimestamp();
  }
  return { deckId, payload };
}

function buildCardPayload(uid: string, deckId: string, card: StudyCard, isCreate: boolean) {
  const cardId = sanitizeFirestoreId(card.id, 'card');
  const payload: Record<string, unknown> = {
    id: cardId,
    uid,
    deckId,
    type: card.type === 'vocab' ? 'vocab' : 'kanji',
    kana: clampString(card.kana ?? '', 128),
    meanings: clampStringArray(card.meanings, 30, 120),
    sentences: clampSentences(card.sentences),
    interval: Math.max(0, Math.min(36500, Number(card.interval) || 0)),
    easeFactor: Math.max(1.0, Math.min(5.0, Number(card.easeFactor) || 2.5)),
    repetitions: Math.max(0, Math.min(10000, Math.round(Number(card.repetitions) || 0))),
    nextReview: Math.max(0, Number(card.nextReview) || Date.now()),
    lapses: Math.max(0, Math.min(100000, Math.round(Number(card.lapses) || 0))),
    correctCount: Math.max(0, Math.min(1000000, Math.round(Number(card.correctCount) || 0))),
    attemptCount: Math.max(0, Math.min(1000000, Math.round(Number(card.attemptCount) || 0))),
    updatedAt: serverTimestamp(),
  };

  if (typeof card.character === 'string' && card.character.length > 0) {
    payload.character = clampString(card.character, 64);
  }
  if (Array.isArray(card.onyomi)) {
    payload.onyomi = clampStringArray(card.onyomi, 20, 48);
  }
  if (Array.isArray(card.kunyomi)) {
    payload.kunyomi = clampStringArray(card.kunyomi, 20, 48);
  }
  if (Array.isArray(card.radicals)) {
    payload.radicals = clampStringArray(card.radicals, 20, 64);
  }
  if (typeof card.strokeCount === 'number' && Number.isFinite(card.strokeCount)) {
    payload.strokeCount = Math.max(0, Math.min(64, Math.round(card.strokeCount)));
  }
  if (Array.isArray(card.customSvgPaths)) {
    payload.customSvgPaths = clampStringArray(card.customSvgPaths, 64, 2048);
  }
  if (typeof card.lastReviewed === 'number' && Number.isFinite(card.lastReviewed)) {
    payload.lastReviewed = Math.max(0, card.lastReviewed);
  }
  if (isCreate) {
    payload.createdAt = serverTimestamp();
  }

  return { cardId, payload };
}

function buildDailyLogPayload(uid: string, log: DailyStudyLog, isCreate: boolean) {
  const payload: Record<string, unknown> = {
    uid,
    date: log.date,
    seconds: Math.max(0, Math.min(86400, Math.round(Number(log.seconds) || 0))),
    cardsReviewed: Math.max(0, Math.min(50000, Math.round(Number(log.cardsReviewed) || 0))),
    strokesAttempted: Math.max(
      0,
      Math.min(500000, Math.round(Number(log.strokesAttempted) || 0))
    ),
    strokesCorrect: Math.max(
      0,
      Math.min(500000, Math.round(Number(log.strokesCorrect) || 0))
    ),
    updatedAt: serverTimestamp(),
  };
  if (isCreate) {
    payload.createdAt = serverTimestamp();
  }
  return payload;
}

export async function ensureUserProfile(
  user: User,
  localSettings: UserSettings
): Promise<{ hasRemoteDecks: boolean }> {
  const userPath = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  const cleanSettings = sanitizeSettingsForCloud(localSettings);

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      const profilePayload: Record<string, unknown> = {
        uid: user.uid,
        email: clampString(user.email || `${user.uid}@users.local`, 320),
        settings: cleanSettings,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (user.displayName) {
        profilePayload.displayName = clampString(user.displayName, 120);
      }
      if (user.photoURL) {
        profilePayload.photoURL = clampString(user.photoURL, 1000);
      }
      try {
        await setDoc(userRef, profilePayload);
      } catch (writeErr) {
        handleFirestoreError(writeErr, OperationType.CREATE, userPath);
      }
    } else {
      const existingData = snap.data();
      const nextEmail = clampString(user.email || existingData.email || '', 320);
      const nextName = user.displayName ? clampString(user.displayName, 120) : undefined;
      const nextPhoto = user.photoURL ? clampString(user.photoURL, 1000) : undefined;

      const needsProfileUpdate =
        existingData.email !== nextEmail ||
        (nextName && existingData.displayName !== nextName) ||
        (nextPhoto && existingData.photoURL !== nextPhoto);

      if (needsProfileUpdate) {
        const updatePayload: Record<string, unknown> = {
          email: nextEmail,
          settings: existingData.settings
            ? sanitizeSettingsForCloud({ ...DEFAULT_SETTINGS, ...existingData.settings })
            : cleanSettings,
          updatedAt: serverTimestamp(),
        };
        if (nextName) updatePayload.displayName = nextName;
        if (nextPhoto) updatePayload.photoURL = nextPhoto;

        try {
          await updateDoc(userRef, updatePayload);
        } catch (updateErr) {
          handleFirestoreError(updateErr, OperationType.UPDATE, userPath);
        }
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, userPath);
  }

  const decksPath = `users/${user.uid}/decks`;
  try {
    const decksSnap = await getDocs(collection(db, 'users', user.uid, 'decks'));
    return { hasRemoteDecks: !decksSnap.empty };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, decksPath);
  }
}

export async function uploadLocalStateToCloud(
  uid: string,
  state: AppState
): Promise<void> {
  const existingDecksSnap = await getDocs(collection(db, 'users', uid, 'decks')).catch(
    (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/decks`)
  );
  const existingDeckIds = new Set(existingDecksSnap.docs.map((d) => d.id));

  const existingLogsSnap = await getDocs(collection(db, 'users', uid, 'logs')).catch(
    (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/logs`)
  );
  const existingLogMap = new Map<string, DailyStudyLog>();
  for (const lDoc of existingLogsSnap.docs) {
    const l = lDoc.data();
    existingLogMap.set(lDoc.id, {
      date: lDoc.id,
      seconds: typeof l.seconds === 'number' ? l.seconds : 0,
      cardsReviewed: typeof l.cardsReviewed === 'number' ? l.cardsReviewed : 0,
      strokesAttempted: typeof l.strokesAttempted === 'number' ? l.strokesAttempted : 0,
      strokesCorrect: typeof l.strokesCorrect === 'number' ? l.strokesCorrect : 0,
    });
  }

  type BatchOp =
    | { kind: 'set'; ref: ReturnType<typeof doc>; data: Record<string, unknown> }
    | { kind: 'update'; ref: ReturnType<typeof doc>; data: Record<string, unknown> };

  const ops: BatchOp[] = [];

  for (const deck of state.decks) {
    const deckId = sanitizeFirestoreId(deck.id, 'deck');
    const deckRef = doc(db, 'users', uid, 'decks', deckId);
    const deckExists = existingDeckIds.has(deckId);

    if (deckExists) {
      const updateDeckData: Record<string, unknown> = {
        title: clampString(deck.title.trim() || 'Untitled Deck', 120),
        description: clampString(deck.description ?? '', 600),
        category: clampString(deck.category.trim() || 'Custom', 80),
        updatedAt: serverTimestamp(),
      };
      if (deck.type === 'kanji' && (deck.kanjiMode === 'writing' || deck.kanjiMode === 'reading')) {
        updateDeckData.kanjiMode = deck.kanjiMode;
      }
      ops.push({ kind: 'update', ref: deckRef, data: updateDeckData });
    } else {
      const { payload: deckPayload } = buildDeckPayload(uid, { ...deck, id: deckId }, true);
      ops.push({ kind: 'set', ref: deckRef, data: deckPayload });
    }

    const existingCardIds = new Set<string>();
    if (deckExists) {
      const existingCardsSnap = await getDocs(
        collection(db, 'users', uid, 'decks', deckId, 'cards')
      ).catch((err) =>
        handleFirestoreError(err, OperationType.LIST, `users/${uid}/decks/${deckId}/cards`)
      );
      for (const cDoc of existingCardsSnap.docs) {
        existingCardIds.add(cDoc.id);
      }
    }

    for (const card of deck.cards) {
      const cardId = sanitizeFirestoreId(card.id, 'card');
      const cardRef = doc(db, 'users', uid, 'decks', deckId, 'cards', cardId);
      if (existingCardIds.has(cardId)) {
        const updateCardData: Record<string, unknown> = {
          kana: clampString(card.kana ?? '', 128),
          meanings: clampStringArray(card.meanings, 30, 120),
          sentences: clampSentences(card.sentences),
          updatedAt: serverTimestamp(),
        };
        if (typeof card.character === 'string' && card.character.length > 0) {
          updateCardData.character = clampString(card.character, 64);
        }
        if (Array.isArray(card.onyomi)) {
          updateCardData.onyomi = clampStringArray(card.onyomi, 20, 48);
        }
        if (Array.isArray(card.kunyomi)) {
          updateCardData.kunyomi = clampStringArray(card.kunyomi, 20, 48);
        }
        if (Array.isArray(card.radicals)) {
          updateCardData.radicals = clampStringArray(card.radicals, 20, 64);
        }
        if (typeof card.strokeCount === 'number' && Number.isFinite(card.strokeCount)) {
          updateCardData.strokeCount = Math.max(0, Math.min(64, Math.round(card.strokeCount)));
        }
        if (Array.isArray(card.customSvgPaths)) {
          updateCardData.customSvgPaths = clampStringArray(card.customSvgPaths, 64, 2048);
        }
        ops.push({ kind: 'update', ref: cardRef, data: updateCardData });
      } else {
        const { payload: cardPayload } = buildCardPayload(
          uid,
          deckId,
          { ...card, id: cardId },
          true
        );
        ops.push({ kind: 'set', ref: cardRef, data: cardPayload });
      }
    }
  }

  for (const [dateKey, log] of Object.entries(state.logs)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;
    const logRef = doc(db, 'users', uid, 'logs', dateKey);
    const existingLog = existingLogMap.get(dateKey);
    if (existingLog) {
      ops.push({
        kind: 'update',
        ref: logRef,
        data: {
          seconds: Math.max(existingLog.seconds, Math.min(86400, Math.round(Number(log.seconds) || 0))),
          cardsReviewed: Math.max(
            existingLog.cardsReviewed,
            Math.min(50000, Math.round(Number(log.cardsReviewed) || 0))
          ),
          strokesAttempted: Math.max(
            existingLog.strokesAttempted,
            Math.min(500000, Math.round(Number(log.strokesAttempted) || 0))
          ),
          strokesCorrect: Math.max(
            existingLog.strokesCorrect,
            Math.min(500000, Math.round(Number(log.strokesCorrect) || 0))
          ),
          updatedAt: serverTimestamp(),
        },
      });
    } else {
      ops.push({
        kind: 'set',
        ref: logRef,
        data: buildDailyLogPayload(uid, { ...log, date: dateKey }, true),
      });
    }
  }

  // Commit in chunks <= 400 operations per Firestore batch
  const CHUNK_SIZE = 400;
  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    const slice = ops.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const op of slice) {
      if (op.kind === 'set') {
        batch.set(op.ref, op.data);
      } else {
        batch.update(op.ref, op.data);
      }
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${uid}/decks`);
    }
  }

  await syncSaveSettings(uid, state.settings);
}

export async function syncSaveSettings(
  uid: string,
  settings: UserSettings
): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      settings: sanitizeSettingsForCloud(settings),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function syncCreateDeck(uid: string, deck: Deck): Promise<void> {
  const { deckId, payload } = buildDeckPayload(uid, deck, true);
  const path = `users/${uid}/decks/${deckId}`;
  try {
    if (deck.cards.length === 0) {
      await setDoc(doc(db, 'users', uid, 'decks', deckId), payload);
      return;
    }
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', uid, 'decks', deckId), payload);
    for (const card of deck.cards.slice(0, 390)) {
      const { cardId, payload: cardPayload } = buildCardPayload(uid, deckId, card, true);
      batch.set(doc(db, 'users', uid, 'decks', deckId, 'cards', cardId), cardPayload);
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function syncUpdateDeck(uid: string, deck: Deck): Promise<void> {
  const deckId = sanitizeFirestoreId(deck.id, 'deck');
  const path = `users/${uid}/decks/${deckId}`;
  const updateData: Record<string, unknown> = {
    title: clampString(deck.title.trim() || 'Untitled Deck', 120),
    description: clampString(deck.description ?? '', 600),
    category: clampString(deck.category.trim() || 'Custom', 80),
    updatedAt: serverTimestamp(),
  };
  if (deck.type === 'kanji' && (deck.kanjiMode === 'writing' || deck.kanjiMode === 'reading')) {
    updateData.kanjiMode = deck.kanjiMode;
  }
  try {
    await updateDoc(doc(db, 'users', uid, 'decks', deckId), updateData);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function syncDeleteDeck(uid: string, rawDeckId: string): Promise<void> {
  const deckId = sanitizeFirestoreId(rawDeckId, 'deck');
  const cardsPath = `users/${uid}/decks/${deckId}/cards`;
  const deckPath = `users/${uid}/decks/${deckId}`;
  try {
    const cardsSnap = await getDocs(collection(db, 'users', uid, 'decks', deckId, 'cards'));
    const cardDocs = cardsSnap.docs;
    for (let i = 0; i < cardDocs.length; i += 400) {
      const batch = writeBatch(db);
      for (const cDoc of cardDocs.slice(i, i + 400)) {
        batch.delete(cDoc.ref);
      }
      if (i + 400 >= cardDocs.length) {
        batch.delete(doc(db, 'users', uid, 'decks', deckId));
      }
      await batch.commit();
    }
    if (cardDocs.length === 0) {
      await deleteDoc(doc(db, 'users', uid, 'decks', deckId));
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, cardsPath || deckPath);
  }
}

export async function syncCreateCard(
  uid: string,
  rawDeckId: string,
  card: StudyCard
): Promise<void> {
  const deckId = sanitizeFirestoreId(rawDeckId, 'deck');
  const { cardId, payload } = buildCardPayload(uid, deckId, card, true);
  const path = `users/${uid}/decks/${deckId}/cards/${cardId}`;
  try {
    await setDoc(doc(db, 'users', uid, 'decks', deckId, 'cards', cardId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function syncUpdateCardContent(
  uid: string,
  rawDeckId: string,
  card: StudyCard
): Promise<void> {
  const deckId = sanitizeFirestoreId(rawDeckId, 'deck');
  const cardId = sanitizeFirestoreId(card.id, 'card');
  const path = `users/${uid}/decks/${deckId}/cards/${cardId}`;
  const updateData: Record<string, unknown> = {
    kana: clampString(card.kana ?? '', 128),
    meanings: clampStringArray(card.meanings, 30, 120),
    sentences: clampSentences(card.sentences),
    updatedAt: serverTimestamp(),
  };
  if (typeof card.character === 'string' && card.character.length > 0) {
    updateData.character = clampString(card.character, 64);
  }
  if (Array.isArray(card.onyomi)) {
    updateData.onyomi = clampStringArray(card.onyomi, 20, 48);
  }
  if (Array.isArray(card.kunyomi)) {
    updateData.kunyomi = clampStringArray(card.kunyomi, 20, 48);
  }
  if (Array.isArray(card.radicals)) {
    updateData.radicals = clampStringArray(card.radicals, 20, 64);
  }
  if (typeof card.strokeCount === 'number' && Number.isFinite(card.strokeCount)) {
    updateData.strokeCount = Math.max(0, Math.min(64, Math.round(card.strokeCount)));
  }
  if (Array.isArray(card.customSvgPaths)) {
    updateData.customSvgPaths = clampStringArray(card.customSvgPaths, 64, 2048);
  }

  try {
    await updateDoc(doc(db, 'users', uid, 'decks', deckId, 'cards', cardId), updateData);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function syncUpdateCardSrs(
  uid: string,
  rawDeckId: string,
  card: StudyCard
): Promise<void> {
  const deckId = sanitizeFirestoreId(rawDeckId, 'deck');
  const cardId = sanitizeFirestoreId(card.id, 'card');
  const path = `users/${uid}/decks/${deckId}/cards/${cardId}`;
  const updateData: Record<string, unknown> = {
    interval: Math.max(0, Math.min(36500, Number(card.interval) || 0)),
    easeFactor: Math.max(1.0, Math.min(5.0, Number(card.easeFactor) || 2.5)),
    repetitions: Math.max(0, Math.min(10000, Math.round(Number(card.repetitions) || 0))),
    nextReview: Math.max(0, Number(card.nextReview) || Date.now()),
    lapses: Math.max(0, Math.min(100000, Math.round(Number(card.lapses) || 0))),
    correctCount: Math.max(0, Math.min(1000000, Math.round(Number(card.correctCount) || 0))),
    attemptCount: Math.max(0, Math.min(1000000, Math.round(Number(card.attemptCount) || 0))),
    updatedAt: serverTimestamp(),
  };
  if (typeof card.lastReviewed === 'number' && Number.isFinite(card.lastReviewed)) {
    updateData.lastReviewed = Math.max(0, card.lastReviewed);
  }

  try {
    await updateDoc(doc(db, 'users', uid, 'decks', deckId, 'cards', cardId), updateData);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function syncUpdateCardSentences(
  uid: string,
  rawDeckId: string,
  rawCardId: string,
  sentences: ExampleSentence[]
): Promise<void> {
  const deckId = sanitizeFirestoreId(rawDeckId, 'deck');
  const cardId = sanitizeFirestoreId(rawCardId, 'card');
  const path = `users/${uid}/decks/${deckId}/cards/${cardId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'decks', deckId, 'cards', cardId), {
      sentences: clampSentences(sentences),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function syncDeleteCard(
  uid: string,
  rawDeckId: string,
  rawCardId: string
): Promise<void> {
  const deckId = sanitizeFirestoreId(rawDeckId, 'deck');
  const cardId = sanitizeFirestoreId(rawCardId, 'card');
  const path = `users/${uid}/decks/${deckId}/cards/${cardId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'decks', deckId, 'cards', cardId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function syncDailyLog(
  uid: string,
  log: DailyStudyLog,
  knownRemoteLogKeys: Set<string>
): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(log.date)) return;
  const path = `users/${uid}/logs/${log.date}`;
  const logRef = doc(db, 'users', uid, 'logs', log.date);

  try {
    if (!knownRemoteLogKeys.has(log.date)) {
      const existingSnap = await getDoc(logRef);
      if (!existingSnap.exists()) {
        await setDoc(logRef, buildDailyLogPayload(uid, log, true));
        knownRemoteLogKeys.add(log.date);
        return;
      }
      knownRemoteLogKeys.add(log.date);
    }

    await updateDoc(logRef, {
      seconds: Math.max(0, Math.min(86400, Math.round(Number(log.seconds) || 0))),
      cardsReviewed: Math.max(0, Math.min(50000, Math.round(Number(log.cardsReviewed) || 0))),
      strokesAttempted: Math.max(
        0,
        Math.min(500000, Math.round(Number(log.strokesAttempted) || 0))
      ),
      strokesCorrect: Math.max(
        0,
        Math.min(500000, Math.round(Number(log.strokesCorrect) || 0))
      ),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export interface CloudSubscriptionCallbacks {
  onSettings: (settings: UserSettings) => void;
  onDecks: (decks: Deck[]) => void;
  onLogs: (logs: Record<string, DailyStudyLog>, remoteKeys: Set<string>) => void;
  onSynced?: () => void;
}

export function subscribeToUserCloudData(
  uid: string,
  callbacks: CloudSubscriptionCallbacks
): Unsubscribe {
  let disposed = false;

  const userPath = `users/${uid}`;
  const unsubUser = onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (disposed || !snap.exists()) return;
      const data = snap.data();
      if (data.settings && typeof data.settings === 'object') {
        callbacks.onSettings(
          sanitizeSettingsForCloud({ ...DEFAULT_SETTINGS, ...data.settings })
        );
      }
      callbacks.onSynced?.();
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, userPath);
    }
  );

  // Track deck metadata & per-deck card subcollections
  let deckMetas: Array<Omit<Deck, 'cards'>> = [];
  const cardsByDeck = new Map<string, StudyCard[]>();
  const cardUnsubs = new Map<string, Unsubscribe>();

  const emitCombinedDecks = () => {
    if (disposed) return;
    const combined: Deck[] = deckMetas.map((meta) => ({
      ...meta,
      cards: cardsByDeck.get(meta.id) ?? [],
    }));
    callbacks.onDecks(combined);
    callbacks.onSynced?.();
  };

  const decksPath = `users/${uid}/decks`;
  const unsubDecks = onSnapshot(
    collection(db, 'users', uid, 'decks'),
    (snap) => {
      if (disposed) return;
      const nextMetas: Array<Omit<Deck, 'cards'>> = snap.docs.map((dDoc) => {
        const d = dDoc.data();
        const createdAtTs = d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : Date.now();
        return {
          id: typeof d.id === 'string' ? d.id : dDoc.id,
          title: typeof d.title === 'string' ? d.title : 'Untitled Deck',
          description: typeof d.description === 'string' ? d.description : '',
          type: d.type === 'vocab' ? 'vocab' : 'kanji',
          kanjiMode:
            d.type === 'kanji' && (d.kanjiMode === 'reading' || d.kanjiMode === 'writing')
              ? d.kanjiMode
              : undefined,
          category: typeof d.category === 'string' ? d.category : 'Custom',
          createdAt: createdAtTs,
        };
      });

      nextMetas.sort((a, b) => b.createdAt - a.createdAt);
      deckMetas = nextMetas;

      const activeIds = new Set(nextMetas.map((m) => m.id));

      // Unsubscribe removed decks
      for (const [oldDeckId, unsubCard] of cardUnsubs.entries()) {
        if (!activeIds.has(oldDeckId)) {
          unsubCard();
          cardUnsubs.delete(oldDeckId);
          cardsByDeck.delete(oldDeckId);
        }
      }

      // Subscribe newly discovered decks
      for (const meta of nextMetas) {
        if (!cardUnsubs.has(meta.id)) {
          const cardsPath = `users/${uid}/decks/${meta.id}/cards`;
          const unsubCard = onSnapshot(
            collection(db, 'users', uid, 'decks', meta.id, 'cards'),
            (cardsSnap) => {
              if (disposed) return;
              const cards: StudyCard[] = cardsSnap.docs.map((cDoc) => {
                const c = cDoc.data();
                return {
                  id: typeof c.id === 'string' ? c.id : cDoc.id,
                  deckId: typeof c.deckId === 'string' ? c.deckId : meta.id,
                  type: c.type === 'vocab' ? 'vocab' : 'kanji',
                  character: typeof c.character === 'string' ? c.character : undefined,
                  kana: typeof c.kana === 'string' ? c.kana : '',
                  onyomi: Array.isArray(c.onyomi) ? c.onyomi : undefined,
                  kunyomi: Array.isArray(c.kunyomi) ? c.kunyomi : undefined,
                  meanings: Array.isArray(c.meanings) ? c.meanings : [],
                  radicals: Array.isArray(c.radicals) ? c.radicals : undefined,
                  strokeCount: typeof c.strokeCount === 'number' ? c.strokeCount : undefined,
                  customSvgPaths: Array.isArray(c.customSvgPaths)
                    ? c.customSvgPaths
                    : undefined,
                  sentences: Array.isArray(c.sentences) ? c.sentences : [],
                  interval: typeof c.interval === 'number' ? c.interval : 0,
                  easeFactor: typeof c.easeFactor === 'number' ? c.easeFactor : 2.5,
                  repetitions: typeof c.repetitions === 'number' ? c.repetitions : 0,
                  nextReview: typeof c.nextReview === 'number' ? c.nextReview : Date.now(),
                  lapses: typeof c.lapses === 'number' ? c.lapses : 0,
                  correctCount: typeof c.correctCount === 'number' ? c.correctCount : 0,
                  attemptCount: typeof c.attemptCount === 'number' ? c.attemptCount : 0,
                  lastReviewed:
                    typeof c.lastReviewed === 'number' ? c.lastReviewed : undefined,
                };
              });
              cardsByDeck.set(meta.id, cards);
              emitCombinedDecks();
            },
            (error) => {
              handleFirestoreError(error, OperationType.LIST, cardsPath);
            }
          );
          cardUnsubs.set(meta.id, unsubCard);
        }
      }

      emitCombinedDecks();
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, decksPath);
    }
  );

  const logsPath = `users/${uid}/logs`;
  const unsubLogs = onSnapshot(
    collection(db, 'users', uid, 'logs'),
    (snap) => {
      if (disposed) return;
      const logs: Record<string, DailyStudyLog> = {};
      const remoteKeys = new Set<string>();
      for (const lDoc of snap.docs) {
        const l = lDoc.data();
        const dateKey = typeof l.date === 'string' ? l.date : lDoc.id;
        remoteKeys.add(dateKey);
        logs[dateKey] = {
          date: dateKey,
          seconds: typeof l.seconds === 'number' ? l.seconds : 0,
          cardsReviewed: typeof l.cardsReviewed === 'number' ? l.cardsReviewed : 0,
          strokesAttempted:
            typeof l.strokesAttempted === 'number' ? l.strokesAttempted : 0,
          strokesCorrect: typeof l.strokesCorrect === 'number' ? l.strokesCorrect : 0,
        };
      }
      callbacks.onLogs(logs, remoteKeys);
      callbacks.onSynced?.();
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, logsPath);
    }
  );

  return () => {
    disposed = true;
    unsubUser();
    unsubDecks();
    unsubLogs();
    for (const unsubCard of cardUnsubs.values()) {
      unsubCard();
    }
    cardUnsubs.clear();
  };
}
