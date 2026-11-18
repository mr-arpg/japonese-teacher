import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookmarkPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  PenTool,
  Search,
  X,
} from 'lucide-react';
import {
  Deck,
  ExampleSentence,
  KanjiCompoundWord,
  KanjiDictionaryEntry,
  KanjiListCategory,
  StudyCard,
} from '../types';
import {
  buildKanjiCardFromDictionary,
  fetchDictionarySentences,
  fetchKanjiCompounds,
  fetchKanjiDetail,
  fetchKanjiList,
  fetchMoreExampleSentences,
  searchKanjiByQuery,
} from '../utils/dictionaryApi';
import { KanjiStrokeData, KanjiVgParsed, loadKanjiVgData } from '../utils/kanjiVg';
import { KanjiCanvas } from './KanjiCanvas';
import { KanjiStrokeDiagram } from './KanjiStrokeDiagram';
import { SentenceList } from './SentenceList';

interface KanjiDictionaryViewProps {
  initialKanji?: string | null;
  kanjiDecks: Deck[];
  learnedKanji: Set<string>;
  defaultTracingGuide: boolean;
  onToggleLearnedKanji: (kanji: string) => void;
  onOpenWordInDictionary: (term: string) => void;
  onSaveKanjiToDeck: (deckId: string, card: StudyCard) => void;
  onRecordStrokeAttempt: (isCorrect: boolean) => void;
}

const KANJI_CATEGORIES: Array<{ id: KanjiListCategory; label: string }> = [
  { id: 'grade-1', label: 'Grade 1' },
  { id: 'grade-2', label: 'Grade 2' },
  { id: 'grade-3', label: 'Grade 3' },
  { id: 'grade-4', label: 'Grade 4' },
  { id: 'grade-5', label: 'Grade 5' },
  { id: 'grade-6', label: 'Grade 6' },
  { id: 'grade-8', label: 'Secondary' },
  { id: 'joyo', label: 'Jōyō' },
  { id: 'jinmeiyo', label: 'Jinmeiyō' },
];

const PAGE_SIZE = 72;

