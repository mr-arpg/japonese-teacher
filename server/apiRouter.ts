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
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(20, Math.max(5, Number.parseInt(String(req.query.limit ?? '12'), 10) || 12));
    if (!rawQuery) {
      res.status(400).json({ error: 'Query parameter "query" is required.' });
      return;
    }

    const url = `https://tatoeba.org/en/api_v0/search?from=jpn&to=eng&query=${encodeURIComponent(
      rawQuery
    )}&limit=${limit}&page=${page}`;
    try {
      const data = await fetchUpstreamJson(url, `tatoeba:${rawQuery}:${limit}:${page}`);
      res.json(data);
    } catch (err) {
      const status = (err as { status?: number }).status || 502;
      res.status(status).json({ error: 'Unable to fetch example sentences.' });
    }
  });

  return router;
}
