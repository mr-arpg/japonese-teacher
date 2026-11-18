import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Eye,
  EyeOff,
  Languages,
  Loader2,
} from 'lucide-react';
import { ExampleSentence } from '../types';
import { formatSentenceForLearnedKanji } from '../utils/sentenceText';

interface SentenceListProps {
  sentences: ExampleSentence[];
  highlightTerm?: string;
  compact?: boolean;
  learnedKanji?: Set<string>;
  onGenerateSentences?: () => void;
  generatingSentences?: boolean;
  generateError?: string | null;
}

function renderHighlightedText(text: string, terms: string[]): React.ReactNode {
  const validTerms = terms.filter((t) => t && t.trim().length > 0);
  if (validTerms.length === 0) return text;

  const escaped = validTerms
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'g');
  const parts = text.split(regex);

  return parts.map((part, i) => {
    if (validTerms.includes(part)) {
      return (
        <mark
          key={i}
          className="rounded bg-emerald-500/15 px-1 py-0.5 font-semibold text-emerald-800 dark:text-emerald-300"
        >
          {part}
        </mark>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

export function buildClozeSentence(
  sentence: ExampleSentence,
  fallbackTarget?: string,
  learnedKanji?: Set<string>
): { maskedJapanese: string; maskedFurigana: string; blankTerm: string } {
  const target = sentence.targetHighlight || fallbackTarget || '';
  const baseJapanese = learnedKanji
    ? formatSentenceForLearnedKanji(sentence, learnedKanji, true).displayJapanese
    : sentence.japanese;

  if (!target) {
    return {
      maskedJapanese: baseJapanese,
      maskedFurigana: sentence.furigana,
      blankTerm: '',
    };
  }

  const mask = '＿＿＿';
  const maskedJapanese = baseJapanese.includes(target)
    ? baseJapanese.replace(target, mask)
    : baseJapanese;
  const maskedFurigana = sentence.furigana.includes(target)
    ? sentence.furigana.replace(target, mask)
    : sentence.furigana;

  return { maskedJapanese, maskedFurigana, blankTerm: target };
}

export const SentenceList: React.FC<SentenceListProps> = ({
  sentences,
  highlightTerm,
  compact = false,
  learnedKanji,
  onGenerateSentences,
  generatingSentences = false,
  generateError = null,
}) => {
  const [showFurigana, setShowFurigana] = useState(true);
  const [onlyLearnedKanji, setOnlyLearnedKanji] = useState(true);

  const formattedRows = useMemo(() => {
    return sentences.map((sent) => {
      const formatted = learnedKanji
        ? formatSentenceForLearnedKanji(sent, learnedKanji, onlyLearnedKanji)
        : {
            displayJapanese: sent.japanese,
            furigana: sent.furigana,
            switchedCount: 0,
            hasUnalignedKanji: false,
          };
      return { sent, formatted };
    });
  }, [sentences, learnedKanji, onlyLearnedKanji]);

  const anySwitched = formattedRows.some((r) => r.formatted.switchedCount > 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-xs font-semibold tracking-wide text-zinc-500 dark:text-zinc-400">
            Sentence Examples ({sentences.length})
          </h4>
          {learnedKanji && sentences.length > 0 && (
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
              ·{' '}
              {onlyLearnedKanji
                ? `Using ${learnedKanji.size} learned kanji (others in kana)`
                : 'Showing original kanji'}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {onGenerateSentences && (
            <button
              type="button"
              disabled={generatingSentences}
              onClick={onGenerateSentences}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-[#FAF9F6] dark:bg-[#121316] px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:border-emerald-600 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {generatingSentences ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {generatingSentences
                ? 'Loading...'
                : sentences.length > 0
                ? 'Load More Examples'
                : 'Find Examples'}
            </button>
          )}

          {learnedKanji && sentences.length > 0 && (anySwitched || !onlyLearnedKanji) && (
            <button
              type="button"
              onClick={() => setOnlyLearnedKanji((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Languages className="h-3.5 w-3.5" aria-hidden="true" />
              {onlyLearnedKanji ? 'Show Original Kanji' : 'Learned Kanji Only'}
            </button>
          )}

          {sentences.length > 0 && (
            <button
              type="button"
              onClick={() => setShowFurigana((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {showFurigana ? (
                <>
                  <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                  Hide Reading
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  Show Reading
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {generateError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{generateError}</span>
        </div>
      )}

      {sentences.length === 0 ? (
        <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
          No example sentences yet.
          {onGenerateSentences
            ? ' Click "Find Examples" to fetch sentences from Tatoeba.'
            : ''}
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200/70 dark:divide-zinc-800/80 border-t border-b border-zinc-200/70 dark:border-zinc-800/80">
          {formattedRows.map(({ sent, formatted }) => {
            const highlights = [sent.targetHighlight ?? '', highlightTerm ?? ''];
            const showReadingRow =
              showFurigana &&
              Boolean(sent.furigana) &&
              formatted.displayJapanese !== sent.furigana;

            return (
              <li key={sent.id} className={compact ? 'py-2.5' : 'py-3.5'}>
                <p className="font-jp text-base sm:text-[17px] leading-relaxed text-zinc-900 dark:text-zinc-100">
                  {renderHighlightedText(formatted.displayJapanese, highlights)}
                </p>
                {showReadingRow && (
                  <p className="font-jp mt-0.5 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
                    {renderHighlightedText(sent.furigana, highlights)}
                  </p>
                )}
                <p className="mt-1.5 text-xs sm:text-sm text-zinc-700 dark:text-zinc-300">
                  <span className="font-medium text-zinc-500 dark:text-zinc-400 mr-1.5">
                    Translation:
                  </span>
                  {sent.english}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