export const KanjiDictionaryView: React.FC<KanjiDictionaryViewProps> = ({
  initialKanji,
  kanjiDecks,
  learnedKanji,
  defaultTracingGuide,
  onToggleLearnedKanji,
  onOpenWordInDictionary,
  onSaveKanjiToDeck,
  onRecordStrokeAttempt,
}) => {
  const [activeCategory, setActiveCategory] = useState<KanjiListCategory>('grade-1');
  const [searchInput, setSearchInput] = useState('');
  const [activeSearchLabel, setActiveSearchLabel] = useState<string | null>(null);

  const [kanjiList, setKanjiList] = useState<string[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const [selectedKanji, setSelectedKanji] = useState<string>(initialKanji || '山');
  const [detail, setDetail] = useState<KanjiDictionaryEntry | null>(null);
  const [compounds, setCompounds] = useState<KanjiCompoundWord[]>([]);
  const [exampleSentences, setExampleSentences] = useState<ExampleSentence[]>([]);
  const [generatingSentences, setGeneratingSentences] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [vgData, setVgData] = useState<KanjiVgParsed | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [practiceOpen, setPracticeOpen] = useState(false);
  const [practiceAccuracy, setPracticeAccuracy] = useState<number | null>(null);
  const [showAllCompounds, setShowAllCompounds] = useState(false);

  const [targetDeckId, setTargetDeckId] = useState<string>(kanjiDecks[0]?.id ?? '');
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!targetDeckId && kanjiDecks[0]) {
      setTargetDeckId(kanjiDecks[0].id);
    }
  }, [kanjiDecks, targetDeckId]);

  useEffect(() => {
    if (initialKanji) {
      setSelectedKanji(initialKanji);
      setPracticeOpen(false);
    }
  }, [initialKanji]);

  // Load curated list when category changes and no search is active
  useEffect(() => {
    if (activeSearchLabel !== null) return;

    let cancelled = false;
    setListLoading(true);
    setListError(null);

    fetchKanjiList(activeCategory)
      .then((chars) => {
        if (cancelled) return;
        setKanjiList(chars);
        setPage(0);
        setListLoading(false);
        if (chars.length > 0 && !initialKanji) {
          setSelectedKanji((prev) => (chars.includes(prev) ? prev : chars[0]));
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setListLoading(false);
        setListError(
          err instanceof Error ? err.message : 'Unable to load Kanji collection.'
        );
      });

    return () => {
      cancelled = true;
    };
  }, [activeCategory, activeSearchLabel, initialKanji]);

  // Load detail, compounds, and KanjiVG strokes when selectedKanji changes
  useEffect(() => {
    if (!selectedKanji) return;
    let cancelled = false;

    setDetailLoading(true);
    setDetailError(null);
    setShowAllCompounds(false);
    setPracticeAccuracy(null);
    setSavedFeedback(null);
    setGenerateError(null);
    setGeneratingSentences(false);

    Promise.allSettled([
      fetchKanjiDetail(selectedKanji),
      fetchKanjiCompounds(selectedKanji),
      loadKanjiVgData(selectedKanji),
      fetchDictionarySentences(selectedKanji, selectedKanji),
    ]).then(([detailRes, compoundsRes, vgRes, sentencesRes]) => {
      if (cancelled) return;

      if (detailRes.status === 'fulfilled') {
        setDetail(detailRes.value);
      } else {
        setDetail(null);
        setDetailError(
          detailRes.reason instanceof Error
            ? detailRes.reason.message
            : `No Kanji dictionary entry found for "${selectedKanji}".`
        );
      }

      if (compoundsRes.status === 'fulfilled') {
        setCompounds(compoundsRes.value);
      } else {
        setCompounds([]);
      }

      if (vgRes.status === 'fulfilled') {
        setVgData(vgRes.value);
      } else {
        setVgData(null);
      }

      if (sentencesRes.status === 'fulfilled') {
        setExampleSentences(sentencesRes.value);
      } else {
        setExampleSentences([]);
      }

      setDetailLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedKanji]);

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchInput.trim();
    if (!q) {
      setActiveSearchLabel(null);
      return;
    }

    setListLoading(true);
    setListError(null);

    try {
      const result = await searchKanjiByQuery(q);
      setActiveSearchLabel(result.strategyLabel);
      setKanjiList(result.kanji);
      setPage(0);
      if (result.kanji.length > 0) {
        setSelectedKanji(result.kanji[0]);
      }
    } catch (err: unknown) {
      setListError(err instanceof Error ? err.message : 'Kanji search failed.');
    } finally {
      setListLoading(false);
    }
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setActiveSearchLabel(null);
  };

  const totalPages = Math.max(1, Math.ceil(kanjiList.length / PAGE_SIZE));
  const pagedKanji = useMemo(() => {
    const start = page * PAGE_SIZE;
    return kanjiList.slice(start, start + PAGE_SIZE);
  }, [kanjiList, page]);

  const strokes: KanjiStrokeData[] = vgData?.strokes ?? [];

  const existingDeckWithKanji = useMemo(() => {
    if (!selectedKanji) return null;
    return (
      kanjiDecks.find((d) =>
        d.cards.some((c) => c.character === selectedKanji)
      ) ?? null
    );
  }, [kanjiDecks, selectedKanji]);

  const handleSaveToDeck = () => {
    if (!detail || !targetDeckId) return;
    const card = buildKanjiCardFromDictionary(
      targetDeckId,
      detail,
      vgData,
      compounds,
      exampleSentences
    );
    onSaveKanjiToDeck(targetDeckId, card);
    const deckName = kanjiDecks.find((d) => d.id === targetDeckId)?.title ?? 'deck';
    setSavedFeedback(`Added ${detail.kanji} to ${deckName}`);
  };

  const handleGenerateA1Sentences = async () => {
    if (!detail) return;
    setGeneratingSentences(true);
    setGenerateError(null);
    try {
      const generated = await fetchMoreExampleSentences({
        target: detail.kanji,
        meanings: detail.meanings,
        readings: [...detail.kunReadings, ...detail.onReadings],
        count: 4,
        learnedKanji: Array.from(learnedKanji),
        excludeSentences: exampleSentences.map((s) => s.japanese),
      });
      setExampleSentences((prev) => [...generated, ...prev]);
    } catch (err: unknown) {
      setGenerateError(
        err instanceof Error ? err.message : 'Unable to load example sentences.'
      );
    } finally {
      setGeneratingSentences(false);
    }
  };

  const visibleCompounds = showAllCompounds ? compounds.slice(0, 40) : compounds.slice(0, 12);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-zinc-200/80 dark:border-zinc-800 pb-6">
        <div className="max-w-2xl">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 [text-wrap:balance]">
            Kanji Dictionary
          </h1>
          <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">
            Browse Jōyō and Jinmeiyō kanji by school grade or search by character, reading, romaji, or English meaning—with animated stroke order and instant handwriting practice.
          </p>
        </div>

        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full md:w-96 shrink-0">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search 山, もり, mori, or forest..."
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] pl-9 pr-8 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-emerald-600 focus:outline-none"
            />
            {searchInput && (
              <button
                type="button"
                onClick={handleClearSearch}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-semibold text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Search
          </button>
        </form>
      </div>

      {/* Category Filter Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Kanji grade and collection filters"
          className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] p-1"
        >
          {KANJI_CATEGORIES.map((cat) => {
            const isSelected = activeSearchLabel === null && activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => {
                  setActiveSearchLabel(null);
                  setSearchInput('');
                  setActiveCategory(cat.id);
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {activeSearchLabel && (
          <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <span>{activeSearchLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-num">{kanjiList.length} found</span>
            <button
              type="button"
              onClick={handleClearSearch}
              className="ml-1 font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
            >
              Reset
            </button>
          </div>
        )}
      </div>

      {/* Two-Zone Dictionary Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Zone: Browseable Kanji Grid */}
        <section
          aria-label="Kanji character index"
          className="lg:col-span-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] p-5 space-y-4"
        >
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>
              {activeSearchLabel
                ? 'Search Results'
                : KANJI_CATEGORIES.find((c) => c.id === activeCategory)?.label}
            </span>
            <span className="font-mono-num">
              {kanjiList.length > 0
                ? `${page * PAGE_SIZE + 1}–${Math.min(
                    (page + 1) * PAGE_SIZE,
                    kanjiList.length
                  )} of ${kanjiList.length}`
                : '0 characters'}
            </span>
          </div>

          {listLoading ? (
            <div className="flex h-64 items-center justify-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-600" aria-hidden="true" />
              <span>Loading Kanji index...</span>
            </div>
          ) : listError ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="h-5 w-5" aria-hidden="true" />
              <p>{listError}</p>
            </div>
          ) : pagedKanji.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-sm text-zinc-500 dark:text-zinc-400">
              <p>No Kanji matched that search.</p>
              <button
                type="button"
                onClick={handleClearSearch}
                className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                Browse Grade 1 Kanji
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-6 sm:grid-cols-8 lg:grid-cols-6 gap-2">
              {pagedKanji.map((char) => {
                const isSelected = selectedKanji === char;
                return (
                  <button
                    key={char}
                    type="button"
                    onClick={() => {
                      setSelectedKanji(char);
                      setPracticeOpen(false);
                    }}
                    className={`aspect-square flex items-center justify-center rounded-lg border font-jp text-2xl transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-500/12 text-emerald-800 dark:border-emerald-400 dark:text-emerald-300 font-semibold'
                        : 'border-zinc-200/80 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-[#121316] text-zinc-900 dark:text-zinc-100 hover:border-zinc-400 dark:hover:border-zinc-600'
                    }`}
                  >
                    {char}
                  </button>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-zinc-200/70 dark:border-zinc-800 pt-3">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Prev
              </button>
              <span className="font-mono-num text-xs text-zinc-500 dark:text-zinc-400">
                Page {page + 1} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 cursor-pointer"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
        </section>

        {/* Right Zone: Kanji Detail Inspector & Optional Practice */}
        <section
          aria-label="Kanji details"
          className="lg:col-span-7 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] p-6 space-y-6"
        >
          {detailLoading ? (
            <div className="flex h-80 items-center justify-center gap-2.5 text-sm text-zinc-500 dark:text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin text-emerald-600" aria-hidden="true" />
              <span>Loading dictionary entry for {selectedKanji}...</span>
            </div>
          ) : detailError ? (
            <div className="flex h-80 flex-col items-center justify-center gap-3 text-center">
              <AlertCircle className="h-6 w-6 text-red-500" aria-hidden="true" />
              <p className="text-sm text-zinc-700 dark:text-zinc-300">{detailError}</p>
            </div>
          ) : detail ? (
            <>
              {/* Character Header + Metadata */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-zinc-200/80 dark:border-zinc-800 pb-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-[#121316] font-jp text-5xl font-medium text-zinc-900 dark:text-zinc-100">
                    {detail.kanji}
                  </div>
                  <div className="space-y-1.5">
                    <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
                      {detail.meanings.length > 0
                        ? detail.meanings.join(', ')
                        : 'No English gloss'}
                    </h2>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 font-mono-num">
                      <span>{detail.strokeCount || strokes.length} strokes</span>
                      {detail.grade && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            {detail.grade <= 6
                              ? `Grade ${detail.grade}`
                              : detail.grade === 8
                              ? 'Secondary'
                              : `Grade ${detail.grade}`}
                          </span>
                        </>
                      )}
                      {detail.jlpt && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>JLPT N{detail.jlpt}</span>
                        </>
                      )}
                      {detail.frequency && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Freq #{detail.frequency}</span>
                        </>
                      )}
                      {detail.unicode && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>U+{detail.unicode.toUpperCase()}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Optional Save to Deck & Mark as Learned */}
                <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onToggleLearnedKanji(detail.kanji)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      learnedKanji.has(detail.kanji)
                        ? 'border-emerald-600/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] text-zinc-700 dark:text-zinc-200 hover:border-emerald-600'
                    }`}
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    {learnedKanji.has(detail.kanji) ? 'Kanji Learned' : 'Mark as Learned'}
                  </button>

                  {kanjiDecks.length > 0 && (
                    <>
                      {existingDeckWithKanji && !savedFeedback ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          In {existingDeckWithKanji.title}
                        </span>
                      ) : null}

                      <div className="flex items-center gap-1.5">
                        <select
                          aria-label="Target Kanji deck"
                          value={targetDeckId}
                          onChange={(e) => setTargetDeckId(e.target.value)}
                          className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-[#121316] px-2.5 py-1.5 text-xs text-zinc-700 dark:text-zinc-200 max-w-[145px] truncate focus:border-emerald-600 focus:outline-none"
                        >
                          {kanjiDecks.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.title}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={handleSaveToDeck}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:border-emerald-600 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
                          Save Card
                        </button>
                      </div>
                      {savedFeedback && (
                        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          {savedFeedback}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Readings & Stroke Diagram / Practice Canvas */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                <div className="md:col-span-6 space-y-4">
                  <div>
                    <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                      Onyomi (Chinese reading)
                    </div>
                    <div className="mt-1 font-jp text-base text-zinc-900 dark:text-zinc-100">
                      {detail.onReadings.length > 0 ? detail.onReadings.join('、') : '—'}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                      Kunyomi (Japanese reading)
                    </div>
                    <div className="mt-1 font-jp text-base text-zinc-900 dark:text-zinc-100">
                      {detail.kunReadings.length > 0 ? detail.kunReadings.join('、') : '—'}
                    </div>
                  </div>

                  {detail.nameReadings.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                        Nanori (Name readings)
                      </div>
                      <div className="mt-1 font-jp text-sm text-zinc-700 dark:text-zinc-300">
                        {detail.nameReadings.join('、')}
                      </div>
                    </div>
                  )}

                  {vgData && vgData.radicals.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                        Components & Radicals
                      </div>
                      <div className="mt-1 font-jp text-sm text-zinc-700 dark:text-zinc-300">
                        {vgData.radicals.join(' · ')}
                      </div>
                    </div>
                  )}

                  {detail.heisigEn && (
                    <div>
                      <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                        Heisig Keyword
                      </div>
                      <div className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                        {detail.heisigEn}
                      </div>
                    </div>
                  )}

                  {strokes.length > 0 && (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPracticeOpen((v) => !v);
                          setPracticeAccuracy(null);
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          practiceOpen
                            ? 'border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                            : 'bg-emerald-600 text-white hover:bg-emerald-700'
                        }`}
                      >
                        <PenTool className="h-3.5 w-3.5" aria-hidden="true" />
                        {practiceOpen ? 'View Stroke Diagram' : 'Practice Writing Here'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="md:col-span-6 flex flex-col items-center">
                  {strokes.length === 0 ? (
                    <div className="flex h-44 w-44 items-center justify-center rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 text-center text-xs text-zinc-500 dark:text-zinc-400 p-4">
                      Stroke diagram unavailable for this character.
                    </div>
                  ) : practiceOpen ? (
                    <div className="w-full space-y-2">
                      <KanjiCanvas
                        character={detail.kanji}
                        strokes={strokes}
                        defaultTracingGuide={defaultTracingGuide}
                        onStrokeAttempt={onRecordStrokeAttempt}
                        onComplete={(acc) => setPracticeAccuracy(acc)}
                      />
                      {practiceAccuracy !== null && (
                        <div className="text-center text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          Completed with {practiceAccuracy}% stroke accuracy
                        </div>
                      )}
                    </div>
                  ) : (
                    <KanjiStrokeDiagram character={detail.kanji} strokes={strokes} />
                  )}
                </div>
              </div>

              {/* Sentence Examples (only learned kanji + kana, with full sentence translation) */}
              <div className="border-t border-zinc-200/80 dark:border-zinc-800 pt-5">
                <SentenceList
                  sentences={exampleSentences}
                  highlightTerm={detail.kanji}
                  learnedKanji={learnedKanji}
                  onGenerateSentences={handleGenerateA1Sentences}
                  generatingSentences={generatingSentences}
                  generateError={generateError}
                />
              </div>

              {/* Compound Words Using This Kanji */}
              <div className="border-t border-zinc-200/80 dark:border-zinc-800 pt-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Words Containing {detail.kanji}
                  </h3>
                  <span className="font-mono-num text-xs text-zinc-500 dark:text-zinc-400">
                    {compounds.length} entries
                  </span>
                </div>

                {compounds.length === 0 ? (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    No compound vocabulary listed for this character.
                  </p>
                ) : (
                  <>
                    <div className="divide-y divide-zinc-200/70 dark:divide-zinc-800 rounded-lg border border-zinc-200/80 dark:border-zinc-800">
                      {visibleCompounds.map((word, idx) => (
                        <div
                          key={`${word.written}-${word.pronounced}-${idx}`}
                          className="flex items-center justify-between gap-3 px-4 py-2.5"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-baseline gap-2">
                              <span className="font-jp text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                {word.written}
                              </span>
                              {word.pronounced && (
                                <span className="font-jp text-xs text-zinc-500 dark:text-zinc-400">
                                  {word.pronounced}
                                </span>
                              )}
                              {word.isCommon && (
                                <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                                  · Common
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-zinc-600 dark:text-zinc-300 truncate">
                              {word.meanings.join(', ')}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => onOpenWordInDictionary(word.written)}
                            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Word Dict
                            <ArrowRight className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {compounds.length > 12 && (
                      <button
                        type="button"
                        onClick={() => setShowAllCompounds((v) => !v)}
                        className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                      >
                        {showAllCompounds
                          ? 'Show fewer words'
                          : `Show more words (${Math.min(40, compounds.length)} of ${compounds.length})`}
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
};
