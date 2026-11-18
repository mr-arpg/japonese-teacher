import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Loader2,
  PauseCircle,
  RotateCw,
  X,
} from 'lucide-react';
import { Deck, ExampleSentence, SessionConfig, SrsGrade, StudyCard } from '../types';
import { generateA1Sentences } from '../utils/dictionaryApi';
import { KanjiStrokeData, loadKanjiVgData } from '../utils/kanjiVg';
import {
  finalizeRomajiToHiragana,
  processHiraganaInputChange,
} from '../utils/romajiToHiragana';
import { formatSentenceForLearnedKanji } from '../utils/sentenceText';
import { isCardDue, previewNextIntervalLabel } from '../utils/srs';
import { KanjiCanvas } from './KanjiCanvas';
import { buildClozeSentence, SentenceList } from './SentenceList';

interface PracticeArenaProps {
  decks: Deck[];
  sessionConfig: SessionConfig | null;
  defaultTracingGuide: boolean;
  learnedKanji: Set<string>;
  onSelectDeckToPractice: (deck: Deck) => void;
  onExitSession: () => void;
  onRecordActiveSecond: () => void;
  onRecordStrokeAttempt: (isCorrect: boolean) => void;
  onGradeCard: (deckId: string, cardId: string, grade: SrsGrade, wasCorrect: boolean) => void;
  onAppendCardSentences: (
    deckId: string,
    cardId: string,
    newSentences: ExampleSentence[]
  ) => void;
}

