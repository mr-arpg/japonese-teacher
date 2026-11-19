import type { IncomingMessage, ServerResponse } from 'node:http';

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
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
      'User-Agent': 'Estera-Samo-no-Nihongo/1.0',
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

interface JotobaPosItem {
  [key: string]: unknown;
}

interface JotobaWord {
  reading?: {
    kana?: string;
    kanji?: string;
  };
  common?: boolean;
  senses?: Array<{
    glosses?: string[];
    pos?: Array<string | JotobaPosItem>;
    misc?: string;
    field?: string;
  }>;
}

function formatJotobaPos(posList?: Array<string | JotobaPosItem>): string[] {
  if (!Array.isArray(posList)) return [];
  const out: string[] = [];
  for (const item of posList) {
    if (typeof item === 'string') {
      out.push(item);
    } else if (item && typeof item === 'object') {
      const keys = Object.keys(item);
      if (keys.length > 0) {
        out.push(keys[0]);
      }
    }
  }
  return Array.from(new Set(out));
}

async function fetchJotobaFallback(rawKeyword: string, page: number): Promise<unknown> {
  const normalizedQuery = rawKeyword.startsWith('#')
    ? rawKeyword === '#verb'
      ? 'する'
      : rawKeyword === '#adjective'
        ? 'いい'
        : '日本'
    : rawKeyword;

  const cacheKey = `jotoba:${normalizedQuery.toLowerCase()}:${page}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  const response = await fetch('https://jotoba.de/api/search/words', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'Estera-Samo-no-Nihongo/1.0',
    },
    body: JSON.stringify({
      query: normalizedQuery,
      language: 'English',
      no_english: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Jotoba HTTP ${response.status}`);
  }

  const json = (await response.json()) as { words?: JotobaWord[] };
  const allWords = Array.isArray(json.words) ? json.words : [];
  const pageSize = 20;
  const start = (page - 1) * pageSize;
  const slice = allWords.slice(start, start + pageSize);

  const mapped = {
    meta: { status: 200 },
    data: slice.map((w, idx) => ({
      slug: w.reading?.kanji || w.reading?.kana || `word-${page}-${idx}`,
      is_common: Boolean(w.common),
      tags: [],
      jlpt: [],
      japanese: [
        {
          word: w.reading?.kanji,
          reading: w.reading?.kana,
        },
      ],
      senses: (w.senses ?? []).map((s) => ({
        english_definitions: Array.isArray(s.glosses) ? s.glosses : [],
        parts_of_speech: formatJotobaPos(s.pos),
        tags: [s.misc, s.field].filter((v): v is string => typeof v === 'string' && v.length > 0),
        info: [],
        see_also: [],
        antonyms: [],
      })),
    })),
  };

  setCached(cacheKey, mapped);
  return mapped;
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

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.end(JSON.stringify(body));
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  const parsedUrl = new URL(req.url || '/', 'http://localhost');
  const rawPathParam = parsedUrl.searchParams.get('__path');
  const subPath = rawPathParam
    ? `/${rawPathParam.replace(/^\/+/, '')}`
    : parsedUrl.pathname.replace(/^\/api(?=\/|$)/, '') || '/';

  if (subPath === '/dictionary/words') {
    const rawKeyword = (parsedUrl.searchParams.get('keyword') ?? '').trim();
    const page = Math.max(
      1,
      Number.parseInt(parsedUrl.searchParams.get('page') ?? '1', 10) || 1
    );

    if (!rawKeyword) {
      sendJson(res, 400, { error: 'Query parameter "keyword" is required.' });
      return;
    }

    const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(
      rawKeyword
    )}&page=${page}`;
    const cacheKey = `jisho:${rawKeyword.toLowerCase()}:${page}`;

    try {
      const data = await fetchUpstreamJson(url, cacheKey);
      sendJson(res, 200, data);
    } catch (jishoErr) {
      try {
        const fallbackData = await fetchJotobaFallback(rawKeyword, page);
        sendJson(res, 200, fallbackData);
      } catch {
        const status = (jishoErr as { status?: number }).status || 502;
        sendJson(res, status, {
          error: 'Unable to fetch word dictionary entries right now.',
        });
      }
    }
    return;
  }

  if (subPath.startsWith('/dictionary/kanji/list/')) {
    const category = decodeURIComponent(subPath.slice('/dictionary/kanji/list/'.length));
    if (!ALLOWED_KANJI_LISTS.has(category)) {
      sendJson(res, 400, { error: 'Invalid kanji list category.' });
      return;
    }
    const url = `https://kanjiapi.dev/v1/kanji/${encodeURIComponent(category)}`;
    try {
      const data = await fetchUpstreamJson(url, `kanji-list:${category}`);
      sendJson(res, 200, data);
    } catch (err) {
      const status = (err as { status?: number }).status || 502;
      sendJson(res, status, { error: 'Unable to load kanji list.' });
    }
    return;
  }

  if (subPath.startsWith('/dictionary/kanji/char/')) {
    const rawChar = decodeURIComponent(subPath.slice('/dictionary/kanji/char/'.length));
    const singleChar = Array.from(rawChar.trim())[0];
    if (!singleChar) {
      sendJson(res, 400, { error: 'Kanji character is required.' });
      return;
    }
    const url = `https://kanjiapi.dev/v1/kanji/${encodeURIComponent(singleChar)}`;
    try {
      const data = await fetchUpstreamJson(url, `kanji-char:${singleChar}`);
      sendJson(res, 200, data);
    } catch (err) {
      const status = (err as { status?: number }).status || 502;
      sendJson(res, status, { error: `Kanji "${singleChar}" not found.` });
    }
    return;
  }

  if (subPath.startsWith('/dictionary/kanji/words/')) {
    const rawChar = decodeURIComponent(subPath.slice('/dictionary/kanji/words/'.length));
    const singleChar = Array.from(rawChar.trim())[0];
    if (!singleChar) {
      sendJson(res, 400, { error: 'Kanji character is required.' });
      return;
    }
    const url = `https://kanjiapi.dev/v1/words/${encodeURIComponent(singleChar)}`;
    try {
      const data = await fetchUpstreamJson(url, `kanji-words:${singleChar}`);
      sendJson(res, 200, data);
    } catch (err) {
      const status = (err as { status?: number }).status || 502;
      sendJson(res, status, { error: `Compound words for "${singleChar}" not found.` });
    }
    return;
  }

  if (subPath.startsWith('/dictionary/kanji/reading/')) {
    const reading = decodeURIComponent(
      subPath.slice('/dictionary/kanji/reading/'.length)
    ).trim();
    if (!reading) {
      sendJson(res, 400, { error: 'Reading is required.' });
      return;
    }
    const url = `https://kanjiapi.dev/v1/reading/${encodeURIComponent(reading)}`;
    try {
      const data = await fetchUpstreamJson(url, `kanji-reading:${reading}`);
      sendJson(res, 200, data);
    } catch (err) {
      const status = (err as { status?: number }).status || 502;
      sendJson(res, status, { error: `No kanji found for reading "${reading}".` });
    }
    return;
  }

  if (subPath === '/dictionary/sentences') {
    const rawQuery = (parsedUrl.searchParams.get('query') ?? '').trim();
    const page = Math.max(
      1,
      Number.parseInt(parsedUrl.searchParams.get('page') ?? '1', 10) || 1
    );
    const limit = Math.min(
      20,
      Math.max(5, Number.parseInt(parsedUrl.searchParams.get('limit') ?? '12', 10) || 12)
    );
    if (!rawQuery) {
      sendJson(res, 400, { error: 'Query parameter "query" is required.' });
      return;
    }
    const url = `https://tatoeba.org/en/api_v0/search?from=jpn&to=eng&query=${encodeURIComponent(
      rawQuery
    )}&limit=${limit}&page=${page}`;
    try {
      const data = await fetchUpstreamJson(url, `tatoeba:${rawQuery}:${limit}:${page}`);
      sendJson(res, 200, data);
    } catch (err) {
      const status = (err as { status?: number }).status || 502;
      sendJson(res, status, { error: 'Unable to fetch example sentences.' });
    }
    return;
  }

  sendJson(res, 404, { error: 'API route not found.' });
}
