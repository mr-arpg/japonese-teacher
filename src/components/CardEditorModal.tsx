import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { DeckType, ExampleSentence, StudyCard } from '../types';
import { generateA1Sentences } from '../utils/dictionaryApi';
import { fetchKanjiInfo } from '../utils/kanjiApi';
import { loadKanjiVgData } from '../utils/kanjiVg';
import {
  finalizeRomajiToHiragana,
  processHiraganaInputChange,
} from '../utils/romajiToHiragana';

interface CardEditorModalProps {
  deckId: string;
  deckType: DeckType;
  existingCard?: StudyCard;
  onClose: () => void;
  onSave: (card: StudyCard) => void;
}

export const CardEditorModal: React.FC<CardEditorModalProps> = ({
  deckId,
  deckType,
  existingCard,
  onClose,
  onSave,
}) => {
  const [character, setCharacter] = useState(existingCard?.character ?? '');
  const [kana, setKana] = useState(existingCard?.kana ?? '');
  const [onyomiInput, setOnyomiInput] = useState(existingCard?.onyomi?.join(', ') ?? '');
  const [kunyomiInput, setKunyomiInput] = useState(existingCard?.kunyomi?.join(', ') ?? '');
  const [meaningsInput, setMeaningsInput] = useState(
    existingCard?.meanings.join(', ') ?? ''
  );
  const [radicalsInput, setRadicalsInput] = useState(
    existingCard?.radicals?.join(', ') ?? ''
  );
  const [strokeCount, setStrokeCount] = useState<number | undefined>(
    existingCard?.strokeCount
  );
  const [svgPaths, setSvgPaths] = useState<string[]>(
    existingCard?.customSvgPaths ?? []
  );
  const [sentences, setSentences] = useState<ExampleSentence[]>(
    existingCard?.sentences && existingCard.sentences.length > 0
      ? existingCard.sentences
      : [
          {
            id: `sent-${Date.now()}-1`,
            japanese: '',
            furigana: '',
            english: '',
            targetHighlight: '',
          },
          {
            id: `sent-${Date.now()}-2`,
            japanese: '',
            furigana: '',
            english: '',
            targetHighlight: '',
          },
        ]
  );

  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupStatus, setLookupStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [genSentencesLoading, setGenSentencesLoading] = useState(false);
  const [genSentencesError, setGenSentencesError] = useState<string | null>(null);
  const [romajiImeEnabled, setRomajiImeEnabled] = useState(true);

  const handleAutoFillKanji = async () => {
    const trimmed = Array.from(character.trim())[0];
    if (!trimmed) {
      setLookupStatus({
        type: 'error',
        message: 'Enter a single Kanji character first.',
      });
      return;
    }

    setLookupLoading(true);
    setLookupStatus(null);

    try {
      const [apiRes, vgRes] = await Promise.allSettled([
        fetchKanjiInfo(trimmed),
        loadKanjiVgData(trimmed),
      ]);

      let loadedParts = 0;

      if (apiRes.status === 'fulfilled') {
        const info = apiRes.value;
        setCharacter(info.kanji);
        if (info.meanings.length > 0) setMeaningsInput(info.meanings.join(', '));
        if (info.onyomi.length > 0) setOnyomiInput(info.onyomi.join(', '));
        if (info.kunyomi.length > 0) setKunyomiInput(info.kunyomi.join(', '));
        const combined = [
          info.onyomi.join(', '),
          info.kunyomi.join(', '),
        ]
          .filter(Boolean)
          .join(' / ');
        if (combined) setKana(combined);
        if (info.strokeCount) setStrokeCount(info.strokeCount);
        if (info.sentences.length > 0) setSentences(info.sentences);
        loadedParts += 1;
      }

      if (vgRes.status === 'fulfilled') {
        const vg = vgRes.value;
        setSvgPaths(vg.rawPaths);
        if (vg.strokes.length > 0) {
          setStrokeCount(vg.strokes.length);
        }
        if (vg.radicals.length > 0) {
          setRadicalsInput(vg.radicals.join(', '));
        }
        loadedParts += 1;
      }

      if (loadedParts === 2) {
        setLookupStatus({
          type: 'success',
          message: 'Auto-populated readings, meanings, stroke paths, and sentences.',
        });
      } else if (loadedParts === 1) {
        setLookupStatus({
          type: 'success',
          message: 'Partially populated from available source. Review fields below.',
        });
      } else {
        setLookupStatus({
          type: 'error',
          message: 'Could not reach KanjiAPI.dev or KanjiVG. You can enter details manually.',
        });
      }
    } finally {
      setLookupLoading(false);
    }
  };

  const updateSentence = (
    idx: number,
    field: keyof ExampleSentence,
    value: string
  ) => {
    setSentences((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s))
    );
  };

  const addSentenceRow = () => {
    setSentences((prev) => [
      ...prev,
      {
        id: `sent-${Date.now()}-${prev.length}`,
        japanese: '',
        furigana: '',
        english: '',
        targetHighlight: '',
      },
    ]);
  };

  const removeSentenceRow = (idx: number) => {
    setSentences((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleGenerateCardSentences = async () => {
    const target =
      deckType === 'kanji'
        ? Array.from(character.trim())[0] || ''
        : character.trim() || kana.trim();
    if (!target) {
      setGenSentencesError(
        deckType === 'kanji'
          ? 'Enter a Kanji character first.'
          : 'Enter a Kana or Kanji word first.'
      );
      return;
    }

    setGenSentencesLoading(true);
    setGenSentencesError(null);
    const meanings = meaningsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const readings =
      deckType === 'kanji'
        ? [...onyomiInput.split(','), ...kunyomiInput.split(',')]
            .map((s) => s.trim())
            .filter(Boolean)
        : [kana.trim()].filter(Boolean);

    try {
      const generated = await generateA1Sentences({
        target,
        meanings,
        readings,
        count: 3,
        excludeSentences: sentences.map((s) => s.japanese).filter(Boolean),
      });
      if (generated.length > 0) {
        setSentences((prev) => {
          const nonEmpty = prev.filter((s) => s.japanese.trim() || s.english.trim());
          return [...nonEmpty, ...generated];
        });
      }
    } catch (err: unknown) {
      setGenSentencesError(
        err instanceof Error ? err.message : 'Unable to generate A1 sentences.'
      );
    } finally {
      setGenSentencesLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const meanings = meaningsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (meanings.length === 0) return;

    const resolvedKunyomiInput = romajiImeEnabled
      ? finalizeRomajiToHiragana(kunyomiInput)
      : kunyomiInput;
    const resolvedVocabKanaInput = romajiImeEnabled
      ? finalizeRomajiToHiragana(kana)
      : kana;

    const onyomi = onyomiInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const kunyomi = resolvedKunyomiInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const radicals = radicalsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const cleanedSentences = sentences
      .filter((s) => s.japanese.trim() && s.english.trim())
      .map((s) => {
        const finalFurigana = romajiImeEnabled
          ? finalizeRomajiToHiragana(s.furigana)
          : s.furigana;
        return {
          ...s,
          japanese: s.japanese.trim(),
          furigana: finalFurigana.trim(),
          english: s.english.trim(),
          targetHighlight:
            s.targetHighlight?.trim() ||
            (deckType === 'kanji' ? character.trim() : resolvedVocabKanaInput.trim()),
        };
      });

    const resolvedKana =
      resolvedVocabKanaInput.trim() ||
      [onyomi.join(', '), kunyomi.join(', ')].filter(Boolean).join(' / ');

    const now = Date.now();
    const card: StudyCard = {
      id: existingCard?.id ?? `card-${now}-${Math.random().toString(36).slice(2, 7)}`,
      deckId,
      type: deckType,
      character: character.trim() || undefined,
      kana: resolvedKana,
      onyomi: deckType === 'kanji' ? onyomi : undefined,
      kunyomi: deckType === 'kanji' ? kunyomi : undefined,
      meanings,
      radicals: deckType === 'kanji' ? radicals : undefined,
      strokeCount:
        deckType === 'kanji'
          ? svgPaths.length > 0
            ? svgPaths.length
            : strokeCount
          : undefined,
      customSvgPaths: deckType === 'kanji' && svgPaths.length > 0 ? svgPaths : undefined,
      sentences: cleanedSentences,
      interval: existingCard?.interval ?? 0,
      easeFactor: existingCard?.easeFactor ?? 2.5,
      repetitions: existingCard?.repetitions ?? 0,
      nextReview: existingCard?.nextReview ?? now,
      lapses: existingCard?.lapses ?? 0,
      correctCount: existingCard?.correctCount ?? 0,
      attemptCount: existingCard?.attemptCount ?? 0,
      lastReviewed: existingCard?.lastReviewed,
    };

    onSave(card);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="card-editor-title"
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-[#16181D] shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200/80 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-[#16181D] px-6 py-4">
          <h2
            id="card-editor-title"
            className="text-base font-semibold text-zinc-900 dark:text-zinc-100"
          >
            {existingCard
              ? `Edit ${deckType === 'kanji' ? 'Kanji' : 'Vocabulary'} Card`
              : `Add ${deckType === 'kanji' ? 'Kanji' : 'Vocabulary'} Card`}
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRomajiImeEnabled((v) => !v)}
              className={`rounded border px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                romajiImeEnabled
                  ? 'border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400'
              }`}
            >
              Romaji → あ: {romajiImeEnabled ? 'On' : 'Off'}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close card editor"
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {deckType === 'kanji' ? (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="w-full sm:w-32">
                  <label
                    htmlFor="kanji-char"
                    className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5"
                  >
                    Kanji Character
                  </label>
                  <input
                    id="kanji-char"
                    type="text"
                    required
                    maxLength={2}
                    value={character}
                    onChange={(e) => setCharacter(e.target.value)}
                    placeholder="森"
                    className="font-jp w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1C1E24] px-3 py-2 text-center text-2xl font-medium text-zinc-900 dark:text-zinc-100 focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleAutoFillKanji}
                  disabled={lookupLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-xs font-semibold text-white transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {lookupLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Auto-Fill from KanjiAPI & KanjiVG
                </button>

                {svgPaths.length > 0 && (
                  <div className="flex items-center gap-2.5 sm:ml-auto">
                    <svg
                      viewBox="0 0 109 109"
                      className="h-12 w-12 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1C1E24] p-1"
                    >
                      <g
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="4.5"
                        className="stroke-zinc-900 dark:stroke-zinc-100"
                      >
                        {svgPaths.map((d, idx) => (
                          <path key={idx} d={d} />
                        ))}
                      </g>
                    </svg>
                    <span className="font-mono-num text-xs text-zinc-500 dark:text-zinc-400">
                      {svgPaths.length} strokes
                    </span>
                  </div>
                )}
              </div>

              {lookupStatus && (
                <div
                  className={`flex items-center gap-2 text-xs font-medium ${
                    lookupStatus.type === 'success'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {lookupStatus.type === 'success' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  )}
                  <span>{lookupStatus.message}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="kanji-onyomi"
                    className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5"
                  >
                    Onyomi Readings (comma-separated)
                  </label>
                  <input
                    id="kanji-onyomi"
                    type="text"
                    value={onyomiInput}
                    onChange={(e) => setOnyomiInput(e.target.value)}
                    placeholder="シン"
                    className="font-jp w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1C1E24] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="kanji-kunyomi"
                    className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5"
                  >
                    Kunyomi Readings (comma-separated)
                  </label>
                  <input
                    id="kanji-kunyomi"
                    type="text"
                    value={kunyomiInput}
                    onChange={(e) => {
                      const native = e.nativeEvent as InputEvent;
                      processHiraganaInputChange(
                        e.currentTarget,
                        e.target.value,
                        Boolean(native.isComposing),
                        romajiImeEnabled,
                        setKunyomiInput
                      );
                    }}
                    onCompositionEnd={(e) => {
                      if (romajiImeEnabled) {
                        processHiraganaInputChange(
                          e.currentTarget,
                          e.currentTarget.value,
                          false,
                          true,
                          setKunyomiInput
                        );
                      }
                    }}
                    onBlur={() => {
                      if (romajiImeEnabled) {
                        setKunyomiInput((prev) => finalizeRomajiToHiragana(prev));
                      }
                    }}
                    placeholder="もり"
                    className="font-jp w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1C1E24] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="kanji-radicals"
                  className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5"
                >
                  Radicals / Components (comma-separated)
                </label>
                <input
                  id="kanji-radicals"
                  type="text"
                  value={radicalsInput}
                  onChange={(e) => setRadicalsInput(e.target.value)}
                  placeholder="木 (tree)"
                  className="font-jp w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1C1E24] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="vocab-kana"
                  className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5"
                >
                  Hiragana / Katakana Word (Required)
                </label>
                <input
                  id="vocab-kana"
                  type="text"
                  required
                  value={kana}
                  onChange={(e) => {
                    const native = e.nativeEvent as InputEvent;
                    processHiraganaInputChange(
                      e.currentTarget,
                      e.target.value,
                      Boolean(native.isComposing),
                      romajiImeEnabled,
                      setKana
                    );
                  }}
                  onCompositionEnd={(e) => {
                    if (romajiImeEnabled) {
                      processHiraganaInputChange(
                        e.currentTarget,
                        e.currentTarget.value,
                        false,
                        true,
                        setKana
                      );
                    }
                  }}
                  onBlur={() => {
                    if (romajiImeEnabled) {
                      setKana((prev) => finalizeRomajiToHiragana(prev));
                    }
                  }}
                  placeholder="あたらしい"
                  className="font-jp w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1C1E24] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-emerald-600 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="vocab-kanji"
                  className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5"
                >
                  Optional Kanji Spelling
                </label>
                <input
                  id="vocab-kanji"
                  type="text"
                  value={character}
                  onChange={(e) => setCharacter(e.target.value)}
                  placeholder="新しい"
                  className="font-jp w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1C1E24] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>
          )}

          <div>
            <label
              htmlFor="card-meanings"
              className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5"
            >
              English Meanings (comma-separated)
            </label>
            <input
              id="card-meanings"
              type="text"
              required
              value={meaningsInput}
              onChange={(e) => setMeaningsInput(e.target.value)}
              placeholder="forest, woods"
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1C1E24] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-emerald-600 focus:outline-none"
            />
          </div>

          {/* Example Sentences Editor */}
          <div className="border-t border-zinc-200/80 dark:border-zinc-800 pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Contextual Example Sentences
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={genSentencesLoading}
                  onClick={handleGenerateCardSentences}
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline disabled:opacity-50 cursor-pointer"
                >
                  {genSentencesLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {genSentencesLoading ? 'Generating...' : 'Generate A1 Examples'}
                </button>
                <button
                  type="button"
                  onClick={addSentenceRow}
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Add Sentence
                </button>
              </div>
            </div>

            {genSentencesError && (
              <div
                role="alert"
                className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{genSentencesError}</span>
              </div>
            )}

            <div className="space-y-3">
              {sentences.map((sent, idx) => (
                <div
                  key={sent.id}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1C1E24] p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono-num text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                      Example {idx + 1}
                    </span>
                    {sentences.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSentenceRow(idx)}
                        aria-label={`Remove sentence ${idx + 1}`}
                        className="text-zinc-400 hover:text-red-500 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={sent.japanese}
                    onChange={(e) => updateSentence(idx, 'japanese', e.target.value)}
                    placeholder="Japanese sentence (e.g., 大きな森を歩きました。)"
                    className="font-jp w-full rounded border border-zinc-200 dark:border-zinc-700 bg-transparent px-2.5 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 focus:border-emerald-600 focus:outline-none"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={sent.furigana}
                      onChange={(e) => {
                        const native = e.nativeEvent as InputEvent;
                        processHiraganaInputChange(
                          e.currentTarget,
                          e.target.value,
                          Boolean(native.isComposing),
                          romajiImeEnabled,
                          (val) => updateSentence(idx, 'furigana', val)
                        );
                      }}
                      onCompositionEnd={(e) => {
                        if (romajiImeEnabled) {
                          processHiraganaInputChange(
                            e.currentTarget,
                            e.currentTarget.value,
                            false,
                            true,
                            (val) => updateSentence(idx, 'furigana', val)
                          );
                        }
                      }}
                      onBlur={() => {
                        if (romajiImeEnabled) {
                          updateSentence(
                            idx,
                            'furigana',
                            finalizeRomajiToHiragana(sent.furigana)
                          );
                        }
                      }}
                      placeholder="Hiragana / Furigana reading"
                      className="font-jp w-full rounded border border-zinc-200 dark:border-zinc-700 bg-transparent px-2.5 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 focus:border-emerald-600 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={sent.english}
                      onChange={(e) => updateSentence(idx, 'english', e.target.value)}
                      placeholder="English translation"
                      className="w-full rounded border border-zinc-200 dark:border-zinc-700 bg-transparent px-2.5 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-zinc-200/80 dark:border-zinc-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-semibold text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-200 cursor-pointer"
            >
              {existingCard ? 'Save Card' : 'Add Card to Deck'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
