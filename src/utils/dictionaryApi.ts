import {
  ExampleSentence,
  KanjiCompoundWord,
  KanjiDictionaryEntry,
  KanjiListCategory,
  StudyCard,
  WordDictionaryEntry,
} from '../types';
import { KanjiVgParsed } from './kanjiVg';
import { parseTatoebaHrkt } from './sentenceText';

const KANJI_REGEX = /[\u4E00-\u9FAF\u3400-\u4DBF]/;
const KANA_REGEX = /^[\u3040-\u309F\u30A0-\u30FFー・.\s]+$/;

export function extractKanjiChars(text: string): string[] {
  const seen = new Set<string>();
  const chars: string[] = [];
  for (const ch of Array.from(text)) {
    if (KANJI_REGEX.test(ch) && !seen.has(ch)) {
      seen.add(ch);
      chars.push(ch);
    }
  }
  return chars;
}

export function isPureKana(text: string): boolean {
  return KANA_REGEX.test(text.trim());
}

export function hiraganaToKatakana(input: string): string {
  return input.replace(/[\u3041-\u3096]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60)
  );
}

const ROMAJI_TABLE: Array<[string, string]> = [
  ['kya', 'きゃ'], ['kyu', 'きゅ'], ['kyo', 'きょ'],
  ['sha', 'しゃ'], ['shu', 'しゅ'], ['sho', 'しょ'],
  ['cha', 'ちゃ'], ['chu', 'ちゅ'], ['cho', 'ちょ'],
  ['nya', 'にゃ'], ['nyu', 'にゅ'], ['nyo', 'にょ'],
  ['hya', 'ひゃ'], ['hyu', 'ひゅ'], ['hyo', 'ひょ'],
  ['mya', 'みゃ'], ['myu', 'みゅ'], ['myo', 'みょ'],
  ['rya', 'りゃ'], ['ryu', 'りゅ'], ['ryo', 'りょ'],
  ['gya', 'ぎゃ'], ['gyu', 'ぎゅ'], ['gyo', 'ぎょ'],
  ['ja', 'じゃ'], ['ju', 'じゅ'], ['jo', 'じょ'],
  ['bya', 'びゃ'], ['byu', 'びゅ'], ['byo', 'びょ'],
  ['pya', 'ぴゃ'], ['pyu', 'ぴゅ'], ['pyo', 'ぴょ'],
  ['tsu', 'つ'], ['shi', 'し'], ['chi', 'ち'], ['fu', 'ふ'],
  ['ka', 'か'], ['ki', 'き'], ['ku', 'く'], ['ke', 'け'], ['ko', 'こ'],
  ['sa', 'さ'], ['su', 'す'], ['se', 'せ'], ['so', 'そ'],
  ['ta', 'た'], ['te', 'て'], ['to', 'と'],
  ['na', 'な'], ['ni', 'に'], ['nu', 'ぬ'], ['ne', 'ね'], ['no', 'の'],
  ['ha', 'は'], ['hi', 'ひ'], ['he', 'へ'], ['ho', 'ほ'],
  ['ma', 'ま'], ['mi', 'み'], ['mu', 'む'], ['me', 'め'], ['mo', 'も'],
  ['ya', 'や'], ['yu', 'ゆ'], ['yo', 'よ'],
  ['ra', 'ら'], ['ri', 'り'], ['ru', 'る'], ['re', 'れ'], ['ro', 'ろ'],
  ['wa', 'わ'], ['wo', 'を'],
  ['ga', 'が'], ['gi', 'ぎ'], ['gu', 'ぐ'], ['ge', 'げ'], ['go', 'ご'],
  ['za', 'ざ'], ['ji', 'じ'], ['zu', 'ず'], ['ze', 'ぜ'], ['zo', 'ぞ'],
  ['da', 'だ'], ['di', 'ぢ'], ['du', 'づ'], ['de', 'で'], ['do', 'ど'],
  ['ba', 'ば'], ['bi', 'び'], ['bu', 'ぶ'], ['be', 'べ'], ['bo', 'ぼ'],
  ['pa', 'ぱ'], ['pi', 'ぴ'], ['pu', 'ぷ'], ['pe', 'ぺ'], ['po', 'ぽ'],
  ['a', 'あ'], ['i', 'い'], ['u', 'う'], ['e', 'え'], ['o', 'お'],
];