export const PracticeArena: React.FC<PracticeArenaProps> = ({
  decks,
  sessionConfig,
  defaultTracingGuide,
  learnedKanji,
  onSelectDeckToPractice,
  onExitSession,
  onRecordActiveSecond,
  onRecordStrokeAttempt,
  onGradeCard,
  onAppendCardSentences,
}) => {
  const activeDeck = useMemo(
    () => (sessionConfig ? decks.find((d) => d.id === sessionConfig.deckId) ?? null : null),
    [decks, sessionConfig]
  );

  const isKanjiReadingDeck =
    activeDeck?.type === 'kanji' && activeDeck.kanjiMode === 'reading';
  const isKanjiWritingDeck =
    activeDeck?.type === 'kanji' && (activeDeck.kanjiMode ?? 'writing') === 'writing';

  // Build ordered queue once when sessionConfig changes
  const [queueIds, setQueueIds] = useState<string[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [sessionCompleted, setSessionCompleted] = useState(false);

  // Per-card interaction states
  const [hintRevealed, setHintRevealed] = useState(false);
  const [cardCompleted, setCardCompleted] = useState(false);
  const [cardStrokeAccuracy, setCardStrokeAccuracy] = useState<number | null>(null);
  const [showKanjiSpoiler, setShowKanjiSpoiler] = useState(false);
  const [vocabTypedAnswer, setVocabTypedAnswer] = useState('');
  const [vocabCheckResult, setVocabCheckResult] = useState<'correct' | 'close' | null>(null);
  const [romajiImeEnabled, setRomajiImeEnabled] = useState(true);
  const [showClozeFurigana, setShowClozeFurigana] = useState(false);
  const [generatingSentences, setGeneratingSentences] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // KanjiVG loading state
  const [kanjiStrokes, setKanjiStrokes] = useState<KanjiStrokeData[]>([]);
  const [kanjiLoading, setKanjiLoading] = useState(false);
  const [kanjiError, setKanjiError] = useState<string | null>(null);

  // Active Study Timer (pauses if idle > 60s)
  const [sessionActiveSeconds, setSessionActiveSeconds] = useState(0);
  const [idlePaused, setIdlePaused] = useState(false);
  const lastActivityRef = useRef<number>(Date.now());
  const [sessionCardsDone, setSessionCardsDone] = useState(0);
  const [sessionStrokeAccuracies, setSessionStrokeAccuracies] = useState<number[]>([]);

  // Initialize queue when sessionConfig starts
  useEffect(() => {
    if (!sessionConfig || !activeDeck) {
      setQueueIds([]);
      setCurrentIdx(0);
      setSessionCompleted(false);
      return;
    }

    let cards =
      sessionConfig.cardScope === 'due'
        ? activeDeck.cards.filter((c) => isCardDue(c))
        : [...activeDeck.cards];

    if (cards.length === 0) {
      cards = [...activeDeck.cards];
    }

    if (sessionConfig.shuffle) {
      cards = [...cards].sort(() => Math.random() - 0.5);
    }

    setQueueIds(cards.map((c) => c.id));
    setCurrentIdx(0);
    setSessionCompleted(false);
    setSessionActiveSeconds(0);
    setSessionCardsDone(0);
    setSessionStrokeAccuracies([]);
    lastActivityRef.current = Date.now();
    setIdlePaused(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionConfig]);

  const currentCard: StudyCard | null = useMemo(() => {
    if (!activeDeck || queueIds.length === 0 || currentIdx >= queueIds.length) {
      return null;
    }
    const id = queueIds[currentIdx];
    return activeDeck.cards.find((c) => c.id === id) ?? null;
  }, [activeDeck, queueIds, currentIdx]);

  // Reset per-card state when card changes
  useEffect(() => {
    setHintRevealed(false);
    setCardCompleted(false);
    setCardStrokeAccuracy(null);
    setShowKanjiSpoiler(sessionConfig?.showVocabKanji ?? false);
    setVocabTypedAnswer('');
    setVocabCheckResult(null);
    setShowClozeFurigana(false);
    setGeneratingSentences(false);
    setGenerateError(null);
  }, [currentCard?.id, sessionConfig?.showVocabKanji]);

  // Load KanjiVG strokes only when practicing a Handwriting Kanji deck
  useEffect(() => {
    if (
      !isKanjiWritingDeck ||
      !currentCard ||
      currentCard.type !== 'kanji' ||
      !currentCard.character
    ) {
      setKanjiStrokes([]);
      setKanjiLoading(false);
      setKanjiError(null);
      return;
    }

    let cancelled = false;
    setKanjiLoading(true);
    setKanjiError(null);

    loadKanjiVgData(
      currentCard.character,
      currentCard.customSvgPaths,
      currentCard.radicals
    )
      .then((parsed) => {
        if (!cancelled) {
          setKanjiStrokes(parsed.strokes);
          setKanjiLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setKanjiStrokes([]);
          setKanjiLoading(false);
          setKanjiError(
            err instanceof Error
              ? err.message
              : 'Could not load KanjiVG stroke data for this character.'
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isKanjiWritingDeck, currentCard?.id, currentCard?.character, currentCard?.type]);

  // Idle detection & 1-second active timer
  const markActive = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIdlePaused(false);
  }, []);

  useEffect(() => {
    if (!sessionConfig || sessionCompleted) return;

    const events: Array<keyof WindowEventMap> = [
      'pointerdown',
      'pointermove',
      'keydown',
      'touchstart',
    ];
    events.forEach((ev) => window.addEventListener(ev, markActive, { passive: true }));

    const intervalId = window.setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs > 60_000) {
        setIdlePaused(true);
      } else {
        setIdlePaused(false);
        setSessionActiveSeconds((s) => s + 1);
        onRecordActiveSecond();
      }
    }, 1000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, markActive));
      window.clearInterval(intervalId);
    };
  }, [sessionConfig, sessionCompleted, markActive, onRecordActiveSecond]);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleGrade = (grade: SrsGrade) => {
    if (!activeDeck || !currentCard) return;
    const wasCorrect = grade >= 3;
    onGradeCard(activeDeck.id, currentCard.id, grade, wasCorrect);
    setSessionCardsDone((n) => n + 1);

    if (currentIdx + 1 >= queueIds.length) {
      setSessionCompleted(true);
    } else {
      setCurrentIdx((i) => i + 1);
    }
  };

  const handleVocabTypeCheck = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCard || !sessionConfig) return;

    const shouldConvertHiragana =
      !isKanjiReadingDeck &&
      sessionConfig.promptMode === 'meaning-first' &&
      romajiImeEnabled;
    const resolvedAnswer = shouldConvertHiragana
      ? finalizeRomajiToHiragana(vocabTypedAnswer)
      : vocabTypedAnswer;

    if (shouldConvertHiragana && resolvedAnswer !== vocabTypedAnswer) {
      setVocabTypedAnswer(resolvedAnswer);
    }

    const input = resolvedAnswer.trim().toLowerCase();
    if (!input) return;

    const expectedList =
      isKanjiReadingDeck
        ? currentCard.meanings.map((m) => m.toLowerCase())
        : sessionConfig.promptMode === 'meaning-first'
        ? [currentCard.kana.toLowerCase(), (currentCard.character ?? '').toLowerCase()].filter(Boolean)
        : currentCard.meanings.map((m) => m.toLowerCase());

    const exact = expectedList.some(
      (exp) => exp === input || (exp.length > 3 && exp.includes(input) && input.length >= 3)
    );
    setVocabCheckResult(exact ? 'correct' : 'close');
    setCardCompleted(true);
  };

  const handleGenerateMoreCardSentences = async () => {
    if (!activeDeck || !currentCard) return;
    const target =
      currentCard.type === 'kanji'
        ? currentCard.character || currentCard.kana
        : currentCard.character || currentCard.kana;
    setGeneratingSentences(true);
    setGenerateError(null);
    try {
      const generated = await generateA1Sentences({
        target,
        meanings: currentCard.meanings,
        readings:
          currentCard.type === 'kanji'
            ? [...(currentCard.kunyomi ?? []), ...(currentCard.onyomi ?? [])]
            : [currentCard.kana],
        count: 3,
        learnedKanji: Array.from(learnedKanji),
        excludeSentences: currentCard.sentences.map((s) => s.japanese),
      });
      if (generated.length > 0) {
        onAppendCardSentences(activeDeck.id, currentCard.id, generated);
      }
    } catch (err: unknown) {
      setGenerateError(
        err instanceof Error ? err.message : 'Unable to generate A1 sentences.'
      );
    } finally {
      setGeneratingSentences(false);
    }
  };

  // Empty state if user clicked Practice Arena tab directly without starting a deck
  if (!sessionConfig || !activeDeck) {
    return (
      <div className="mx-auto max-w-3xl py-8 space-y-6">
        <div className="border-b border-zinc-200/80 dark:border-zinc-800 pb-5">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Practice Arena
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Choose a deck below to configure your prompt mode (Meaning First or Reading First) and start a focused study session.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {decks.map((deck) => {
            const due = deck.cards.filter((c) => isCardDue(c)).length;
            return (
              <button
                key={deck.id}
                type="button"
                disabled={deck.cards.length === 0}
                onClick={() => onSelectDeckToPractice(deck)}
                className="text-left rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] p-5 hover:border-emerald-600 dark:hover:border-emerald-500 transition-colors disabled:opacity-40 cursor-pointer"
              >
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {deck.type === 'kanji'
                    ? deck.kanjiMode === 'reading'
                      ? 'Kanji Reading Recall'
                      : 'Kanji Handwriting'
                    : 'Kana Vocabulary'}{' '}
                  · <span className="font-mono-num">{due} due</span>
                </div>
                <div className="mt-1.5 text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {deck.title}
                </div>
                <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 font-mono-num">
                  {deck.cards.length} cards total
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Session Completed Summary
  if (sessionCompleted) {
    const avgStrokeAcc =
      sessionStrokeAccuracies.length > 0
        ? Math.round(
            sessionStrokeAccuracies.reduce((a, b) => a + b, 0) /
              sessionStrokeAccuracies.length
          )
        : null;

    return (
      <div className="mx-auto max-w-xl py-10">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] p-8 text-center space-y-6">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
          </div>

          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              Session Complete
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {activeDeck.title}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 border-y border-zinc-200/80 dark:border-zinc-800 py-5">
            <div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Cards Studied</div>
              <div className="mt-1 font-mono-num text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                {sessionCardsDone}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Active Time</div>
              <div className="mt-1 font-mono-num text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                {formatTimer(sessionActiveSeconds)}
              </div>
            </div>
            {avgStrokeAcc !== null && (
              <div className="col-span-2 sm:col-span-1">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Stroke Accuracy</div>
                <div className="mt-1 font-mono-num text-xl font-semibold text-emerald-700 dark:text-emerald-400">
                  {avgStrokeAcc}%
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onExitSession}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
            >
              Return to Decks
            </button>
            <button
              type="button"
              onClick={() => onSelectDeckToPractice(activeDeck)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
              Practice Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentCard) return null;

  const isMeaningFirst = sessionConfig.promptMode === 'meaning-first';
  const primaryCloze =
    sessionConfig.contextMode && currentCard.sentences.length > 0
      ? buildClozeSentence(
          currentCard.sentences[0],
          currentCard.type === 'kanji' ? currentCard.character : currentCard.kana,
          learnedKanji
        )
      : null;

  const progressPct = Math.round(((currentIdx + (cardCompleted ? 1 : 0)) / queueIds.length) * 100);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Top Focus Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200/80 dark:border-zinc-800 pb-4">
        <div className="flex items-center gap-3 text-xs text-zinc-600 dark:text-zinc-400">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            {activeDeck.title}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {isKanjiReadingDeck
              ? isMeaningFirst
                ? 'Kanji → Meaning'
                : 'Kanji + Reading → Meaning'
              : isMeaningFirst
              ? 'Meaning First'
              : 'Reading First'}
          </span>
          {sessionConfig.contextMode && (
            <>
              <span aria-hidden="true">·</span>
              <span>Context Cloze</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 font-mono-num text-xs text-zinc-600 dark:text-zinc-300">
            <Clock className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
            <span>{formatTimer(sessionActiveSeconds)}</span>
          </div>

          <span className="font-mono-num text-xs text-zinc-500 dark:text-zinc-400">
            {currentIdx + 1} / {queueIds.length}
          </span>

          <button
            type="button"
            onClick={onExitSession}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            End
          </button>
        </div>
      </div>

      {/* Linear Progress Line */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-full bg-emerald-600 dark:bg-emerald-500 transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Idle Auto-Pause Notice */}
      {idlePaused && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs font-medium text-amber-800 dark:text-amber-300"
        >
          <div className="flex items-center gap-2">
            <PauseCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Study timer paused after 60s of inactivity. Move pointer or tap to resume.</span>
          </div>
          <button
            type="button"
            onClick={markActive}
            className="font-semibold underline cursor-pointer shrink-0"
          >
            Resume
          </button>
        </div>
      )}

      {/* Main Arena Layout */}
      {isKanjiWritingDeck && currentCard.type === 'kanji' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Zone: Prompt Card & Progressive Reveal / Answer Details */}
          <div className="lg:col-span-5 space-y-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] p-6">
            <div>
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {isMeaningFirst
                  ? 'Write the Kanji for this meaning'
                  : 'Write the Kanji for this reading'}
              </div>

              {isMeaningFirst ? (
                <div className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
                  {currentCard.meanings.join(', ')}
                </div>
              ) : (
                <div className="font-jp mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
                  {currentCard.kana}
                </div>
              )}

              {/* Progressive Reveal Button (non-spoiling secondary clue) */}
              {!cardCompleted && (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setHintRevealed((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-[#FAF9F6] dark:bg-[#121316] px-3.5 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:border-emerald-600 transition-colors cursor-pointer"
                  >
                    {hintRevealed ? (
                      <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {isMeaningFirst
                      ? hintRevealed
                        ? 'Hide Reading'
                        : 'Reveal Reading'
                      : hintRevealed
                      ? 'Hide Meaning'
                      : 'Reveal Meaning'}
                  </button>

                  {hintRevealed && (
                    <div className="mt-3 rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-[#121316] px-3.5 py-2.5 text-sm">
                      {isMeaningFirst ? (
                        <span className="font-jp text-zinc-800 dark:text-zinc-200">
                          Reading: {currentCard.kana}
                        </span>
                      ) : (
                        <span className="text-zinc-800 dark:text-zinc-200">
                          Meaning: {currentCard.meanings.join(', ')}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Optional Context Cloze Sentence */}
            {primaryCloze && !cardCompleted && (
              <div className="border-t border-zinc-200/80 dark:border-zinc-800 pt-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    Context Sentence (Cloze)
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowClozeFurigana((v) => !v)}
                    className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    {showClozeFurigana ? 'Hide Furigana' : 'Show Furigana'}
                  </button>
                </div>
                <p className="font-jp text-base text-zinc-900 dark:text-zinc-100 leading-relaxed">
                  {primaryCloze.maskedJapanese}
                </p>
                {showClozeFurigana && primaryCloze.maskedFurigana && (
                  <p className="font-jp text-xs text-zinc-500 dark:text-zinc-400">
                    {primaryCloze.maskedFurigana}
                  </p>
                )}
                <p className="text-xs text-zinc-600 dark:text-zinc-300">
                  <span className="font-medium text-zinc-500 dark:text-zinc-400 mr-1">
                    Translation:
                  </span>
                  {currentCard.sentences[0].english}
                </p>
              </div>
            )}

            {/* Radical / Metadata Breakdown */}
            {currentCard.radicals && currentCard.radicals.length > 0 && (
              <div className="border-t border-zinc-200/80 dark:border-zinc-800 pt-4 text-xs text-zinc-500 dark:text-zinc-400">
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                  Components:{' '}
                </span>
                <span className="font-jp">{currentCard.radicals.join(' · ')}</span>
              </div>
            )}

            {/* Post-Completion Reveal & SRS Grading */}
            {cardCompleted && (
              <div className="border-t border-zinc-200/80 dark:border-zinc-800 pt-4 space-y-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-baseline gap-3">
                    <span className="font-jp text-4xl font-semibold text-zinc-900 dark:text-zinc-100">
                      {currentCard.character}
                    </span>
                    <div className="text-xs text-zinc-600 dark:text-zinc-300 space-y-0.5">
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {currentCard.meanings.join(', ')}
                      </div>
                      <div className="font-jp">{currentCard.kana}</div>
                    </div>
                  </div>
                  {cardStrokeAccuracy !== null && (
                    <div className="text-right">
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        Accuracy
                      </div>
                      <div className="font-mono-num text-base font-semibold text-emerald-700 dark:text-emerald-400">
                        {cardStrokeAccuracy}%
                      </div>
                    </div>
                  )}
                </div>

                <SentenceList
                  sentences={currentCard.sentences}
                  highlightTerm={currentCard.character}
                  learnedKanji={learnedKanji}
                  onGenerateSentences={handleGenerateMoreCardSentences}
                  generatingSentences={generatingSentences}
                  generateError={generateError}
                  compact
                />

                <div className="space-y-2 pt-2">
                  <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    Rate Recall & Schedule Next Review
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {(
                      [
                        { grade: 1 as SrsGrade, label: 'Again', tone: 'text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/30' },
                        { grade: 2 as SrsGrade, label: 'Hard', tone: 'text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/60 hover:bg-amber-50 dark:hover:bg-amber-950/30' },
                        { grade: 3 as SrsGrade, label: 'Good', tone: 'text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/30' },
                        { grade: 4 as SrsGrade, label: 'Easy', tone: 'text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-900/60 hover:bg-sky-50 dark:hover:bg-sky-950/30' },
                      ]
                    ).map((btn) => (
                      <button
                        key={btn.grade}
                        type="button"
                        onClick={() => handleGrade(btn.grade)}
                        className={`rounded-lg border px-2 py-2 text-center transition-colors cursor-pointer ${btn.tone}`}
                      >
                        <div className="text-xs font-semibold">{btn.label}</div>
                        <div className="font-mono-num text-[10px] opacity-80 mt-0.5">
                          {previewNextIntervalLabel(currentCard, btn.grade)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Zone: Genkouyoushi Real-Time Handwriting Canvas */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-[#16181D] p-6">
            {kanjiLoading ? (
              <div className="flex h-[340px] flex-col items-center justify-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-600" aria-hidden="true" />
                <span>Loading KanjiVG stroke order...</span>
              </div>
            ) : kanjiError ? (
              <div className="flex h-[340px] max-w-sm flex-col items-center justify-center gap-3 text-center">
                <AlertCircle className="h-6 w-6 text-red-500" aria-hidden="true" />
                <p className="text-sm text-zinc-700 dark:text-zinc-300">{kanjiError}</p>
                <button
                  type="button"
                  onClick={() => {
                    setCardCompleted(true);
                    setCardStrokeAccuracy(100);
                  }}
                  className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-semibold text-white dark:text-zinc-950 cursor-pointer"
                >
                  Reveal Card & Continue
                </button>
              </div>
            ) : (
              <KanjiCanvas
                character={currentCard.character || ''}
                strokes={kanjiStrokes}
                defaultTracingGuide={defaultTracingGuide}
                onStrokeAttempt={onRecordStrokeAttempt}
                onComplete={(acc) => {
                  setCardCompleted(true);
                  setCardStrokeAccuracy(acc);
                  setSessionStrokeAccuracies((prev) => [...prev, acc]);
                }}
              />
            )}
          </div>
        </div>
      ) : isKanjiReadingDeck && currentCard.type === 'kanji' ? (
        /* Kanji Active Recall Reading Mode: See written Kanji, recall meaning */
        <div className="mx-auto max-w-2xl rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] p-6 sm:p-8 space-y-6">
          <div className="space-y-3 text-center sm:text-left">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Recall the English meaning for this Kanji
            </div>

            <div className="flex flex-col sm:flex-row sm:items-baseline gap-3 sm:gap-5 py-1">
              <div className="font-jp text-6xl sm:text-7xl font-medium text-zinc-900 dark:text-zinc-100 leading-none">
                {currentCard.character}
              </div>

              {!isMeaningFirst && (
                <div className="space-y-1 text-sm text-zinc-600 dark:text-zinc-300">
                  <div className="font-jp font-medium text-zinc-900 dark:text-zinc-100">
                    {currentCard.kana}
                  </div>
                  {(currentCard.onyomi?.length || currentCard.kunyomi?.length) && (
                    <div className="font-jp text-xs text-zinc-500 dark:text-zinc-400 flex flex-wrap justify-center sm:justify-start gap-2">
                      {currentCard.onyomi && currentCard.onyomi.length > 0 && (
                        <span>On: {currentCard.onyomi.join('・')}</span>
                      )}
                      {currentCard.kunyomi && currentCard.kunyomi.length > 0 && (
                        <span>Kun: {currentCard.kunyomi.join('・')}</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Optional progressive Reveal Reading clue in Mode A */}
            {isMeaningFirst && !cardCompleted && (
              <div className="pt-1 flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                <button
                  type="button"
                  onClick={() => setHintRevealed((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-[#FAF9F6] dark:bg-[#121316] px-3.5 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:border-emerald-600 transition-colors cursor-pointer"
                >
                  {hintRevealed ? (
                    <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {hintRevealed ? 'Hide Reading' : 'Reveal Reading'}
                </button>

                {hintRevealed && (
                  <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400 font-jp">
                    {currentCard.kana}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Optional Context Example Sentence (keeps English translation hidden until reveal so meaning isn't spoiled) */}
          {sessionConfig.contextMode && currentCard.sentences.length > 0 && !cardCompleted && (
            <div className="rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-[#121316] p-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  Context Sentence
                </span>
                <button
                  type="button"
                  onClick={() => setShowClozeFurigana((v) => !v)}
                  className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  {showClozeFurigana ? 'Hide Furigana' : 'Show Furigana'}
                </button>
              </div>
              <p className="font-jp text-base text-zinc-900 dark:text-zinc-100">
                {
                  formatSentenceForLearnedKanji(
                    currentCard.sentences[0],
                    learnedKanji,
                    true
                  ).displayJapanese
                }
              </p>
              {showClozeFurigana && currentCard.sentences[0].furigana && (
                <p className="font-jp text-xs text-zinc-500 dark:text-zinc-400">
                  {currentCard.sentences[0].furigana}
                </p>
              )}
            </div>
          )}

          {/* Active Recall Input or Flip */}
          {!cardCompleted ? (
            <form
              onSubmit={handleVocabTypeCheck}
              className="space-y-3 border-t border-zinc-200/80 dark:border-zinc-800 pt-5"
            >
              <label
                htmlFor="kanji-reading-recall-input"
                className="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
              >
                Type the English meaning (optional) or flip card to self-grade
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  id="kanji-reading-recall-input"
                  type="text"
                  value={vocabTypedAnswer}
                  onChange={(e) => setVocabTypedAnswer(e.target.value)}
                  placeholder="e.g., forest, mountain, water"
                  className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-[#121316] px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:border-emerald-600 focus:outline-none"
                />
                {vocabTypedAnswer.trim() ? (
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Check Answer
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCardCompleted(true)}
                    className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-5 py-2.5 text-xs font-semibold text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Show Answer
                  </button>
                )}
              </div>
            </form>
          ) : (
            <div className="border-t border-zinc-200/80 dark:border-zinc-800 pt-5 space-y-5">
              {vocabCheckResult && (
                <div
                  className={`flex items-center gap-2 text-xs font-medium ${
                    vocabCheckResult === 'correct'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {vocabCheckResult === 'correct' ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>Exact match for &quot;{vocabTypedAnswer}&quot;</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>
                        You typed &quot;{vocabTypedAnswer}&quot; — compare with the answer below.
                      </span>
                    </>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                  {currentCard.meanings.join(', ')}
                </div>
                <div className="font-jp text-sm text-zinc-700 dark:text-zinc-300">
                  {currentCard.kana}
                </div>
                {(currentCard.onyomi?.length ||
                  currentCard.kunyomi?.length ||
                  currentCard.strokeCount ||
                  currentCard.radicals?.length) && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 pt-0.5">
                    {currentCard.onyomi && currentCard.onyomi.length > 0 && (
                      <span className="font-jp">On: {currentCard.onyomi.join('・')}</span>
                    )}
                    {currentCard.kunyomi && currentCard.kunyomi.length > 0 && (
                      <>
                        {currentCard.onyomi && currentCard.onyomi.length > 0 && (
                          <span aria-hidden="true">·</span>
                        )}
                        <span className="font-jp">Kun: {currentCard.kunyomi.join('・')}</span>
                      </>
                    )}
                    {currentCard.strokeCount ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-num">{currentCard.strokeCount} strokes</span>
                      </>
                    ) : null}
                    {currentCard.radicals && currentCard.radicals.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-jp">
                          Components: {currentCard.radicals.join(' · ')}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>

              <SentenceList
                sentences={currentCard.sentences}
                highlightTerm={currentCard.character}
                learnedKanji={learnedKanji}
                onGenerateSentences={handleGenerateMoreCardSentences}
                generatingSentences={generatingSentences}
                generateError={generateError}
              />

              <div className="space-y-2 pt-2">
                <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Rate Recall &amp; Schedule Next Review
                </div>
                <div className="grid grid-cols-4 gap-2.5">
                  {(
                    [
                      {
                        grade: 1 as SrsGrade,
                        label: 'Again',
                        tone: 'text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/30',
                      },
                      {
                        grade: 2 as SrsGrade,
                        label: 'Hard',
                        tone: 'text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/60 hover:bg-amber-50 dark:hover:bg-amber-950/30',
                      },
                      {
                        grade: 3 as SrsGrade,
                        label: 'Good',
                        tone: 'text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/30',
                      },
                      {
                        grade: 4 as SrsGrade,
                        label: 'Easy',
                        tone: 'text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-900/60 hover:bg-sky-50 dark:hover:bg-sky-950/30',
                      },
                    ]
                  ).map((btn) => (
                    <button
                      key={btn.grade}
                      type="button"
                      onClick={() => handleGrade(btn.grade)}
                      className={`rounded-lg border px-3 py-2.5 text-center transition-colors cursor-pointer ${btn.tone}`}
                    >
                      <div className="text-xs font-semibold">{btn.label}</div>
                      <div className="font-mono-num text-[11px] opacity-80 mt-0.5">
                        {previewNextIntervalLabel(currentCard, btn.grade)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Vocabulary Kana-Only Active Recall Mode */
        <div className="mx-auto max-w-2xl rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] p-6 sm:p-8 space-y-6">
          <div className="space-y-2">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {isMeaningFirst
                ? 'Recall the Hiragana / Katakana reading'
                : 'Recall the English meaning'}
            </div>

            {isMeaningFirst ? (
              <h2 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100">
                {currentCard.meanings.join(', ')}
              </h2>
            ) : (
              <h2 className="font-jp text-3xl sm:text-4xl font-semibold text-zinc-900 dark:text-zinc-100">
                {currentCard.kana}
              </h2>
            )}

            {/* Progressive Reveal Clue */}
            {!cardCompleted && (
              <div className="pt-2 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setHintRevealed((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-[#FAF9F6] dark:bg-[#121316] px-3.5 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:border-emerald-600 transition-colors cursor-pointer"
                >
                  {hintRevealed ? (
                    <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {isMeaningFirst
                    ? hintRevealed
                      ? 'Hide Reading'
                      : 'Reveal Reading'
                    : hintRevealed
                    ? 'Hide Meaning'
                    : 'Reveal Meaning'}
                </button>

                {hintRevealed && (
                  <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400 font-jp">
                    {isMeaningFirst
                      ? currentCard.kana
                      : currentCard.meanings.join(', ')}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Context Cloze Sentence */}
          {primaryCloze && !cardCompleted && (
            <div className="rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-[#121316] p-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  Practice in Context (Cloze)
                </span>
                <button
                  type="button"
                  onClick={() => setShowClozeFurigana((v) => !v)}
                  className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  {showClozeFurigana ? 'Hide Furigana' : 'Show Furigana'}
                </button>
              </div>
              <p className="font-jp text-base text-zinc-900 dark:text-zinc-100">
                {primaryCloze.maskedJapanese}
              </p>
              {showClozeFurigana && primaryCloze.maskedFurigana && (
                <p className="font-jp text-xs text-zinc-500 dark:text-zinc-400">
                  {primaryCloze.maskedFurigana}
                </p>
              )}
              <p className="text-xs text-zinc-600 dark:text-zinc-300">
                <span className="font-medium text-zinc-500 dark:text-zinc-400 mr-1">
                  Translation:
                </span>
                {currentCard.sentences[0].english}
              </p>
            </div>
          )}

          {/* Active Recall Input or Flip */}
          {!cardCompleted ? (
            <form onSubmit={handleVocabTypeCheck} className="space-y-3 border-t border-zinc-200/80 dark:border-zinc-800 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="vocab-recall-input"
                  className="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
                >
                  {isMeaningFirst
                    ? 'Type the Hiragana reading (optional) or flip card to self-grade'
                    : 'Type the English meaning (optional) or flip card to self-grade'}
                </label>
                {isMeaningFirst && (
                  <button
                    type="button"
                    onClick={() => setRomajiImeEnabled((v) => !v)}
                    className={`rounded border px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                      romajiImeEnabled
                        ? 'border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400'
                    }`}
                  >
                    Romaji → あ: {romajiImeEnabled ? 'On' : 'Off'}
                  </button>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  id="vocab-recall-input"
                  type="text"
                  value={vocabTypedAnswer}
                  onChange={(e) => {
                    if (isMeaningFirst) {
                      const native = e.nativeEvent as InputEvent;
                      processHiraganaInputChange(
                        e.currentTarget,
                        e.target.value,
                        Boolean(native.isComposing),
                        romajiImeEnabled,
                        setVocabTypedAnswer
                      );
                    } else {
                      setVocabTypedAnswer(e.target.value);
                    }
                  }}
                  onCompositionEnd={(e) => {
                    if (isMeaningFirst && romajiImeEnabled) {
                      processHiraganaInputChange(
                        e.currentTarget,
                        e.currentTarget.value,
                        false,
                        true,
                        setVocabTypedAnswer
                      );
                    }
                  }}
                  placeholder={
                    isMeaningFirst
                      ? romajiImeEnabled
                        ? 'e.g., たべる (type taberu → たべる)'
                        : 'e.g., たべる'
                      : 'e.g., to eat'
                  }
                  className="font-jp flex-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-[#121316] px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:border-emerald-600 focus:outline-none"
                />
                {vocabTypedAnswer.trim() ? (
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Check Answer
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCardCompleted(true)}
                    className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-5 py-2.5 text-xs font-semibold text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Show Answer
                  </button>
                )}
              </div>
            </form>
          ) : (
            <div className="border-t border-zinc-200/80 dark:border-zinc-800 pt-5 space-y-5">
              {vocabCheckResult && (
                <div
                  className={`flex items-center gap-2 text-xs font-medium ${
                    vocabCheckResult === 'correct'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {vocabCheckResult === 'correct' ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>Exact match for "{vocabTypedAnswer}"</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>You typed "{vocabTypedAnswer}" — compare with the answer below.</span>
                    </>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-baseline justify-between gap-4">
                <div>
                  <div className="font-jp text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                    {currentCard.kana}
                    {showKanjiSpoiler && currentCard.character && (
                      <span className="ml-3 text-lg font-normal text-zinc-500 dark:text-zinc-400">
                        ({currentCard.character})
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-base font-medium text-zinc-700 dark:text-zinc-300">
                    {currentCard.meanings.join(', ')}
                  </div>
                </div>

                {currentCard.character && (
                  <button
                    type="button"
                    onClick={() => setShowKanjiSpoiler((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
                  >
                    {showKanjiSpoiler ? 'Hide Kanji' : 'Show Kanji'}
                  </button>
                )}
              </div>

              <SentenceList
                sentences={currentCard.sentences}
                highlightTerm={currentCard.kana}
                learnedKanji={learnedKanji}
                onGenerateSentences={handleGenerateMoreCardSentences}
                generatingSentences={generatingSentences}
                generateError={generateError}
              />

              <div className="space-y-2 pt-2">
                <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Rate Recall & Schedule Next Review
                </div>
                <div className="grid grid-cols-4 gap-2.5">
                  {(
                    [
                      { grade: 1 as SrsGrade, label: 'Again', tone: 'text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/30' },
                      { grade: 2 as SrsGrade, label: 'Hard', tone: 'text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/60 hover:bg-amber-50 dark:hover:bg-amber-950/30' },
                      { grade: 3 as SrsGrade, label: 'Good', tone: 'text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/30' },
                      { grade: 4 as SrsGrade, label: 'Easy', tone: 'text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-900/60 hover:bg-sky-50 dark:hover:bg-sky-950/30' },
                    ]
                  ).map((btn) => (
                    <button
                      key={btn.grade}
                      type="button"
                      onClick={() => handleGrade(btn.grade)}
                      className={`rounded-lg border px-3 py-2.5 text-center transition-colors cursor-pointer ${btn.tone}`}
                    >
                      <div className="text-xs font-semibold">{btn.label}</div>
                      <div className="font-mono-num text-[11px] opacity-80 mt-0.5">
                        {previewNextIntervalLabel(currentCard, btn.grade)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
