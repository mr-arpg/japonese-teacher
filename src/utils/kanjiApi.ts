import { ExampleSentence } from '../types';
import { parseTatoebaHrkt } from './sentenceText';

export interface KanjiApiResult {
  kanji: string;
  meanings: string[];
  onyomi: string[];
  kunyomi: string[];
  strokeCount: number;
  jlpt?: number;
  grade?: number;
  sentences: ExampleSentence[];
}

interface KanjiApiResponse {
  kanji: string;
  grade?: number;
  stroke_count?: number;
  meanings?: string[];
  kun_readings?: string[];
  on_readings?: string[];
  jlpt?: number;
}

interface KanjiApiWord {
  variants: Array<{
    written: string;
    pronounced: string;
    priorities?: string[];
  }>;
  meanings: Array<{
    glosses: string[];
  }>;
}

export async function fetchKanjiInfo(char: string): Promise<KanjiApiResult> {
  const trimmed = char.trim();
  if (!trimmed) {
    throw new Error('Please enter a Kanji character.');
  }
  const singleChar = Array.from(trimmed)[0];
  const encoded = encodeURIComponent(singleChar);

  const res = await fetch(`https://kanjiapi.dev/v1/kanji/${encoded}`);
  if (!res.ok) {
    throw new Error(`Could not find "${singleChar}" on KanjiAPI.dev (HTTP ${res.status}).`);
  }

  const data = (await res.json()) as KanjiApiResponse;

  // Prefer authentic Japanese sentences with full English translations and Hrkt readings
  let sentences: ExampleSentence[] = [];
  try {
    const sentRes = await fetch(
      `/api/dictionary/sentences?query=${encodeURIComponent(singleChar)}`
    );
    if (sentRes.ok) {
      const raw = (await sentRes.json()) as {
        results?: Array<{
          id?: number;
          text?: string;
          translations?: Array<Array<{ text?: string; lang?: string }>>;
          transcriptions?: Array<{ script?: string; text?: string }>;
        }>;
      };
      const items = raw.results ?? [];
      for (const item of items) {
        const eng = item.translations
          ?.flat()
          .find((t) => t.lang === 'eng' && t.text)?.text;
        const hrkt = item.transcriptions?.find(
          (t) => t.script === 'Hrkt' && t.text
        )?.text;
        if (!eng || !hrkt) continue;
        const parsed = parseTatoebaHrkt(hrkt);
        sentences.push({
          id: `tatoeba-${item.id ?? sentences.length}`,
          japanese: parsed.japanese,
          furigana: parsed.furigana,
          english: eng,
          targetHighlight: singleChar,
          segments: parsed.segments,
        });
        if (sentences.length >= 3) break;
      }
    }
  } catch {
    // Fall back to compound-word sentences below
  }

  // Fallback to sample compound words to build natural contextual example sentences
  if (sentences.length === 0) {
    try {
      const wordsRes = await fetch(`https://kanjiapi.dev/v1/words/${encoded}`);
      if (wordsRes.ok) {
        const wordsData = (await wordsRes.json()) as KanjiApiWord[];
        const commonWords = wordsData
          .filter((w) => w.variants?.[0]?.written && w.meanings?.[0]?.glosses?.[0])
          .slice(0, 3);

        sentences = commonWords.map((w, idx) => {
          const variant = w.variants[0];
          const gloss = w.meanings[0].glosses.slice(0, 2).join(', ');
          if (idx === 0) {
            return {
              id: `api-sent-${idx}-${Date.now()}`,
              japanese: `毎日「${variant.written}」をよく使います。`,
              furigana: `まいにち「${variant.pronounced}」をよくつかいます。`,
              english: `I often use "${variant.written}" (${gloss}) every day.`,
              targetHighlight: variant.written,
            };
          }
          if (idx === 1) {
            return {
              id: `api-sent-${idx}-${Date.now()}`,
              japanese: `この${variant.written}はとても大切です。`,
              furigana: `この${variant.pronounced}はとてもたいせつです。`,
              english: `This ${gloss} (${variant.written}) is very important.`,
              targetHighlight: variant.written,
            };
          }
          return {
            id: `api-sent-${idx}-${Date.now()}`,
            japanese: `新しい${variant.written}を覚えました。`,
            furigana: `あたらしい${variant.pronounced}をおぼえました。`,
            english: `I memorized the new word ${variant.written} (${gloss}).`,
            targetHighlight: variant.written,
          };
        });
      }
    } catch {
      // Fallback below if words endpoint fails
    }
  }

  if (sentences.length === 0) {
    const primaryMeaning = data.meanings?.[0] ?? 'meaning';
    const primaryReading = data.kun_readings?.[0] || data.on_readings?.[0] || singleChar;
    sentences = [
      {
        id: `fallback-sent-1-${Date.now()}`,
        japanese: `ノートに「${singleChar}」を書きました。`,
        furigana: `ノートに「${primaryReading}」をかきました。`,
        english: `I wrote "${singleChar}" (${primaryMeaning}) in my notebook.`,
        targetHighlight: singleChar,
      },
      {
        id: `fallback-sent-2-${Date.now()}`,
        japanese: `この漢字は「${singleChar}」と読みます。`,
        furigana: `このかんじは「${primaryReading}」とよみます。`,
        english: `This kanji is read as "${primaryReading}" (${primaryMeaning}).`,
        targetHighlight: singleChar,
      },
    ];
  }

  return {
    kanji: data.kanji || singleChar,
    meanings: data.meanings ?? [],
    onyomi: data.on_readings ?? [],
    kunyomi: data.kun_readings ?? [],
    strokeCount: data.stroke_count ?? 0,
    jlpt: data.jlpt,
    grade: data.grade,
    sentences,
  };
}