export function romajiToHiragana(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!/^[a-z]+$/.test(s)) return null;

  let out = '';
  let i = 0;
  while (i < s.length) {
    // Double consonant (small tsu)
    if (
      i + 1 < s.length &&
      s[i] === s[i + 1] &&
      !'aiueon'.includes(s[i])
    ) {
      out += 'っ';
      i += 1;
      continue;
    }

    // Standalone n before consonant or end
    if (s[i] === 'n') {
      const next = s[i + 1];
      if (!next || (!'aiueoy'.includes(next) && next !== 'n')) {
        out += 'ん';
        i += 1;
        continue;
      }
      if (next === 'n' && i + 2 <= s.length) {
        out += 'ん';
        i += 1;
        continue;
      }
    }

    let matched = false;
    for (const [rom, kana] of ROMAJI_TABLE) {
      if (s.startsWith(rom, i)) {
        out += kana;
        i += rom.length;
        matched = true;
        break;
      }
    }
    if (!matched) return null;
  }

  return out.length > 0 ? out : null;
}

async function fetchJsonWithFallback<T>(
  proxyUrl: string,
  directUrl?: string
): Promise<T> {
  const res = await fetch(proxyUrl);
  if (res.ok) {
    return (await res.json()) as T;
  }
  if (directUrl) {
    const direct = await fetch(directUrl);
    if (direct.ok) {
      return (await direct.json()) as T;
    }
  }
  throw new Error(`Request failed (${res.status})`);
}

export async function fetchKanjiList(category: KanjiListCategory): Promise<string[]> {
  return fetchJsonWithFallback<string[]>(
    `/api/dictionary/kanji/list/${encodeURIComponent(category)}`,
    `https://kanjiapi.dev/v1/kanji/${encodeURIComponent(category)}`
  );
}

interface RawKanjiApiDetail {
  kanji: string;
  grade?: number;
  stroke_count?: number;
  meanings?: string[];
  kun_readings?: string[];
  on_readings?: string[];
  name_readings?: string[];
  jlpt?: number;
  unicode?: string;
  heisig_en?: string;
  freq_mainichi_shinbun?: number;
}

export async function fetchKanjiDetail(char: string): Promise<KanjiDictionaryEntry> {
  const single = Array.from(char.trim())[0];
  if (!single) {
    throw new Error('No Kanji character provided.');
  }
  const encoded = encodeURIComponent(single);
  const data = await fetchJsonWithFallback<RawKanjiApiDetail>(
    `/api/dictionary/kanji/char/${encoded}`,
    `https://kanjiapi.dev/v1/kanji/${encoded}`
  );

  return {
    kanji: data.kanji || single,
    grade: data.grade,
    strokeCount: data.stroke_count ?? 0,
    meanings: data.meanings ?? [],
    kunReadings: data.kun_readings ?? [],
    onReadings: data.on_readings ?? [],
    nameReadings: data.name_readings ?? [],
    jlpt: data.jlpt,
    unicode: data.unicode,
    heisigEn: data.heisig_en,
    frequency: data.freq_mainichi_shinbun,
  };
}

interface RawKanjiApiWord {
  variants?: Array<{
    written?: string;
    pronounced?: string;
    priorities?: string[];
  }>;
  meanings?: Array<{
    glosses?: string[];
  }>;
}

export async function fetchKanjiCompounds(char: string): Promise<KanjiCompoundWord[]> {
  const single = Array.from(char.trim())[0];
  if (!single) return [];
  const encoded = encodeURIComponent(single);

  const raw = await fetchJsonWithFallback<RawKanjiApiWord[]>(
    `/api/dictionary/kanji/words/${encoded}`,
    `https://kanjiapi.dev/v1/words/${encoded}`
  );

  const mapped: KanjiCompoundWord[] = [];
  for (const item of raw) {
    const variant = item.variants?.[0];
    const glosses = item.meanings?.flatMap((m) => m.glosses ?? []) ?? [];
    if (!variant?.written || glosses.length === 0) continue;
    mapped.push({
      written: variant.written,
      pronounced: variant.pronounced ?? '',
      meanings: glosses.slice(0, 4),
      isCommon: Boolean(variant.priorities && variant.priorities.length > 0),
    });
  }

  mapped.sort((a, b) => Number(b.isCommon) - Number(a.isCommon));
  return mapped;
}

interface RawKanjiReadingResponse {
  main_kanji?: string[];
  name_kanji?: string[];
}

async function fetchKanjiByReading(reading: string): Promise<string[]> {
  const encoded = encodeURIComponent(reading);
  try {
    const data = await fetchJsonWithFallback<RawKanjiReadingResponse>(
      `/api/dictionary/kanji/reading/${encoded}`,
      `https://kanjiapi.dev/v1/reading/${encoded}`
    );
    return [...(data.main_kanji ?? []), ...(data.name_kanji ?? [])];
  } catch {
    return [];
  }
}

