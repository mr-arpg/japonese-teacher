import { Deck, ExampleSentence, SentenceSegment } from '../types';

const KANJI_CHAR_RE = /[\u4E00-\u9FAF\u3400-\u4DBF々]/;
const KANJI_TEST_RE = /[\u4E00-\u9FAF\u3400-\u4DBF]/;

export function containsKanji(text: string): boolean {
  return KANJI_TEST_RE.test(text);
}

export function getKanjiChars(text: string): string[] {
  const result: string[] = [];
  for (const ch of Array.from(text)) {
    if (KANJI_TEST_RE.test(ch)) {
      result.push(ch);
    }
  }
  return result;
}

/**
 * Collects all Kanji characters the user has already learned:
 * - Kanji cards with repetitions >= 1 or correctCount >= 1 or interval >= 1
 * - Plus any kanji explicitly marked as learned in settings.customLearnedKanji
 */
export function collectLearnedKanji(
  decks: Deck[],
  customLearnedKanji: string[] = []
): Set<string> {
  const learned = new Set<string>();

  for (const ch of customLearnedKanji) {
    for (const k of getKanjiChars(ch)) {
      learned.add(k);
    }
  }

  for (const deck of decks) {
    if (deck.type !== 'kanji') continue;
    for (const card of deck.cards) {
      if (
        card.character &&
        (card.repetitions >= 1 || card.correctCount >= 1 || card.interval >= 1)
      ) {
        for (const k of getKanjiChars(card.character)) {
          learned.add(k);
        }
      }
    }
  }

  return learned;
}

/**
 * Parses Tatoeba Hrkt ruby markup such as:
 *   "[図書館|と|しょ|かん]にいるの？"
 *   "[明日|あした]は[晴|は]れです。"
 */
export function parseTatoebaHrkt(hrktText: string): {
  japanese: string;
  furigana: string;
  segments: SentenceSegment[];
} {
  const segments: SentenceSegment[] = [];
  const regex = /\[([^\]|]+)\|([^\]]+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(hrktText)) !== null) {
    if (match.index > lastIndex) {
      const plain = hrktText.slice(lastIndex, match.index);
      segments.push({ text: plain });
    }

    const base = match[1];
    const readingParts = match[2].split('|').filter((p) => p.length > 0);
    const baseChars = Array.from(base);

    if (readingParts.length === baseChars.length && readingParts.length > 1) {
      for (let i = 0; i < baseChars.length; i++) {
        const ch = baseChars[i];
        const rd = readingParts[i];
        segments.push(
          containsKanji(ch) ? { text: ch, reading: rd } : { text: ch }
        );
      }
    } else {
      const joinedReading = readingParts.join('');
      segments.push(
        containsKanji(base)
          ? { text: base, reading: joinedReading }
          : { text: base }
      );
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < hrktText.length) {
    segments.push({ text: hrktText.slice(lastIndex) });
  }

  const japanese = segments.map((s) => s.text).join('');
  const furigana = segments.map((s) => s.reading ?? s.text).join('');

  return { japanese, furigana, segments };
}

interface RawToken {
  isKanji: boolean;
  text: string;
  kanjiCount: number;
}

function tokenizeJapanese(japanese: string): RawToken[] {
  const chars = Array.from(japanese);
  const tokens: RawToken[] = [];
  let buf = '';
  let bufIsKanji: boolean | null = null;

  for (const ch of chars) {
    const isK = KANJI_CHAR_RE.test(ch);
    if (bufIsKanji === null || bufIsKanji === isK) {
      buf += ch;
      bufIsKanji = isK;
    } else {
      tokens.push({
        isKanji: bufIsKanji,
        text: buf,
        kanjiCount: bufIsKanji ? Array.from(buf).length : 0,
      });
      buf = ch;
      bufIsKanji = isK;
    }
  }

  if (buf && bufIsKanji !== null) {
    tokens.push({
      isKanji: bufIsKanji,
      text: buf,
      kanjiCount: bufIsKanji ? Array.from(buf).length : 0,
    });
  }

  return tokens;
}

/**
 * Aligns a Japanese sentence and its full kana reading (furigana) into segments
 * using memoized anchor matching on non-kanji characters.
 */
