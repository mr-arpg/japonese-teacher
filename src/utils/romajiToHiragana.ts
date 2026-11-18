const ROMAJI_MAP: Record<string, string> = {
  // 4-char
  xtsu: 'っ',
  ltsu: 'っ',

  // 3-char yoon & extended kana
  kya: 'きゃ',
  kyi: 'きぃ',
  kyu: 'きゅ',
  kye: 'きぇ',
  kyo: 'きょ',
  gya: 'ぎゃ',
  gyi: 'ぎぃ',
  gyu: 'ぎゅ',
  gye: 'ぎぇ',
  gyo: 'ぎょ',
  sha: 'しゃ',
  shi: 'し',
  shu: 'しゅ',
  she: 'しぇ',
  sho: 'しょ',
  sya: 'しゃ',
  syi: 'しぃ',
  syu: 'しゅ',
  sye: 'しぇ',
  syo: 'しょ',
  zya: 'じゃ',
  zyi: 'じぃ',
  zyu: 'じゅ',
  zye: 'じぇ',
  zyo: 'じょ',
  jya: 'じゃ',
  jyi: 'じぃ',
  jyu: 'じゅ',
  jye: 'じぇ',
  jyo: 'じょ',
  cha: 'ちゃ',
  chi: 'ち',
  chu: 'ちゅ',
  che: 'ちぇ',
  cho: 'ちょ',
  tya: 'ちゃ',
  tyi: 'ちぃ',
  tyu: 'ちゅ',
  tye: 'ちぇ',
  tyo: 'ちょ',
  cya: 'ちゃ',
  cyi: 'ちぃ',
  cyu: 'ちゅ',
  cye: 'ちぇ',
  cyo: 'ちょ',
  tsu: 'つ',
  tsa: 'つぁ',
  tsi: 'つぃ',
  tse: 'つぇ',
  tso: 'つぉ',
  tha: 'てゃ',
  thi: 'てぃ',
  thu: 'てゅ',
  the: 'てぇ',
  tho: 'てょ',
  dha: 'でゃ',
  dhi: 'でぃ',
  dhu: 'でゅ',
  dhe: 'でぇ',
  dho: 'でょ',
  dya: 'ぢゃ',
  dyi: 'ぢぃ',
  dyu: 'ぢゅ',
  dye: 'ぢぇ',
  dyo: 'ぢょ',
  nya: 'にゃ',
  nyi: 'にぃ',
  nyu: 'にゅ',
  nye: 'にぇ',
  nyo: 'にょ',
  hya: 'ひゃ',
  hyi: 'ひぃ',
  hyu: 'ひゅ',
  hye: 'ひぇ',
  hyo: 'ひょ',
  bya: 'びゃ',
  byi: 'びぃ',
  byu: 'びゅ',
  bye: 'びぇ',
  byo: 'びょ',
  pya: 'ぴゃ',
  pyi: 'ぴぃ',
  pyu: 'ぴゅ',
  pye: 'ぴぇ',
  pyo: 'ぴょ',
  fya: 'ふゃ',
  fyi: 'ふぃ',
  fyu: 'ふゅ',
  fye: 'ふぇ',
  fyo: 'ふょ',
  mya: 'みゃ',
  myi: 'みぃ',
  myu: 'みゅ',
  mye: 'みぇ',
  myo: 'みょ',
  rya: 'りゃ',
  ryi: 'りぃ',
  ryu: 'りゅ',
  rye: 'りぇ',
  ryo: 'りょ',
  xya: 'ゃ',
  xyu: 'ゅ',
  xyo: 'ょ',
  lya: 'ゃ',
  lyu: 'ゅ',
  lyo: 'ょ',
  xtu: 'っ',
  ltu: 'っ',
  xwa: 'ゎ',
  lwa: 'ゎ',
  xka: 'ゕ',
  xke: 'ゖ',
  lka: 'ゕ',
  lke: 'ゖ',
  wha: 'うぁ',
  whi: 'うぃ',
  whu: 'う',
  whe: 'うぇ',
  who: 'うぉ',
  kwa: 'くぁ',
  gwa: 'ぐぁ',

  // 2-char basic gojuon & dakuten
  ka: 'か',
  ki: 'き',
  ku: 'く',
  ke: 'け',
  ko: 'こ',
  ga: 'が',
  gi: 'ぎ',
  gu: 'ぐ',
  ge: 'げ',
  go: 'ご',
  sa: 'さ',
  si: 'し',
  su: 'す',
  se: 'せ',
  so: 'そ',
  za: 'ざ',
  zi: 'じ',
  zu: 'ず',
  ze: 'ぜ',
  zo: 'ぞ',
  ja: 'じゃ',
  ji: 'じ',
  ju: 'じゅ',
  je: 'じぇ',
  jo: 'じょ',
  ta: 'た',
  ti: 'ち',
  tu: 'つ',
  te: 'て',
  to: 'と',
  da: 'だ',
  di: 'ぢ',
  du: 'づ',
  de: 'で',
  do: 'ど',
  na: 'な',
  ni: 'に',
  nu: 'ぬ',
  ne: 'ね',
  no: 'の',
  ha: 'は',
  hi: 'ひ',
  hu: 'ふ',
  he: 'へ',
  ho: 'ほ',
  fu: 'ふ',
  fa: 'ふぁ',
  fi: 'ふぃ',
  fe: 'ふぇ',
  fo: 'ふぉ',
  ba: 'ば',
  bi: 'び',
  bu: 'ぶ',
  be: 'べ',
  bo: 'ぼ',
  pa: 'ぱ',
  pi: 'ぴ',
  pu: 'ぷ',
  pe: 'ぺ',
  po: 'ぽ',
  ma: 'ま',
  mi: 'み',
  mu: 'む',
  me: 'め',
  mo: 'も',
  ya: 'や',
  yu: 'ゆ',
  yo: 'よ',
  ra: 'ら',
  ri: 'り',
  ru: 'る',
  re: 'れ',
  ro: 'ろ',
  wa: 'わ',
  wi: 'うぃ',
  we: 'うぇ',
  wo: 'を',
  va: 'ゔぁ',
  vi: 'ゔぃ',
  vu: 'ゔ',
  ve: 'ゔぇ',
  vo: 'ゔぉ',
  xa: 'ぁ',
  xi: 'ぃ',
  xu: 'ぅ',
  xe: 'ぇ',
  xo: 'ぉ',
  la: 'ぁ',
  li: 'ぃ',
  lu: 'ぅ',
  le: 'ぇ',
  lo: 'ぉ',
  nn: 'ん',
  "n'": 'ん',

  // 1-char vowels & prolongation mark
  a: 'あ',
  i: 'い',
  u: 'う',
  e: 'え',
  o: 'お',
  '-': 'ー',
};