export async function searchKanjiByQuery(query: string): Promise<{
  kanji: string[];
  strategyLabel: string;
}> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { kanji: [], strategyLabel: '' };
  }

  // 1. Direct Kanji characters present in query
  const directKanji = extractKanjiChars(trimmed);
  if (directKanji.length > 0) {
    return {
      kanji: directKanji,
      strategyLabel: `Kanji matching "${trimmed}"`,
    };
  }

  // 2. Pure Hiragana / Katakana reading search
  if (isPureKana(trimmed)) {
    const kata = hiraganaToKatakana(trimmed);
    const [hiraMatches, kataMatches] = await Promise.all([
      fetchKanjiByReading(trimmed),
      kata !== trimmed ? fetchKanjiByReading(kata) : Promise.resolve([]),
    ]);
    const merged = Array.from(new Set([...hiraMatches, ...kataMatches]));
    return {
      kanji: merged,
      strategyLabel: `Kanji with reading "${trimmed}"`,
    };
  }

  // 3. English or Romaji query: combine Jisho meaning lookup + optional Romaji reading lookup
  const romajiKana = romajiToHiragana(trimmed);
  const [wordEntries, readingHira, readingKata] = await Promise.all([
    searchWordDictionary(trimmed, 1).catch(() => [] as WordDictionaryEntry[]),
    romajiKana ? fetchKanjiByReading(romajiKana) : Promise.resolve([]),
    romajiKana ? fetchKanjiByReading(hiraganaToKatakana(romajiKana)) : Promise.resolve([]),
  ]);

  const fromWords: string[] = [];
  for (const entry of wordEntries) {
    for (const form of entry.japanese) {
      if (form.word) {
        fromWords.push(...extractKanjiChars(form.word));
      }
    }
  }

  const combined = Array.from(
    new Set([...readingHira, ...readingKata, ...fromWords])
  );

  return {
    kanji: combined,
    strategyLabel: romajiKana
      ? `Kanji matching "${trimmed}" (${romajiKana})`
      : `Kanji related to "${trimmed}"`,
  };
}

interface RawJishoResponse {
  meta?: { status?: number };
  data?: Array<{
    slug?: string;
    is_common?: boolean;
    tags?: string[];
    jlpt?: string[];
    japanese?: Array<{
      word?: string;
      reading?: string;
    }>;
    senses?: Array<{
      english_definitions?: string[];
      parts_of_speech?: string[];
      tags?: string[];
      info?: string[];
      see_also?: string[];
      antonyms?: string[];
    }>;
  }>;
}

export async function searchWordDictionary(
  keyword: string,
  page = 1
): Promise<WordDictionaryEntry[]> {
  const trimmed = keyword.trim();
  if (!trimmed) return [];

  const res = await fetch(
    `/api/dictionary/words?keyword=${encodeURIComponent(trimmed)}&page=${page}`
  );
  if (!res.ok) {
    throw new Error(`Word dictionary request failed (HTTP ${res.status}).`);
  }

  const json = (await res.json()) as RawJishoResponse;
  const rows = json.data ?? [];

  return rows.map((row, idx) => ({
    slug: row.slug || `word-${page}-${idx}`,
    isCommon: Boolean(row.is_common),
    tags: row.tags ?? [],
    jlpt: row.jlpt ?? [],
    japanese: (row.japanese ?? []).map((j) => ({
      word: j.word,
      reading: j.reading,
    })),
    senses: (row.senses ?? [])
      .filter((s) => (s.english_definitions ?? []).length > 0)
      .map((s) => ({
        englishDefinitions: s.english_definitions ?? [],
        partsOfSpeech: s.parts_of_speech ?? [],
        tags: s.tags ?? [],
        info: s.info ?? [],
        seeAlso: s.see_also ?? [],
        antonyms: s.antonyms ?? [],
      })),
  }));
}

interface RawTatoebaResponse {
  results?: Array<{
    id?: number;
    text?: string;
    translations?: Array<Array<{ text?: string; lang?: string }>>;
    transcriptions?: Array<{ script?: string; text?: string }>;
  }>;
}

export async function fetchDictionarySentences(
  query: string,
  highlightTerm?: string
): Promise<ExampleSentence[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  try {
    const res = await fetch(
      `/api/dictionary/sentences?query=${encodeURIComponent(trimmed)}`
    );
    if (!res.ok) return [];

    const json = (await res.json()) as RawTatoebaResponse;
    const rows = json.results ?? [];
    const out: ExampleSentence[] = [];

    for (const row of rows) {
      const english = row.translations
        ?.flat()
        .find((t) => t.lang === 'eng' && t.text)?.text;
      const hrkt = row.transcriptions?.find(
        (t) => t.script === 'Hrkt' && t.text
      )?.text;

      if (!english || !hrkt) continue;

      const parsed = parseTatoebaHrkt(hrkt);
      out.push({
        id: `tatoeba-${row.id ?? out.length}`,
        japanese: parsed.japanese,
        furigana: parsed.furigana,
        english,
        targetHighlight: highlightTerm || trimmed,
        segments: parsed.segments,
      });
      if (out.length >= 4) break;
    }

    return out;
  } catch {
    return [];
  }
}

