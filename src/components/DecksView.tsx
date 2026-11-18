import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Download,
  Edit3,
  Eye,
  PenTool,
  Play,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { Deck, DeckType, StudyCard } from '../types';
import { isCardDue } from '../utils/srs';

interface DecksViewProps {
  decks: Deck[];
  onOpenSessionSetup: (deck: Deck) => void;
  onCreateDeck: () => void;
  onEditDeck: (deck: Deck) => void;
  onDeleteDeck: (deckId: string) => void;
  onAddCard: (deck: Deck) => void;
  onEditCard: (deck: Deck, card: StudyCard) => void;
  onDeleteCard: (deckId: string, cardId: string) => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  backupMessage: { type: 'success' | 'error'; text: string } | null;
}

export const DecksView: React.FC<DecksViewProps> = ({
  decks,
  onOpenSessionSetup,
  onCreateDeck,
  onEditDeck,
  onDeleteDeck,
  onAddCard,
  onEditCard,
  onDeleteCard,
  onExportBackup,
  onImportBackup,
  backupMessage,
}) => {
  const [filterType, setFilterType] = useState<'all' | DeckType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [cardSearch, setCardSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedDeck = useMemo(
    () => decks.find((d) => d.id === selectedDeckId) ?? null,
    [decks, selectedDeckId]
  );

  const filteredDecks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return decks.filter((deck) => {
      if (filterType !== 'all' && deck.type !== filterType) return false;
      if (!q) return true;
      return (
        deck.title.toLowerCase().includes(q) ||
        deck.description.toLowerCase().includes(q) ||
        deck.category.toLowerCase().includes(q)
      );
    });
  }, [decks, filterType, searchQuery]);

  const filteredCards = useMemo(() => {
    if (!selectedDeck) return [];
    const q = cardSearch.trim().toLowerCase();
    if (!q) return selectedDeck.cards;
    return selectedDeck.cards.filter((card) => {
      return (
        (card.character ?? '').toLowerCase().includes(q) ||
        card.kana.toLowerCase().includes(q) ||
        card.meanings.some((m) => m.toLowerCase().includes(q))
      );
    });
  }, [selectedDeck, cardSearch]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportBackup(file);
    }
    e.target.value = '';
  };

  if (selectedDeck) {
    const dueCount = selectedDeck.cards.filter((c) => isCardDue(c)).length;

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200/80 dark:border-zinc-800 pb-5">
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => {
                setSelectedDeckId(null);
                setCardSearch('');
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Back to Decks & Lists
            </button>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {selectedDeck.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span>
                {selectedDeck.type === 'kanji'
                  ? selectedDeck.kanjiMode === 'reading'
                    ? 'Kanji Active Recall (Reading)'
                    : 'Kanji Handwriting'
                  : 'Vocabulary Deck'}
              </span>
              <span aria-hidden="true">·</span>
              <span>{selectedDeck.category}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num">{selectedDeck.cards.length} cards</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num">{dueCount} due</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onEditDeck(selectedDeck)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
              Edit Deck
            </button>
            <button
              type="button"
              onClick={() => onAddCard(selectedDeck)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add Card
            </button>
            <button
              type="button"
              disabled={selectedDeck.cards.length === 0}
              onClick={() => onOpenSessionSetup(selectedDeck)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              Study Deck
            </button>
          </div>
        </div>

        {/* Card Search */}
        <div className="relative max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={cardSearch}
            onChange={(e) => setCardSearch(e.target.value)}
            placeholder="Filter cards by kanji, kana, or meaning..."
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] pl-9 pr-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-emerald-600 focus:outline-none"
          />
        </div>

        {filteredCards.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-10 text-center">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {selectedDeck.cards.length === 0
                ? 'This deck has no cards yet.'
                : 'No cards match your filter.'}
            </p>
            {selectedDeck.cards.length === 0 && (
              <button
                type="button"
                onClick={() => onAddCard(selectedDeck)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-semibold text-white dark:text-zinc-950 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add First Card
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-zinc-200/80 dark:divide-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20]">
            {filteredCards.map((card) => {
              const due = isCardDue(card);
              return (
                <div
                  key={card.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 py-4"
                >
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-[#121316]">
                      {card.type === 'kanji' ? (
                        <span className="font-jp text-3xl font-medium text-zinc-900 dark:text-zinc-100">
                          {card.character}
                        </span>
                      ) : (
                        <span className="font-jp text-sm font-medium text-zinc-900 dark:text-zinc-100 px-1 text-center truncate">
                          {card.kana}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {card.meanings.join(', ')}
                        </span>
                        {card.type === 'vocab' && card.character && (
                          <span className="font-jp text-xs text-zinc-500 dark:text-zinc-400">
                            ({card.character})
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                        <span className="font-jp">{card.kana}</span>
                        {card.strokeCount ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono-num">{card.strokeCount} strokes</span>
                          </>
                        ) : null}
                        <span aria-hidden="true">·</span>
                        <span>{card.sentences.length} sentences</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            due
                              ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                              : 'text-zinc-500 dark:text-zinc-400'
                          }
                        >
                          {due ? 'Due now' : `Next in ${card.interval}d`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => onEditCard(selectedDeck, card)}
                      aria-label={`Edit ${card.character || card.kana}`}
                      className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                      <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteCard(selectedDeck.id, card.id)}
                      aria-label={`Delete ${card.character || card.kana}`}
                      className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2 text-zinc-500 hover:border-red-300 hover:text-red-600 dark:hover:border-red-900 dark:hover:text-red-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Workspace Toolbar */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-zinc-200/80 dark:border-zinc-800 pb-6">
        <div className="max-w-2xl">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 [text-wrap:balance]">
            Japanese Kanji & Vocabulary Decks
          </h1>
          <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">
            Practice authentic Kanji stroke order on a Genkouyoushi grid, train active Kanji reading recall, or study Kana vocabulary with spaced repetition and contextual sentences.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={onExportBackup}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            Import JSON
          </button>
          <button
            type="button"
            onClick={onCreateDeck}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-semibold text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            New Deck
          </button>
        </div>
      </div>

      {backupMessage && (
        <div
          role="status"
          className={`rounded-lg border px-4 py-2.5 text-xs font-medium ${
            backupMessage.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
              : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
          }`}
        >
          {backupMessage.text}
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] p-1 self-start">
          {(
            [
              { id: 'all', label: 'All Decks' },
              { id: 'kanji', label: 'Kanji Decks' },
              { id: 'vocab', label: 'Vocabulary Decks' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterType(tab.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filterType === tab.id
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search decks..."
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] pl-9 pr-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-emerald-600 focus:outline-none"
          />
        </div>
      </div>

      {/* Decks Grid */}
      {filteredDecks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-12 text-center">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No study decks match your current filter.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredDecks.map((deck) => {
            const dueCount = deck.cards.filter((c) => isCardDue(c)).length;
            const masteredCount = deck.cards.filter((c) => c.repetitions >= 2).length;
            const masteryPct =
              deck.cards.length > 0
                ? Math.round((masteredCount / deck.cards.length) * 100)
                : 0;

            return (
              <article
                key={deck.id}
                className="flex flex-col justify-between rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] p-6 transition-colors hover:border-zinc-300 dark:hover:border-zinc-700"
              >
                <div>
                  {/* Quiet 1-line unboxed metadata kicker */}
                  <div className="flex items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 font-medium text-zinc-700 dark:text-zinc-300">
                        {deck.type === 'kanji' ? (
                          deck.kanjiMode === 'reading' ? (
                            <Eye className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                          ) : (
                            <PenTool className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                          )
                        ) : (
                          <BookOpen className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                        )}
                        {deck.type === 'kanji'
                          ? deck.kanjiMode === 'reading'
                            ? 'Kanji Reading'
                            : 'Kanji Writing'
                          : 'Kana Vocabulary'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{deck.category}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onDeleteDeck(deck.id)}
                      aria-label={`Delete ${deck.title}`}
                      className="rounded p-1 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>

                  <h2 className="mt-2.5 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    {deck.title}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">
                    {deck.description}
                  </p>

                  {/* Character Preview Strip */}
                  {deck.cards.length > 0 && (
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-sm font-jp text-zinc-700 dark:text-zinc-300">
                      {deck.cards.slice(0, 6).map((c) => (
                        <span
                          key={c.id}
                          className="inline-flex items-center justify-center rounded border border-zinc-200/80 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-[#121316] px-2 py-0.5 text-xs"
                        >
                          {deck.type === 'kanji' ? c.character : c.kana}
                        </span>
                      ))}
                      {deck.cards.length > 6 && (
                        <span className="font-mono-num text-xs text-zinc-400 dark:text-zinc-500">
                          +{deck.cards.length - 6} more
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200/70 dark:border-zinc-800 pt-4">
                  <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 font-mono-num">
                    <span>{deck.cards.length} cards</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        dueCount > 0
                          ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                          : ''
                      }
                    >
                      {dueCount} due
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{masteryPct}% mastered</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedDeckId(deck.id)}
                      className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Browse Cards
                    </button>
                    <button
                      type="button"
                      disabled={deck.cards.length === 0}
                      onClick={() => onOpenSessionSetup(deck)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Play className="h-3 w-3" aria-hidden="true" />
                      Study
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