export function alignSentenceSegments(
  japanese: string,
  furigana: string
): SentenceSegment[] {
  if (!japanese) return [];
  if (!containsKanji(japanese)) {
    return [{ text: japanese }];
  }
  if (!furigana || furigana.trim().length === 0) {
    return [{ text: japanese }];
  }

  const tokens = tokenizeJapanese(japanese);
  const furi = furigana;
  const memo = new Map<string, SentenceSegment[] | null>();

  function solve(ti: number, fi: number): SentenceSegment[] | null {
    const key = `${ti}:${fi}`;
    if (memo.has(key)) return memo.get(key) ?? null;

    if (ti === tokens.length) {
      const result = fi === furi.length ? [] : null;
      memo.set(key, result);
      return result;
    }

    const tok = tokens[ti];

    if (!tok.isKanji) {
      if (furi.startsWith(tok.text, fi)) {
        const rest = solve(ti + 1, fi + tok.text.length);
        if (rest !== null) {
          const out = [{ text: tok.text }, ...rest];
          memo.set(key, out);
          return out;
        }
      }
      memo.set(key, null);
      return null;
    }

    // Kanji run: must consume at least tok.kanjiCount kana chars (or 1 if last)
    const minLen = Math.max(1, tok.kanjiCount);
    const maxLen = Math.min(furi.length - fi, tok.kanjiCount * 6 + 2);

    // If this is the final token, it must consume the rest of furi
    if (ti === tokens.length - 1) {
      const reading = furi.slice(fi);
      if (reading.length >= minLen) {
        const out = [{ text: tok.text, reading }];
        memo.set(key, out);
        return out;
      }
      memo.set(key, null);
      return null;
    }

    const nextAnchor = tokens[ti + 1];
    for (let len = minLen; len <= maxLen; len++) {
      const nextPos = fi + len;
      if (!nextAnchor.isKanji && !furi.startsWith(nextAnchor.text, nextPos)) {
        continue;
      }
      const rest = solve(ti + 1, nextPos);
      if (rest !== null) {
        const out = [{ text: tok.text, reading: furi.slice(fi, nextPos) }, ...rest];
        memo.set(key, out);
        return out;
      }
    }

    memo.set(key, null);
    return null;
  }

  const aligned = solve(0, 0);
  if (aligned) return aligned;

  return [{ text: japanese, reading: furigana }];
}

export interface FormattedSentenceResult {
  displayJapanese: string;
  furigana: string;
  switchedCount: number;
  hasUnalignedKanji: boolean;
}

/**
 * Formats a Japanese sentence so it contains ONLY hiragana, katakana,
 * punctuation, and kanji that the user has already learned.
 * Any unlearned kanji is replaced with its hiragana or katakana reading.
 */
export function formatSentenceForLearnedKanji(
  sentence: ExampleSentence,
  learnedKanji: Set<string>,
  onlyLearnedKanji = true
): FormattedSentenceResult {
  if (!onlyLearnedKanji) {
    return {
      displayJapanese: sentence.japanese,
      furigana: sentence.furigana,
      switchedCount: 0,
      hasUnalignedKanji: false,
    };
  }

  const segments =
    sentence.segments && sentence.segments.length > 0
      ? sentence.segments
      : alignSentenceSegments(sentence.japanese, sentence.furigana);

  let switchedCount = 0;
  let hasUnalignedKanji = false;
  let out = '';

  for (const seg of segments) {
    const kanjiInSeg = getKanjiChars(seg.text);
    if (kanjiInSeg.length === 0) {
      out += seg.text;
      continue;
    }

    const allLearned = kanjiInSeg.every((k) => learnedKanji.has(k));
    if (allLearned) {
      out += seg.text;
    } else if (seg.reading && seg.reading.length > 0) {
      out += seg.reading;
      switchedCount += kanjiInSeg.length;
    } else {
      out += seg.text;
      hasUnalignedKanji = true;
    }
  }

  return {
    displayJapanese: out,
    furigana: sentence.furigana,
    switchedCount,
    hasUnalignedKanji,
  };
}
