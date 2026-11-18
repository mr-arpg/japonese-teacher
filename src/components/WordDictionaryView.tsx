import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookmarkPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { Deck, ExampleSentence, StudyCard, WordDictionaryEntry } from '../types';
import {
  buildVocabCardFromDictionary,
  extractKanjiChars,
  fetchDictionarySentences,
  generateA1Sentences,
  searchWordDictionary,
} from '../utils/dictionaryApi';
import { SentenceList } from './SentenceList';

interface WordDictionaryViewProps {
  initialQuery?: string | null;
  vocabDecks: Deck[];
  learnedKanji: Set<string>;
  onInspectKanji: (char: string) => void;
  onSaveWordToDeck: (deckId: string, card: StudyCard) => void;
}

const WORD_CATEGORIES: Array<{ id: string; label: string; keyword: string }> = [
  { id: 'common', label: 'Common Words', keyword: '#common' },
  { id: 'n5', label: 'JLPT N5', keyword: '#jlpt-n5' },
  { id: 'n4', label: 'JLPT N4', keyword: '#jlpt-n4' },
  { id: 'n3', label: 'JLPT N3', keyword: '#jlpt-n3' },
  { id: 'n2', label: 'JLPT N2', keyword: '#jlpt-n2' },
  { id: 'n1', label: 'JLPT N1', keyword: '#jlpt-n1' },
  { id: 'verb', label: 'Verbs', keyword: '#verb' },
  { id: 'adj', label: 'Adjectives', keyword: '#adjective' },
];

function formatJlptTag(tag: string): string {
  return tag.replace('jlpt-', 'JLPT ').toUpperCase();
}

