import { SrsGrade, StudyCard } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

export function isCardDue(card: StudyCard, now: number = Date.now()): boolean {
  return card.nextReview <= now;
}

export function previewNextIntervalLabel(card: StudyCard, grade: SrsGrade): string {
  const result = calculateNextSrs(card, grade);
  if (result.interval === 0) return '< 10m';
  if (result.interval === 1) return '1d';
  if (result.interval < 30) return `${result.interval}d`;
  const months = Math.round(result.interval / 30);
  return `${months}mo`;
}

export function calculateNextSrs(
  card: StudyCard,
  grade: SrsGrade,
  now: number = Date.now()
): Pick<
  StudyCard,
  'interval' | 'easeFactor' | 'repetitions' | 'nextReview' | 'lapses' | 'lastReviewed'
> {
  let { interval, easeFactor, repetitions, lapses } = card;

  if (grade === 1) {
    // Again
    repetitions = 0;
    interval = 0;
    lapses += 1;
    easeFactor = Math.max(1.3, easeFactor - 0.2);
    return {
      interval,
      easeFactor: Number(easeFactor.toFixed(2)),
      repetitions,
      lapses,
      lastReviewed: now,
      nextReview: now + 10 * 60 * 1000, // 10 minutes
    };
  }

  if (grade === 2) {
    // Hard
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 2;
    } else {
      interval = Math.max(1, Math.round(interval * 1.2));
    }
    repetitions += 1;
    easeFactor = Math.max(1.3, easeFactor - 0.15);
  } else if (grade === 3) {
    // Good
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 4;
    } else {
      interval = Math.max(1, Math.round(interval * easeFactor));
    }
    repetitions += 1;
  } else {
    // Easy
    if (repetitions === 0) {
      interval = 3;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.max(1, Math.round(interval * easeFactor * 1.3));
    }
    repetitions += 1;
    easeFactor = Math.min(3.0, easeFactor + 0.15);
  }

  return {
    interval,
    easeFactor: Number(easeFactor.toFixed(2)),
    repetitions,
    lapses,
    lastReviewed: now,
    nextReview: now + interval * DAY_MS,
  };
}
