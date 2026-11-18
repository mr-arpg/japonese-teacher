import React, { useState } from 'react';
import { BookOpen, PenTool, X } from 'lucide-react';
import { Deck, PromptMode, SessionConfig } from '../types';
import { isCardDue } from '../utils/srs';

interface SessionSetupModalProps {
  deck: Deck;
  onClose: () => void;
  onStart: (config: SessionConfig) => void;
}

export const SessionSetupModal: React.FC<SessionSetupModalProps> = ({
  deck,
  onClose,
  onStart,
}) => {
  const dueCount = deck.cards.filter((c) => isCardDue(c)).length;

  const [promptMode, setPromptMode] = useState<PromptMode>('meaning-first');
  const [contextMode, setContextMode] = useState(false);
  const [cardScope, setCardScope] = useState<'due' | 'all'>(dueCount > 0 ? 'due' : 'all');
  const [shuffle, setShuffle] = useState(true);
  const [showVocabKanji, setShowVocabKanji] = useState(false);

  const isKanjiReading = deck.type === 'kanji' && deck.kanjiMode === 'reading';
  const isKanjiWriting = deck.type === 'kanji' && !isKanjiReading;
  const cardsToStudyCount = cardScope === 'due' ? dueCount : deck.cards.length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (deck.cards.length === 0) return;
    onStart({
      deckId: deck.id,
      promptMode,
      contextMode,
      cardScope: dueCount === 0 ? 'all' : cardScope,
      shuffle,
      showVocabKanji,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-setup-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-[#16181D] shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200/80 dark:border-zinc-800 px-6 py-4">
          <div>
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {isKanjiReading
                ? 'Kanji Reading Recall Session'
                : isKanjiWriting
                ? 'Kanji Handwriting Session'
                : 'Vocabulary Kana Session'}{' '}
              · {deck.cards.length} cards
            </p>
            <h2
              id="session-setup-title"
              className="mt-0.5 text-lg font-semibold text-zinc-900 dark:text-zinc-100"
            >
              {deck.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close session setup"
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Prompt Mode Selector */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
              Primary Prompt Cue
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPromptMode('meaning-first')}
                className={`text-left rounded-lg border p-3.5 transition-colors cursor-pointer ${
                  promptMode === 'meaning-first'
                    ? 'border-emerald-600 bg-emerald-500/10 dark:border-emerald-500 dark:bg-emerald-500/10'
                    : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1C1E24] hover:border-zinc-300 dark:hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {isKanjiReading ? 'Kanji Only' : 'Meaning First'}
                  </span>
                  <span className="font-mono-num text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    Mode A
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {isKanjiReading
                    ? 'Shows the written Kanji. Recall the English meaning (optional "Reveal Reading" hint).'
                    : isKanjiWriting
                    ? 'Shows English meaning. Draw the Kanji (optional "Reveal Reading" hint).'
                    : 'Shows English meaning. Recall the Hiragana reading.'}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setPromptMode('reading-first')}
                className={`text-left rounded-lg border p-3.5 transition-colors cursor-pointer ${
                  promptMode === 'reading-first'
                    ? 'border-emerald-600 bg-emerald-500/10 dark:border-emerald-500 dark:bg-emerald-500/10'
                    : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1C1E24] hover:border-zinc-300 dark:hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {isKanjiReading ? 'Kanji + Reading' : 'Reading First'}
                  </span>
                  <span className="font-mono-num text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    Mode B
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {isKanjiReading
                    ? 'Shows the written Kanji with its readings. Recall the English meaning.'
                    : isKanjiWriting
                    ? 'Shows Hiragana/Katakana reading. Draw the Kanji (optional "Reveal Meaning" hint).'
                    : 'Shows Hiragana pronunciation. Recall the English meaning.'}
                </p>
              </button>
            </div>
          </div>

          {/* Context / Cloze Practice Toggle */}
          <div className="space-y-3 border-t border-zinc-200/80 dark:border-zinc-800 pt-4">
            <label className="flex items-start justify-between gap-4 cursor-pointer">
              <div>
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Practice in Context (Cloze Fill-in-the-Blank)
                </span>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Present an example sentence with the target word blanked out so you practice usage in context.
                </p>
              </div>
              <input
                type="checkbox"
                checked={contextMode}
                onChange={(e) => setContextMode(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-600 cursor-pointer"
              />
            </label>

            {deck.type === 'vocab' && (
              <label className="flex items-start justify-between gap-4 cursor-pointer">
                <div>
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    Display Kanji Form on Answer
                  </span>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Keep off for pure Kana-Only mode, or enable to also view the Kanji spelling on card reveal.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={showVocabKanji}
                  onChange={(e) => setShowVocabKanji(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-600 cursor-pointer"
                />
              </label>
            )}

            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Shuffle Card Order
              </span>
              <input
                type="checkbox"
                checked={shuffle}
                onChange={(e) => setShuffle(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-600 cursor-pointer"
              />
            </label>
          </div>

          {/* Card Queue Scope */}
          <div className="border-t border-zinc-200/80 dark:border-zinc-800 pt-4">
            <span className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
              Card Queue
            </span>
            <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1C1E24] p-1">
              <button
                type="button"
                disabled={dueCount === 0}
                onClick={() => setCardScope('due')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  cardScope === 'due'
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                    : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                Due for Review ({dueCount})
              </button>
              <button
                type="button"
                onClick={() => setCardScope('all')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  cardScope === 'all'
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                    : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                All Cards ({deck.cards.length})
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-zinc-200/80 dark:border-zinc-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={cardsToStudyCount === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isKanjiWriting ? (
                <PenTool className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Begin Session ({cardsToStudyCount})
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
