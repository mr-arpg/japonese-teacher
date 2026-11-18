export type DeckType = 'kanji' | 'vocab';

export type KanjiDeckMode = 'writing' | 'reading';

export type PromptMode = 'meaning-first' | 'reading-first';

export type StudyView = 'decks' | 'kanji-dict' | 'word-dict' | 'practice' | 'stats';

export type SrsGrade = 1 | 2 | 3 | 4; // 1: Again, 2: Hard, 3: Good, 4: Easy

export interface SentenceSegment {
  text: string;
  reading?: string;
}

export interface ExampleSentence {
  id: string;
  japanese: string;
  furigana: string;
  english: string;
  targetHighlight?: string;
  segments?: SentenceSegment[];
}

export interface StudyCard {
  id: string;
  deckId: string;
  type: DeckType;
  character?: string; // Kanji character (required for kanji) or optional kanji spelling for vocab
  kana: string; // Primary hiragana/katakana reading (for vocab) or combined reading summary (for kanji)
  onyomi?: string[];
  kunyomi?: string[];
  meanings: string[];
  radicals?: string[];
  strokeCount?: number;
  customSvgPaths?: string[]; // Embedded or cached KanjiVG path strings (109x109)
  sentences: ExampleSentence[];
  // Spaced repetition metadata (SM-2)
  interval: number; // days
  easeFactor: number;
  repetitions: number;
  nextReview: number; // epoch ms
  lapses: number;
  correctCount: number;
  attemptCount: number;
  lastReviewed?: number;
}

export interface Deck {
  id: string;
  title: string;
  description: string;
  type: DeckType;
  kanjiMode?: KanjiDeckMode; // 'writing' (default stroke validation) or 'reading' (active recall meaning)
  category: string;
  createdAt: number;
  cards: StudyCard[];
}

export interface DailyStudyLog {
  date: string; // YYYY-MM-DD (local time)
  seconds: number;
  cardsReviewed: number;
  strokesAttempted: number;
  strokesCorrect: number;
}

export interface UserSettings {
  theme: 'light' | 'dark';
  dailyGoalType: 'minutes' | 'cards';
  dailyGoalTarget: number;
  showTracingGuideByDefault: boolean;
  customLearnedKanji?: string[];
}

export interface SessionConfig {
  deckId: string;
  promptMode: PromptMode;
  contextMode: boolean; // Cloze / Fill-in-the-blank sentence mode
  cardScope: 'due' | 'all';
  shuffle: boolean;
  showVocabKanji: boolean; // For vocab decks: show kanji alongside/instead of kana-only
}

export interface AppState {
  decks: Deck[];
  logs: Record<string, DailyStudyLog>;
  settings: UserSettings;
}

export type KanjiListCategory =
  | 'grade-1'
  | 'grade-2'
  | 'grade-3'
  | 'grade-4'
  | 'grade-5'
  | 'grade-6'
  | 'grade-8'
  | 'joyo'
  | 'jinmeiyo';

export interface KanjiDictionaryEntry {
  kanji: string;
  grade?: number;
  strokeCount: number;
  meanings: string[];
  kunReadings: string[];
  onReadings: string[];
  nameReadings: string[];
  jlpt?: number;
  unicode?: string;
  heisigEn?: string;
  frequency?: number;
}

export interface KanjiCompoundWord {
  written: string;
  pronounced: string;
  meanings: string[];
  isCommon: boolean;
}

export interface WordJapaneseForm {
  word?: string;
  reading?: string;
}

export interface WordSense {
  englishDefinitions: string[];
  partsOfSpeech: string[];
  tags: string[];
  info: string[];
  seeAlso: string[];
  antonyms: string[];
}

export interface WordDictionaryEntry {
  slug: string;
  isCommon: boolean;
  tags: string[];
  jlpt: string[];
  japanese: WordJapaneseForm[];
  senses: WordSense[];
}