export interface GenerateA1SentencesParams {
  target: string;
  meanings?: string[];
  readings?: string[];
  count?: number;
  learnedKanji?: string[];
  excludeSentences?: string[];
}

export async function generateA1Sentences(
  params: GenerateA1SentencesParams
): Promise<ExampleSentence[]> {
  const res = await fetch('/api/sentences/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = (await res.json().catch(() => ({}))) as {
    sentences?: ExampleSentence[];
    error?: string;
  };

  if (!res.ok) {
    throw new Error(data.error || `Sentence generation failed (HTTP ${res.status}).`);
  }

  return data.sentences ?? [];
}

export function buildKanjiCardFromDictionary(
  deckId: string,
  entry: KanjiDictionaryEntry,
  vgData: KanjiVgParsed | null,
  compounds: KanjiCompoundWord[],
  exampleSentences: ExampleSentence[] = []
): StudyCard {
  const now = Date.now();
  const combinedKana = [entry.onReadings.join(', '), entry.kunReadings.join(', ')]
    .filter(Boolean)
    .join(' / ');

  const sampleCompounds = compounds.slice(0, 3);
  const sentences: ExampleSentence[] =
    exampleSentences.length > 0
      ? exampleSentences
      : sampleCompounds.length > 0
      ? sampleCompounds.map((c, idx) => ({
          id: `dict-sent-${now}-${idx}`,
          japanese: `毎日「${c.written}」をよく使います。`,
          furigana: `まいにち「${c.pronounced || c.written}」をよくつかいます。`,
          english: `I often use "${c.written}" (${c.meanings.slice(0, 2).join(', ')}) every day.`,
          targetHighlight: c.written,
        }))
      : [
          {
            id: `dict-sent-${now}-0`,
            japanese: `ノートに「${entry.kanji}」を書きました。`,
            furigana: `ノートに「${entry.kunReadings[0] || entry.onReadings[0] || entry.kanji}」をかきました。`,
            english: `I wrote "${entry.kanji}" (${entry.meanings[0] ?? ''}) in my notebook.`,
            targetHighlight: entry.kanji,
          },
        ];

  return {
    id: `card-${now}-${Math.random().toString(36).slice(2, 7)}`,
    deckId,
    type: 'kanji',
    character: entry.kanji,
    kana: combinedKana || entry.kanji,
    onyomi: entry.onReadings,
    kunyomi: entry.kunReadings,
    meanings: entry.meanings.length > 0 ? entry.meanings.slice(0, 5) : [entry.kanji],
    radicals: vgData?.radicals,
    strokeCount: vgData?.strokes.length || entry.strokeCount || undefined,
    customSvgPaths: vgData?.rawPaths,
    sentences,
    interval: 0,
    easeFactor: 2.5,
    repetitions: 0,
    nextReview: now,
    lapses: 0,
    correctCount: 0,
    attemptCount: 0,
  };
}

export function buildVocabCardFromDictionary(
  deckId: string,
  entry: WordDictionaryEntry,
  exampleSentences: ExampleSentence[] = []
): StudyCard {
  const now = Date.now();
  const primaryForm = entry.japanese[0] ?? {};
  const kana = primaryForm.reading || primaryForm.word || entry.slug;
  const character =
    primaryForm.word && primaryForm.word !== kana ? primaryForm.word : undefined;

  const meanings = entry.senses
    .filter((s) => !s.partsOfSpeech.includes('Wikipedia definition'))
    .flatMap((s) => s.englishDefinitions)
    .slice(0, 5);

  const displayTerm = character || kana;
  const primaryMeaning = meanings[0] ?? entry.slug;

  const sentences: ExampleSentence[] =
    exampleSentences.length > 0
      ? exampleSentences
      : [
          {
            id: `dict-vocab-sent-${now}`,
            japanese: `会話で「${displayTerm}」をよく使います。`,
            furigana: `かいわで「${kana}」をよくつかいます。`,
            english: `I often use "${displayTerm}" (${primaryMeaning}) in conversation.`,
            targetHighlight: displayTerm,
          },
        ];

  return {
    id: `card-${now}-${Math.random().toString(36).slice(2, 7)}`,
    deckId,
    type: 'vocab',
    character,
    kana,
    meanings: meanings.length > 0 ? meanings : [entry.slug],
    sentences,
    interval: 0,
    easeFactor: 2.5,
    repetitions: 0,
    nextReview: now,
    lapses: 0,
    correctCount: 0,
    attemptCount: 0,
  };
}

