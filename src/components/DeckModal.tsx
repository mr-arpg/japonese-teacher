import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Deck, DeckType, KanjiDeckMode } from '../types';

interface DeckModalProps {
  existingDeck?: Deck;
  onClose: () => void;
  onSave: (data: {
    title: string;
    description: string;
    type: DeckType;
    kanjiMode?: KanjiDeckMode;
    category: string;
  }) => void;
}

export const DeckModal: React.FC<DeckModalProps> = ({
  existingDeck,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState(existingDeck?.title ?? '');
  const [description, setDescription] = useState(existingDeck?.description ?? '');
  const [type, setType] = useState<DeckType>(existingDeck?.type ?? 'kanji');
  const [kanjiMode, setKanjiMode] = useState<KanjiDeckMode>(
    existingDeck?.kanjiMode ?? 'writing'
  );
  const [category, setCategory] = useState(existingDeck?.category ?? 'Custom');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      description: description.trim() || 'Custom Japanese study deck.',
      type,
      kanjiMode: type === 'kanji' ? kanjiMode : undefined,
      category: category.trim() || 'Custom',
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deck-modal-title"
    >
      <div className="w-full max-w-md rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-[#16181D] shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-200/80 dark:border-zinc-800 px-6 py-4">
          <h2
            id="deck-modal-title"
            className="text-base font-semibold text-zinc-900 dark:text-zinc-100"
          >
            {existingDeck ? 'Edit Study Deck' : 'Create Study Deck'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Deck Type
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={Boolean(existingDeck)}
                onClick={() => setType('kanji')}
                className={`rounded-lg border p-3 text-left transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                  type === 'kanji'
                    ? 'border-emerald-600 bg-emerald-500/10 text-zinc-900 dark:text-zinc-100'
                    : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1C1E24] text-zinc-700 dark:text-zinc-300'
                }`}
              >
                <div className="text-xs font-semibold">Kanji Deck</div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Writing or reading recall
                </div>
              </button>
              <button
                type="button"
                disabled={Boolean(existingDeck)}
                onClick={() => setType('vocab')}
                className={`rounded-lg border p-3 text-left transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                  type === 'vocab'
                    ? 'border-emerald-600 bg-emerald-500/10 text-zinc-900 dark:text-zinc-100'
                    : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1C1E24] text-zinc-700 dark:text-zinc-300'
                }`}
              >
                <div className="text-xs font-semibold">Vocabulary Deck</div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Kana-Only active recall
                </div>
              </button>
            </div>
          </div>

          {type === 'kanji' && (
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Kanji Practice Mode
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setKanjiMode('writing')}
                  className={`rounded-lg border p-3 text-left transition-colors cursor-pointer ${
                    kanjiMode === 'writing'
                      ? 'border-emerald-600 bg-emerald-500/10 text-zinc-900 dark:text-zinc-100'
                      : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1C1E24] text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  <div className="text-xs font-semibold">Handwriting</div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Stroke order &amp; shape validation
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setKanjiMode('reading')}
                  className={`rounded-lg border p-3 text-left transition-colors cursor-pointer ${
                    kanjiMode === 'reading'
                      ? 'border-emerald-600 bg-emerald-500/10 text-zinc-900 dark:text-zinc-100'
                      : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1C1E24] text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  <div className="text-xs font-semibold">Active Recall Reading</div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    See written Kanji, recall meaning
                  </div>
                </button>
              </div>
            </div>
          )}

          <div>
            <label
              htmlFor="deck-title"
              className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5"
            >
              Deck Title
            </label>
            <input
              id="deck-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={type === 'kanji' ? 'e.g., JLPT N4 Verbs Kanji' : 'e.g., Cafe & Dining Vocab'}
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1C1E24] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="deck-category"
              className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5"
            >
              Category / Level
            </label>
            <input
              id="deck-category"
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g., JLPT N4, Daily Life, Custom"
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1C1E24] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="deck-desc"
              className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5"
            >
              Description
            </label>
            <textarea
              id="deck-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short focus note for this list..."
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1C1E24] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-emerald-600 focus:outline-none"
            />
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
              {existingDeck ? 'Save Changes' : 'Create Deck'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