const DOUBLE_CONSONANTS = new Set([
  'b',
  'c',
  'd',
  'f',
  'g',
  'h',
  'j',
  'k',
  'l',
  'm',
  'p',
  'q',
  'r',
  's',
  't',
  'v',
  'w',
  'x',
  'y',
  'z',
]);

const N_FOLLOWERS_THAT_KEEP_PENDING = new Set([
  'a',
  'i',
  'u',
  'e',
  'o',
  'y',
  'n',
  "'",
]);

/**
 * Converts completed Romaji sequences in `input` to Hiragana while preserving
 * unfinished prefixes at the end (e.g., `n`, `k`, `sh`) for live typing.
 * Returns both the converted string and the adjusted cursor position.
 */
export function convertRomajiToHiragana(
  input: string,
  cursorPos: number | null = null
): { value: string; cursor: number | null } {
  const lower = input.toLowerCase();
  let output = '';
  let nextCursor: number | null = cursorPos === null ? null : 0;
  let cursorAssigned = cursorPos === null;

  const markCursorIfAt = (index: number, advance: number) => {
    if (cursorAssigned || cursorPos === null) return;
    if (cursorPos <= index) {
      nextCursor = output.length;
      cursorAssigned = true;
    } else if (cursorPos <= index + advance) {
      // Cursor was inside or right at the end of the replaced span
      nextCursor = output.length;
    }
  };

  let i = 0;
  while (i < lower.length) {
    if (!cursorAssigned && cursorPos !== null && i === cursorPos) {
      nextCursor = output.length;
      cursorAssigned = true;
    }

    // Check longest romaji matches first (4 -> 3 -> 2 -> 1)
    let matchedLen = 0;
    let matchedKana = '';
    for (let len = 4; len >= 1; len--) {
      if (i + len <= lower.length) {
        const slice = lower.slice(i, i + len);
        const mapped = ROMAJI_MAP[slice];
        if (mapped) {
          matchedLen = len;
          matchedKana = mapped;
          break;
        }
      }
    }

    if (matchedLen > 0) {
      output += matchedKana;
      if (!cursorAssigned && cursorPos !== null && cursorPos <= i + matchedLen) {
        nextCursor = output.length;
        cursorAssigned = true;
      }
      i += matchedLen;
      continue;
    }

    const ch = lower[i];
    const nextCh = i + 1 < lower.length ? lower[i + 1] : '';

    // Sokuon (small っ): double consonant or `tc` before `ch` (e.g. matcha -> まっちゃ)
    if (
      nextCh &&
      ((ch === nextCh && DOUBLE_CONSONANTS.has(ch)) ||
        (ch === 't' && nextCh === 'c'))
    ) {
      output += 'っ';
      if (!cursorAssigned && cursorPos !== null && cursorPos <= i + 1) {
        nextCursor = output.length;
        cursorAssigned = true;
      }
      i += 1;
      continue;
    }

    // Standalone `n` followed by a character that cannot combine with `n` -> emit `ん`
    if (ch === 'n' && nextCh && !N_FOLLOWERS_THAT_KEEP_PENDING.has(nextCh)) {
      output += 'ん';
      if (!cursorAssigned && cursorPos !== null && cursorPos <= i + 1) {
        nextCursor = output.length;
        cursorAssigned = true;
      }
      i += 1;
      continue;
    }

    // Leave unfinished Romaji prefixes or non-ASCII characters as-is
    markCursorIfAt(i, 1);
    output += input[i];
    if (!cursorAssigned && cursorPos !== null && cursorPos <= i + 1) {
      nextCursor = output.length;
      cursorAssigned = true;
    }
    i += 1;
  }

  if (!cursorAssigned) {
    nextCursor = output.length;
  }

  return { value: output, cursor: nextCursor };
}

/**
 * Finalizes any trailing standalone `n` / `N` to `ん` (useful on submit/blur).
 */
export function finalizeRomajiToHiragana(input: string): string {
  const { value } = convertRomajiToHiragana(input, null);
  return value.replace(/[nN]$/, 'ん');
}

/**
 * Handles controlled <input> onChange for live Romaji-to-Hiragana conversion
 * while guarding active OS IME composition and preserving cursor position.
 */
export function processHiraganaInputChange(
  inputEl: HTMLInputElement,
  rawValue: string,
  isComposing: boolean,
  enabled: boolean,
  setValue: (val: string) => void
): void {
  if (!enabled || isComposing) {
    setValue(rawValue);
    return;
  }

  const selectionStart = inputEl.selectionStart;
  const { value, cursor } = convertRomajiToHiragana(rawValue, selectionStart);
  setValue(value);

  if (cursor !== null && value !== rawValue) {
    window.requestAnimationFrame(() => {
      if (document.activeElement === inputEl) {
        inputEl.setSelectionRange(cursor, cursor);
      }
    });
  }
}