export const WordDictionaryView: React.FC<WordDictionaryViewProps> = ({
  initialQuery,
  vocabDecks,
  learnedKanji,
  onInspectKanji,
  onSaveWordToDeck,
}) => {
  const [searchInput, setSearchInput] = useState(initialQuery || '');
  const [activeKeyword, setActiveKeyword] = useState(
    initialQuery?.trim() ? initialQuery.trim() : '#common'
  );
  const [page, setPage] = useState(1);

  const [entries, setEntries] = useState<WordDictionaryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [exampleSentences, setExampleSentences] = useState<ExampleSentence[]>([]);
  const [sentencesLoading, setSentencesLoading] = useState(false);
  const [generatingSentences, setGeneratingSentences] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [targetDeckId, setTargetDeckId] = useState<string>(vocabDecks[0]?.id ?? '');
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!targetDeckId && vocabDecks[0]) {
      setTargetDeckId(vocabDecks[0].id);
    }
  }, [vocabDecks, targetDeckId]);

  useEffect(() => {
    if (initialQuery && initialQuery.trim()) {
      setSearchInput(initialQuery.trim());
      setActiveKeyword(initialQuery.trim());
      setPage(1);
    }
  }, [initialQuery]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    searchWordDictionary(activeKeyword, page)
      .then((results) => {
        if (cancelled) return;
        setEntries(results);
        setSelectedSlug(results[0]?.slug ?? null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setEntries([]);
        setSelectedSlug(null);
        setLoading(false);
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load Japanese dictionary entries.'
        );
      });

    return () => {
      cancelled = true;
    };
  }, [activeKeyword, page]);

  const selectedEntry = useMemo(
    () => entries.find((e) => e.slug === selectedSlug) ?? entries[0] ?? null,
    [entries, selectedSlug]
  );

  useEffect(() => {
    setSavedFeedback(null);
  }, [selectedEntry?.slug]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchInput.trim();
    if (!q) {
      setActiveKeyword('#common');
      setPage(1);
      return;
    }
    setActiveKeyword(q);
    setPage(1);
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setActiveKeyword('#common');
    setPage(1);
  };

  const activeCategoryId = useMemo(() => {
    const match = WORD_CATEGORIES.find((c) => c.keyword === activeKeyword);
    return match?.id ?? null;
  }, [activeKeyword]);

  const selectedPrimaryForm = selectedEntry?.japanese[0];
  const selectedHeadword =
    selectedPrimaryForm?.word || selectedPrimaryForm?.reading || selectedEntry?.slug || '';
  const selectedReading = selectedPrimaryForm?.reading || '';

  useEffect(() => {
    if (!selectedHeadword) {
      setExampleSentences([]);
      return;
    }

    let cancelled = false;
    setSentencesLoading(true);
    setGenerateError(null);
    setGeneratingSentences(false);

    fetchDictionarySentences(selectedHeadword, selectedHeadword).then(
      async (list) => {
        if (cancelled) return;
        if (list.length > 0 || !selectedReading || selectedReading === selectedHeadword) {
          setExampleSentences(list);
          setSentencesLoading(false);
          return;
        }
        const fallbackList = await fetchDictionarySentences(
          selectedReading,
          selectedReading
        );
        if (!cancelled) {
          setExampleSentences(fallbackList);
          setSentencesLoading(false);
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [selectedHeadword, selectedReading]);

  const componentKanji = useMemo(() => {
    if (!selectedEntry) return [];
    const allWords = selectedEntry.japanese
      .map((j) => j.word ?? '')
      .join('');
    return extractKanjiChars(allWords);
  }, [selectedEntry]);

  const existingDeckWithWord = useMemo(() => {
    if (!selectedEntry) return null;
    const kana = selectedPrimaryForm?.reading || selectedPrimaryForm?.word || '';
    const char = selectedPrimaryForm?.word;
    return (
      vocabDecks.find((d) =>
        d.cards.some(
          (c) => c.kana === kana || (char && c.character === char)
        )
      ) ?? null
    );
  }, [vocabDecks, selectedEntry, selectedPrimaryForm]);

  const handleSaveToDeck = () => {
    if (!selectedEntry || !targetDeckId) return;
    const card = buildVocabCardFromDictionary(
      targetDeckId,
      selectedEntry,
      exampleSentences
    );
    onSaveWordToDeck(targetDeckId, card);
    const deckName = vocabDecks.find((d) => d.id === targetDeckId)?.title ?? 'deck';
    setSavedFeedback(`Added "${selectedHeadword}" to ${deckName}`);
  };

  const handleGenerateA1Sentences = async () => {
    if (!selectedEntry || !selectedHeadword) return;
    setGeneratingSentences(true);
    setGenerateError(null);
    const meanings = selectedEntry.senses
      .filter((s) => !s.partsOfSpeech.includes('Wikipedia definition'))
      .flatMap((s) => s.englishDefinitions)
      .slice(0, 5);
    try {
      const generated = await generateA1Sentences({
        target: selectedHeadword,
        meanings,
        readings: selectedReading ? [selectedReading] : [],
        count: 4,
        learnedKanji: Array.from(learnedKanji),
        excludeSentences: exampleSentences.map((s) => s.japanese),
      });
      setExampleSentences((prev) => [...generated, ...prev]);
    } catch (err: unknown) {
      setGenerateError(
        err instanceof Error ? err.message : 'Unable to generate A1 sentences.'
      );
    } finally {
      setGeneratingSentences(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-zinc-200/80 dark:border-zinc-800 pb-6">
        <div className="max-w-2xl">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 [text-wrap:balance]">
            Japanese Word Dictionary
          </h1>
          <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">
            Browse JMdict vocabulary by JLPT level or search in English, Japanese, or Romaji—complete with readings, parts of speech, and component kanji breakdowns.
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
              placeholder="Search water, 図書館, taberu..."
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

      {/* Category Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Word dictionary browse filters"
          className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] p-1"
        >
          {WORD_CATEGORIES.map((cat) => {
            const isSelected = activeCategoryId === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => {
                  setSearchInput('');
                  setActiveKeyword(cat.keyword);
                  setPage(1);
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

        {!activeCategoryId && (
          <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <span>Results for "{activeKeyword}"</span>
            <button
              type="button"
              onClick={handleClearSearch}
              className="font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
            >
              Reset
            </button>
          </div>
        )}
      </div>

      {/* Two-Zone Dictionary Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Zone: Word List */}
        <section
          aria-label="Word results list"
          className="lg:col-span-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] overflow-hidden"
        >
          <div className="flex items-center justify-between border-b border-zinc-200/80 dark:border-zinc-800 px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
            <span>
              {activeCategoryId
                ? WORD_CATEGORIES.find((c) => c.id === activeCategoryId)?.label
                : `Query: ${activeKeyword}`}
            </span>
            <span className="font-mono-num">Page {page}</span>
          </div>

          {loading ? (
            <div className="flex h-80 items-center justify-center gap-2.5 text-sm text-zinc-500 dark:text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-600" aria-hidden="true" />
              <span>Searching Japanese dictionary...</span>
            </div>
          ) : error ? (
            <div className="flex h-80 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="h-5 w-5" aria-hidden="true" />
              <p>{error}</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex h-80 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
              <p>No dictionary entries found for "{activeKeyword}".</p>
              <button
                type="button"
                onClick={handleClearSearch}
                className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                Browse Common Words
              </button>
            </div>
          ) : (
            <div className="divide-y divide-zinc-200/70 dark:divide-zinc-800 max-h-[640px] overflow-y-auto">
              {entries.map((entry) => {
                const form = entry.japanese[0] ?? {};
                const head = form.word || form.reading || entry.slug;
                const reading = form.word && form.reading && form.word !== form.reading ? form.reading : '';
                const firstSense = entry.senses[0];
                const isSelected = selectedEntry?.slug === entry.slug;
                const pos = firstSense?.partsOfSpeech[0];

                return (
                  <button
                    key={entry.slug}
                    type="button"
                    onClick={() => setSelectedSlug(entry.slug)}
                    className={`w-full text-left px-4 py-3.5 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500/10 dark:bg-emerald-500/15'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex flex-wrap items-baseline gap-2 min-w-0">
                        <span
                          className={`font-jp text-lg font-semibold ${
                            isSelected
                              ? 'text-emerald-800 dark:text-emerald-300'
                              : 'text-zinc-900 dark:text-zinc-100'
                          }`}
                        >
                          {head}
                        </span>
                        {reading && (
                          <span className="font-jp text-xs text-zinc-500 dark:text-zinc-400">
                            {reading}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 font-mono-num shrink-0">
                        {entry.isCommon && (
                          <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                            Common
                          </span>
                        )}
                        {entry.jlpt[0] && (
                          <>
                            {entry.isCommon && <span aria-hidden="true">·</span>}
                            <span>{formatJlptTag(entry.jlpt[0])}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {firstSense && (
                      <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300 line-clamp-1">
                        {firstSense.englishDefinitions.slice(0, 4).join('; ')}
                      </div>
                    )}

                    {pos && (
                      <div className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                        {pos}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Pagination Footer */}
          <div className="flex items-center justify-between border-t border-zinc-200/80 dark:border-zinc-800 px-4 py-3">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Prev
            </button>
            <span className="font-mono-num text-xs text-zinc-500 dark:text-zinc-400">
              Page {page}
            </span>
            <button
              type="button"
              disabled={entries.length < 15 || loading}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 cursor-pointer"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </section>

        {/* Right Zone: Full Word Entry Detail */}
        <section
          aria-label="Word entry detail"
          className="lg:col-span-7 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] p-6 space-y-6"
        >
          {loading && !selectedEntry ? (
            <div className="flex h-80 items-center justify-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin text-emerald-600" aria-hidden="true" />
              <span>Loading word entry...</span>
            </div>
          ) : !selectedEntry ? (
            <div className="flex h-80 items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
              Select a word from the list to view full definitions, readings, and kanji breakdowns.
            </div>
          ) : (
            <>
              {/* Word Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-zinc-200/80 dark:border-zinc-800 pb-5">
                <div className="space-y-1.5">
                  {selectedReading && selectedPrimaryForm?.word && (
                    <div className="font-jp text-sm text-zinc-500 dark:text-zinc-400">
                      {selectedReading}
                    </div>
                  )}
                  <h2 className="font-jp text-3xl sm:text-4xl font-semibold text-zinc-900 dark:text-zinc-100">
                    {selectedHeadword}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                    <span>{selectedEntry.isCommon ? 'Common word' : 'Dictionary entry'}</span>
                    {selectedEntry.jlpt.map((level) => (
                      <React.Fragment key={level}>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-num">{formatJlptTag(level)}</span>
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {/* Optional Save to Vocab Deck */}
                {vocabDecks.length > 0 && (
                  <div className="flex flex-col items-start sm:items-end gap-1.5 shrink-0">
                    {existingDeckWithWord && !savedFeedback ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        In {existingDeckWithWord.title}
                      </span>
                    ) : null}

                    <div className="flex items-center gap-1.5">
                      <select
                        aria-label="Target Vocabulary deck"
                        value={targetDeckId}
                        onChange={(e) => setTargetDeckId(e.target.value)}
                        className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-[#121316] px-2.5 py-1.5 text-xs text-zinc-700 dark:text-zinc-200 max-w-[145px] truncate focus:border-emerald-600 focus:outline-none"
                      >
                        {vocabDecks.map((d) => (
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
                  </div>
                )}
              </div>

              {/* Numbered Senses / Definitions */}
              <div className="space-y-4">
                <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  Meanings & Usage
                </h3>
                <ol className="space-y-4">
                  {selectedEntry.senses.map((sense, idx) => (
                    <li
                      key={idx}
                      className="border-b border-zinc-200/60 dark:border-zinc-800/80 pb-3.5 last:border-none last:pb-0"
                    >
                      {sense.partsOfSpeech.length > 0 && (
                        <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                          {sense.partsOfSpeech.join(' · ')}
                        </div>
                      )}
                      <div className="flex items-baseline gap-2.5">
                        <span className="font-mono-num text-xs font-semibold text-zinc-400 dark:text-zinc-500">
                          {String(idx + 1).padStart(2, '0')}.
                        </span>
                        <span className="text-sm sm:text-base font-medium text-zinc-900 dark:text-zinc-100">
                          {sense.englishDefinitions.join('; ')}
                        </span>
                      </div>

                      {(sense.tags.length > 0 || sense.info.length > 0) && (
                        <div className="mt-1.5 pl-7 text-xs text-zinc-500 dark:text-zinc-400">
                          {[...sense.tags, ...sense.info].join(' · ')}
                        </div>
                      )}

                      {sense.seeAlso.length > 0 && (
                        <div className="mt-1.5 pl-7 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                          <span>See also:</span>
                          {sense.seeAlso.map((ref) => (
                            <button
                              key={ref}
                              type="button"
                              onClick={() => {
                                setSearchInput(ref);
                                setActiveKeyword(ref);
                                setPage(1);
                              }}
                              className="font-jp font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                            >
                              {ref}
                            </button>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </div>

              {/* Other Forms */}
              {selectedEntry.japanese.length > 1 && (
                <div className="border-t border-zinc-200/80 dark:border-zinc-800 pt-4 space-y-2">
                  <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    Other Forms
                  </h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm font-jp text-zinc-700 dark:text-zinc-300">
                    {selectedEntry.japanese.slice(1).map((form, i) => (
                      <span key={i}>
                        {form.word || form.reading}
                        {form.word && form.reading ? ` (${form.reading})` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Sentence Examples */}
              <div className="border-t border-zinc-200/80 dark:border-zinc-800 pt-5">
                {sentencesLoading ? (
                  <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" aria-hidden="true" />
                    <span>Loading sentence examples...</span>
                  </div>
                ) : (
                  <SentenceList
                    sentences={exampleSentences}
                    highlightTerm={selectedHeadword}
                    learnedKanji={learnedKanji}
                    onGenerateSentences={handleGenerateA1Sentences}
                    generatingSentences={generatingSentences}
                    generateError={generateError}
                  />
                )}
              </div>

              {/* Component Kanji Bridge to Kanji Dictionary */}
              {componentKanji.length > 0 && (
                <div className="border-t border-zinc-200/80 dark:border-zinc-800 pt-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                      Kanji in This Word
                    </h3>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      Click to inspect stroke order & readings
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {componentKanji.map((ch) => (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => onInspectKanji(ch)}
                        className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-[#121316] px-3.5 py-2 hover:border-emerald-600 transition-colors cursor-pointer"
                      >
                        <span className="font-jp text-xl font-medium text-zinc-900 dark:text-zinc-100">
                          {ch}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          Inspect
                          <ArrowRight className="h-3 w-3" aria-hidden="true" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
};
