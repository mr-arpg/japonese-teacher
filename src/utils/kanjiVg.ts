export interface Point {
  x: number;
  y: number;
}

export interface KanjiStrokeData {
  index: number;
  d: string;
  samples: Point[];
  length: number;
}

export interface KanjiVgParsed {
  character: string;
  strokes: KanjiStrokeData[];
  radicals: string[];
  rawPaths: string[];
}

export interface StrokeValidationResult {
  valid: boolean;
  reason?: 'order' | 'direction' | 'shape' | 'short';
  matchedOtherIndex?: number;
  accuracy: number; // 0..100
  message: string;
}

const SVG_CACHE_KEY = 'kakuso_kanjivg_cache_v1';
const memoryCache = new Map<string, KanjiVgParsed>();

function readCacheStore(): Record<string, { rawPaths: string[]; radicals: string[] }> {
  try {
    const raw = localStorage.getItem(SVG_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeCacheStore(
  char: string,
  rawPaths: string[],
  radicals: string[]
): void {
  try {
    const store = readCacheStore();
    store[char] = { rawPaths, radicals };
    localStorage.setItem(SVG_CACHE_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage limits
  }
}

export function charToKanjiVgHex(char: string): string {
  const cp = char.codePointAt(0);
  if (!cp) return '00000';
  return cp.toString(16).toLowerCase().padStart(5, '0');
}

export function sampleSvgPath(d: string, numSamples = 32): { samples: Point[]; length: number } {
  if (typeof document !== 'undefined') {
    try {
      const svgNS = 'http://www.w3.org/2000/svg';
      const pathEl = document.createElementNS(svgNS, 'path');
      pathEl.setAttribute('d', d);
      const totalLength = pathEl.getTotalLength();
      if (totalLength > 0 && Number.isFinite(totalLength)) {
        const samples: Point[] = [];
        for (let i = 0; i < numSamples; i++) {
          const dist = (i / (numSamples - 1)) * totalLength;
          const pt = pathEl.getPointAtLength(dist);
          samples.push({ x: pt.x, y: pt.y });
        }
        return { samples, length: totalLength };
      }
    } catch {
      // Fall through to lightweight fallback
    }
  }

  // Fallback parser for simple M/L/C commands if DOM SVG API is unavailable
  const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [20, 50, 88, 50];
  const pts: Point[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pts.push({ x: nums[i], y: nums[i + 1] });
  }
  if (pts.length < 2) {
    pts.push({ x: 85, y: 55 });
  }
  const samples = resamplePoints(pts, numSamples);
  return { samples, length: polylineLength(samples) };
}

export function buildParsedFromPaths(
  character: string,
  rawPaths: string[],
  radicals: string[] = []
): KanjiVgParsed {
  const strokes: KanjiStrokeData[] = rawPaths.map((d, index) => {
    const { samples, length } = sampleSvgPath(d, 32);
    return { index, d, samples, length };
  });
  return { character, strokes, radicals, rawPaths };
}

export function parseKanjiVgSvgXml(character: string, svgText: string): KanjiVgParsed {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');

  const pathGroup =
    doc.querySelector('[id^="kvg:StrokePaths"]') ||
    doc.querySelector('g[style*="fill:none"]') ||
    doc.documentElement;

  const pathElements = Array.from(pathGroup.querySelectorAll('path'));
  const rawPaths = pathElements
    .map((el) => el.getAttribute('d')?.trim() ?? '')
    .filter((d) => d.length > 0);

  const radicalSet = new Set<string>();
  const groups = Array.from(pathGroup.querySelectorAll('g'));
  for (const g of groups) {
    const element = g.getAttribute('kvg:element');
    const radical = g.getAttribute('kvg:radical');
    if (element && element !== character) {
      radicalSet.add(radical ? `${element} (radical)` : element);
    } else if (element && radical) {
      radicalSet.add(`${element} (radical)`);
    }
  }

  return buildParsedFromPaths(character, rawPaths, Array.from(radicalSet).slice(0, 5));
}

export async function loadKanjiVgData(
  character: string,
  embeddedPaths?: string[],
  embeddedRadicals?: string[]
): Promise<KanjiVgParsed> {
  if (memoryCache.has(character)) {
    return memoryCache.get(character)!;
  }

  if (embeddedPaths && embeddedPaths.length > 0) {
    const parsed = buildParsedFromPaths(character, embeddedPaths, embeddedRadicals ?? []);
    memoryCache.set(character, parsed);
    return parsed;
  }

  const cachedStore = readCacheStore();
  if (cachedStore[character]?.rawPaths?.length) {
    const parsed = buildParsedFromPaths(
      character,
      cachedStore[character].rawPaths,
      cachedStore[character].radicals ?? []
    );
    memoryCache.set(character, parsed);
    return parsed;
  }

  const hex = charToKanjiVgHex(character);
  const url = `https://cdn.jsdelivr.net/gh/KanjiVG/kanjivg@master/kanji/${hex}.svg`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`KanjiVG stroke data not found for "${character}" (U+${hex.toUpperCase()}).`);
  }
  const svgText = await response.text();
  const parsed = parseKanjiVgSvgXml(character, svgText);

  if (parsed.rawPaths.length === 0) {
    throw new Error(`No stroke paths extracted from KanjiVG for "${character}".`);
  }

  writeCacheStore(character, parsed.rawPaths, parsed.radicals);
  memoryCache.set(character, parsed);
  return parsed;
}

export function polylineLength(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    len += Math.hypot(dx, dy);
  }
  return len;
}

export function resamplePoints(points: Point[], numSamples = 32): Point[] {
  if (points.length === 0) return [];
  if (points.length === 1) {
    return Array.from({ length: numSamples }, () => ({ ...points[0] }));
  }

  const totalLen = polylineLength(points);
  if (totalLen < 1e-4) {
    return Array.from({ length: numSamples }, () => ({ ...points[0] }));
  }

  const step = totalLen / (numSamples - 1);
  const resampled: Point[] = [{ ...points[0] }];
  let accumulated = 0;
  let prev = { ...points[0] };

  let i = 1;
  while (i < points.length) {
    const curr = points[i];
    const segLen = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    if (accumulated + segLen >= step) {
      const ratio = (step - accumulated) / Math.max(segLen, 1e-6);
      const nx = prev.x + ratio * (curr.x - prev.x);
      const ny = prev.y + ratio * (curr.y - prev.y);
      const newPt = { x: nx, y: ny };
      resampled.push(newPt);
      prev = newPt;
      accumulated = 0;
      if (resampled.length >= numSamples) break;
    } else {
      accumulated += segLen;
      prev = curr;
      i++;
    }
  }

  while (resampled.length < numSamples) {
    resampled.push({ ...points[points.length - 1] });
  }

  return resampled;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function quarterDirectionAlignment(user: Point[], target: Point[]): number {
  const n = Math.min(user.length, target.length);
  const quarters = [
    [0, Math.floor(n * 0.25)],
    [Math.floor(n * 0.25), Math.floor(n * 0.5)],
    [Math.floor(n * 0.5), Math.floor(n * 0.75)],
    [Math.floor(n * 0.75), n - 1],
  ];

  let scoreSum = 0;
  let weightSum = 0;

  for (const [s, e] of quarters) {
    const ux = user[e].x - user[s].x;
    const uy = user[e].y - user[s].y;
    const tx = target[e].x - target[s].x;
    const ty = target[e].y - target[s].y;

    const uMag = Math.hypot(ux, uy);
    const tMag = Math.hypot(tx, ty);
    if (tMag < 1.5) continue;

    if (uMag < 0.8) {
      scoreSum += -0.2 * tMag;
      weightSum += tMag;
      continue;
    }

    const cosine = (ux * tx + uy * ty) / (uMag * tMag);
    scoreSum += cosine * tMag;
    weightSum += tMag;
  }

  return weightSum > 0 ? scoreSum / weightSum : 1;
}

function scoreAgainstStroke(
  userSamples: Point[],
  userLen: number,
  target: KanjiStrokeData
): {
  passed: boolean;
  meanDist: number;
  startDist: number;
  endDist: number;
  dirScore: number;
  reversedStartDist: number;
  accuracy: number;
} {
  const targetSamples = target.samples;
  const n = targetSamples.length;

  let totalDist = 0;
  for (let i = 0; i < n; i++) {
    totalDist += dist(userSamples[i], targetSamples[i]);
  }
  const meanDist = totalDist / n;
  const startDist = dist(userSamples[0], targetSamples[0]);
  const endDist = dist(userSamples[n - 1], targetSamples[n - 1]);
  const reversedStartDist = dist(userSamples[0], targetSamples[n - 1]);

  const dirScore = quarterDirectionAlignment(userSamples, targetSamples);
  const lenRatio = userLen / Math.max(target.length, 4);

  const isVeryShortStroke = target.length < 18;
  const maxMeanDist = isVeryShortStroke ? 22 : Math.max(20, Math.min(27, target.length * 0.31));
  const maxEndpoint = isVeryShortStroke ? 25 : 27;

  const passed =
    meanDist <= maxMeanDist &&
    startDist <= maxEndpoint &&
    endDist <= maxEndpoint &&
    lenRatio >= 0.42 &&
    lenRatio <= 1.95 &&
    dirScore >= (isVeryShortStroke ? 0.15 : 0.35);

  const rawAcc = Math.round(100 - meanDist * 1.95 - (1 - Math.max(0, dirScore)) * 18);
  const accuracy = Math.max(60, Math.min(100, rawAcc));

  return {
    passed,
    meanDist,
    startDist,
    endDist,
    dirScore,
    reversedStartDist,
    accuracy,
  };
}

export function validateStroke(
  userPoints109: Point[],
  strokes: KanjiStrokeData[],
  currentIndex: number
): StrokeValidationResult {
  const target = strokes[currentIndex];
  if (!target) {
    return { valid: false, reason: 'shape', accuracy: 0, message: 'No target stroke.' };
  }

  const userLen = polylineLength(userPoints109);
  if (userLen < 5 && target.length > 14) {
    return {
      valid: false,
      reason: 'short',
      accuracy: 0,
      message: 'Stroke too short — draw the full stroke.',
    };
  }

  const userSamples = resamplePoints(userPoints109, 32);
  const currentScore = scoreAgainstStroke(userSamples, userLen, target);

  if (currentScore.passed) {
    return {
      valid: true,
      accuracy: currentScore.accuracy,
      message: `Stroke ${currentIndex + 1} of ${strokes.length} matched`,
    };
  }

  // Check if user drew a later stroke out of order
  for (let k = currentIndex + 1; k < strokes.length; k++) {
    const laterScore = scoreAgainstStroke(userSamples, userLen, strokes[k]);
    if (laterScore.passed && laterScore.meanDist + 4 < currentScore.meanDist) {
      return {
        valid: false,
        reason: 'order',
        matchedOtherIndex: k,
        accuracy: 0,
        message: `Wrong stroke order — draw stroke ${currentIndex + 1} before stroke ${k + 1}.`,
      };
    }
  }

  if (
    currentScore.dirScore < 0.2 &&
    currentScore.reversedStartDist < 24
  ) {
    return {
      valid: false,
      reason: 'direction',
      accuracy: 0,
      message: `Check stroke direction — start from the opposite end for stroke ${currentIndex + 1}.`,
    };
  }

  return {
    valid: false,
    reason: 'shape',
    accuracy: 0,
    message: `Stroke ${currentIndex + 1} didn't match — check placement and curve.`,
  };
}
