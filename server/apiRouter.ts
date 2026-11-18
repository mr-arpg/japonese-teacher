import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import express, { Router } from 'express';

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_ENTRIES = 500;
const apiCache = new Map<string, CacheEntry>();

function getCached(key: string): unknown | null {
  const entry = apiCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    apiCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key: string, data: unknown): void {
  if (apiCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = apiCache.keys().next().value;
    if (oldestKey) apiCache.delete(oldestKey);
  }
  apiCache.set(key, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

async function fetchUpstreamJson(url: string, cacheKey: string): Promise<unknown> {
  const cached = getCached(cacheKey);
  if (cached !== null) {
    return cached;
  }

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Kakuso-Japanese-Study-Studio/1.0',
    },
  });

  if (!response.ok) {
    const error = new Error(`Upstream HTTP ${response.status}`) as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }

  const json: unknown = await response.json();
  setCached(cacheKey, json);
  return json;
}

const ALLOWED_KANJI_LISTS = new Set([
  'grade-1',
  'grade-2',
  'grade-3',
  'grade-4',
  'grade-5',
  'grade-6',
  'grade-8',
  'joyo',
  'jinmeiyo',
  'heisig',
]);

export function createApiRouter(): Router {
  const router = express.Router();

  // Japanese Word Dictionary (Jisho / JMdict)
  router.get('/dictionary/words', async (req, res) => {
    const rawKeyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : '';
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);

    if (!rawKeyword) {
      res.status(400).json({ error: 'Query parameter "keyword" is required.' });
      return;
    }

    const encodedKeyword = encodeURIComponent(rawKeyword);
    const url = `https://jisho.org/api/v1/search/words?keyword=${encodedKeyword}&page=${page}`;
    const cacheKey = `jisho:${rawKeyword.toLowerCase()}:${page}`;

    try {
      const data = await fetchUpstreamJson(url, cacheKey);
      res.json(data);
    } catch (err) {
      const status = (err as { status?: number }).status || 502;
      res.status(status).json({
        error: 'Unable to fetch word dictionary entries from Jisho.',
      });
    }
  });

  // Kanji Dictionary: curated character lists (grade-1..6, grade-8, joyo, jinmeiyo)
  router.get('/dictionary/kanji/list/:category', async (req, res) => {
    const category = req.params.category;
    if (!ALLOWED_KANJI_LISTS.has(category)) {
      res.status(400).json({ error: 'Invalid kanji list category.' });
      return;
    }

    const url = `https://kanjiapi.dev/v1/kanji/${encodeURIComponent(category)}`;
    try {
      const data = await fetchUpstreamJson(url, `kanji-list:${category}`);
      res.json(data);
    } catch (err) {
      const status = (err as { status?: number }).status || 502;
      res.status(status).json({ error: 'Unable to load kanji list.' });
    }
  });

  // Kanji Dictionary: single character details
  router.get('/dictionary/kanji/char/:char', async (req, res) => {
    const singleChar = Array.from(req.params.char.trim())[0];
    if (!singleChar) {
      res.status(400).json({ error: 'Kanji character is required.' });
      return;
    }

    const url = `https://kanjiapi.dev/v1/kanji/${encodeURIComponent(singleChar)}`;
    try {
      const data = await fetchUpstreamJson(url, `kanji-char:${singleChar}`);
      res.json(data);
    } catch (err) {
      const status = (err as { status?: number }).status || 502;
      res.status(status).json({ error: `Kanji "${singleChar}" not found.` });
    }
  });

  // Kanji Dictionary: words containing a kanji
  router.get('/dictionary/kanji/words/:char', async (req, res) => {
    const singleChar = Array.from(req.params.char.trim())[0];
    if (!singleChar) {
      res.status(400).json({ error: 'Kanji character is required.' });
      return;
    }

    const url = `https://kanjiapi.dev/v1/words/${encodeURIComponent(singleChar)}`;
    try {
      const data = await fetchUpstreamJson(url, `kanji-words:${singleChar}`);
      res.json(data);
    } catch (err) {
      const status = (err as { status?: number }).status || 502;
      res.status(status).json({ error: `Compound words for "${singleChar}" not found.` });
    }
  });

  // Kanji Dictionary: search kanji by reading (hiragana / katakana)
  router.get('/dictionary/kanji/reading/:reading', async (req, res) => {
    const reading = req.params.reading.trim();
    if (!reading) {
      res.status(400).json({ error: 'Reading is required.' });
      return;
    }

    const url = `https://kanjiapi.dev/v1/reading/${encodeURIComponent(reading)}`;
    try {
      const data = await fetchUpstreamJson(url, `kanji-reading:${reading}`);
      res.json(data);
    } catch (err) {
      const status = (err as { status?: number }).status || 502;
      res.status(status).json({ error: `No kanji found for reading "${reading}".` });
    }
  });

  // Example Sentences (Tatoeba Japanese <-> English with Hrkt furigana markup)
  router.get('/dictionary/sentences', async (req, res) => {
    const rawQuery = typeof req.query.query === 'string' ? req.query.query.trim() : '';
    if (!rawQuery) {
      res.status(400).json({ error: 'Query parameter "query" is required.' });
      return;
    }

    const url = `https://tatoeba.org/en/api_v0/search?from=jpn&to=eng&query=${encodeURIComponent(
      rawQuery
    )}&limit=10`;
    try {
      const data = await fetchUpstreamJson(url, `tatoeba:${rawQuery}`);
      res.json(data);
    } catch (err) {
      const status = (err as { status?: number }).status || 502;
      res.status(status).json({ error: 'Unable to fetch example sentences.' });
    }
  });

  // Generate diverse, simple A1 Japanese example sentences via Gemini
  router.post('/sentences/generate', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      res.status(503).json({
        error:
          'Gemini API key is not configured. Please add GEMINI_API_KEY in your environment variables.',
      });
      return;
    }

    const body = (req.body ?? {}) as {
      target?: string;
      meanings?: string[];
      readings?: string[];
      count?: number;
      learnedKanji?: string[];
      excludeSentences?: string[];
    };

    const target = typeof body.target === 'string' ? body.target.trim() : '';
    if (!target) {
      res.status(400).json({ error: 'Field "target" is required.' });
      return;
    }

    const count = Math.min(6, Math.max(2, Number(body.count) || 4));
    const meanings = Array.isArray(body.meanings) ? body.meanings.slice(0, 6) : [];
    const readings = Array.isArray(body.readings) ? body.readings.slice(0, 6) : [];
    const learnedKanji = Array.isArray(body.learnedKanji) ? body.learnedKanji.slice(0, 80) : [];
    const excludeSentences = Array.isArray(body.excludeSentences)
      ? body.excludeSentences.slice(0, 12)
      : [];

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const systemInstruction = [
      'You are an expert Japanese language teacher creating beginner A1 (JLPT N5) textbook example sentences.',
      'Use ONLY formal, polite textbook Japanese (丁寧語 / です・ます style) in every single sentence.',
      'Every sentence MUST be a complete, fully formed grammatical sentence with proper particles (は, が, を, に, へ, で, と, の, etc.) and NO casual contractions (never use 〜てる, 〜ちゃう, or dropped particles) and NO sentence fragments.',
      'Never use plain/casual verb or copula endings (never end with 〜だ, 〜る, 〜た, 〜ない). Every sentence MUST end with a polite formal predicate such as 〜です。, 〜ます。, 〜ません。, 〜でした。, 〜ました。, 〜ませんでした。, or a formal question ending 〜ですか。, 〜ますか。, 〜ませんか。, 〜でしたか。, 〜ましたか。.',
      'For questions, ALWAYS end with the formal question particle か followed by a Japanese period 。 (e.g. 〜ですか。 or 〜ますか。). NEVER use a question mark (? or ？) or exclamation mark (! or ！).',
      'Generate diverse sentence structures and topics across the batch (never repeat the same template): e.g. identity/description ("AはBです。"), ownership/existence ("AはBを持っています。" or "〜に〜があります。/います。"), everyday actions ("〜を〜ます。"), preferences ("〜が好きです。"), destinations ("〜へ行きます。"), and formal questions ("〜ですか。", "〜ますか。").',
      'Use general A1 vocabulary (family, nature, food, school, animals, weather, home, simple adjectives and polite です/ます verbs).',
      'Return structured segments for each sentence where every kanji token has its exact hiragana/katakana reading so unlearned kanji can be replaced cleanly with kana.',
      'Prefer splitting regular kanji compounds into per-kanji segments (e.g. "田"->"た", "中"->"なか"; "森"->"もり"), and keep irregular/jukujikun words (like "一人っ子"->"ひとりっこ", "今日"->"きょう") as one segment.',
      'For pure hiragana, katakana, or punctuation segments, leave reading empty or omit it.',
      'Provide a complete, natural English translation of the whole sentence.',
    ].join(' ');

    const promptParts = [
      `Create ${count} diverse A1 Japanese example sentences using "${target}".`,
      meanings.length > 0 ? `Meanings of "${target}": ${meanings.join(', ')}.` : '',
      readings.length > 0 ? `Readings of "${target}": ${readings.join(', ')}.` : '',
      learnedKanji.length > 0
        ? `Kanji the learner already knows: ${learnedKanji.join('')}.`
        : 'The learner is a beginner who knows very few kanji yet, so keep vocabulary A1-level and provide exact kana readings on every kanji segment.',
      excludeSentences.length > 0
        ? `Do NOT repeat or closely paraphrase these existing sentences:\n- ${excludeSentences.join('\n- ')}`
        : '',
    ].filter(Boolean);

    try {
      const requestPayload = {
        model: 'gemini-4-hydrogen',
        contents: promptParts.join('\n'),
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                english: {
                  type: Type.STRING,
                  description: 'Full English translation of the entire Japanese sentence.',
                },
                targetHighlight: {
                  type: Type.STRING,
                  description: 'The exact substring in the Japanese sentence matching the target word or kanji.',
                },
                segments: {
                  type: Type.ARRAY,
                  description: 'Ordered segments concatenating to the full Japanese sentence.',
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      text: {
                        type: Type.STRING,
                        description: 'Surface Japanese text (kanji token or kana/punctuation run).',
                      },
                      reading: {
                        type: Type.STRING,
                        description: 'Hiragana or katakana reading if text contains kanji; empty otherwise.',
                      },
                    },
                    required: ['text'],
                  },
                },
              },
              required: ['english', 'targetHighlight', 'segments'],
            },
          },
        },
      };

      let response: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await ai.models.generateContent(requestPayload);
          break;
        } catch (err) {
          lastErr = err;
          const code = (err as { status?: number }).status;
          const isTransient = code === 429 || code === 503 || code === 500;
          if (!isTransient || attempt === 2) {
            throw err;
          }
          await new Promise((resolve) => setTimeout(resolve, 600 * Math.pow(2, attempt)));
        }
      }
      if (!response) {
        throw lastErr ?? new Error('Failed to generate A1 example sentences.');
      }

      const rawText = (response.text ?? '[]').trim();
      const parsed = JSON.parse(rawText) as Array<{
        english?: string;
        targetHighlight?: string;
        segments?: Array<{ text?: string; reading?: string }>;
      }>;

      if (!Array.isArray(parsed)) {
        res.status(502).json({ error: 'Model returned an unexpected sentence format.' });
        return;
      }

      const kanjiRe = /[\u4E00-\u9FAF\u3400-\u4DBF]/;
      const now = Date.now();
      const sentences = parsed
        .filter((item) => item && Array.isArray(item.segments) && item.segments.length > 0 && item.english)
        .map((item, idx) => {
          const cleanSegments = (item.segments ?? [])
            .filter((seg) => typeof seg.text === 'string' && seg.text.length > 0)
            .map((seg) => {
              const text = seg.text!;
              const reading =
                typeof seg.reading === 'string' && seg.reading.trim() && kanjiRe.test(text)
                  ? seg.reading.trim()
                  : undefined;
              return reading ? { text, reading } : { text };
            });

          if (cleanSegments.length > 0) {
            const last = cleanSegments[cleanSegments.length - 1];
            const hadQuestionMark = /[?？]\s*$/.test(last.text);
            let normalizedText = last.text.replace(/[?？!！。.\s]+$/g, '');
            if (hadQuestionMark && !normalizedText.endsWith('か')) {
              normalizedText += 'か';
            }
            normalizedText += '。';
            cleanSegments[cleanSegments.length - 1] = last.reading
              ? { text: normalizedText, reading: last.reading }
              : { text: normalizedText };
          }

          const japanese = cleanSegments.map((s) => s.text).join('');
          const furigana = cleanSegments.map((s) => s.reading ?? s.text).join('');

          return {
            id: `gen-${now}-${idx}`,
            japanese,
            furigana,
            english: item.english!.trim(),
            targetHighlight: item.targetHighlight?.trim() || target,
            segments: cleanSegments,
          };
        })
        .filter((s) => s.japanese.length > 0 && s.english.length > 0);

      res.json({ sentences });
    } catch (err) {
      const errorObj = err as { status?: number; message?: string };
      const status = typeof errorObj.status === 'number' && errorObj.status >= 400 ? errorObj.status : 502;
      let message = errorObj.message || 'Failed to generate A1 example sentences.';
      try {
        const parsedErr = JSON.parse(message) as { error?: { message?: string } };
        if (parsedErr?.error?.message) {
          message = parsedErr.error.message;
        }
      } catch {
        // Use raw message if not JSON
      }
      res.status(status).json({ error: message });
    }
  });

  return router;
}
