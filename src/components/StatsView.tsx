import React, { useMemo, useState } from 'react';
import { Flame } from 'lucide-react';
import { DailyStudyLog, Deck, UserSettings } from '../types';
import { getLocalDateKey } from '../utils/storage';

interface StatsViewProps {
  decks: Deck[];
  logs: Record<string, DailyStudyLog>;
  settings: UserSettings;
  streak: number;
  onUpdateSettings: (patch: Partial<UserSettings>) => void;
}

export const StatsView: React.FC<StatsViewProps> = ({
  decks,
  logs,
  settings,
  streak,
  onUpdateSettings,
}) => {
  const [hoveredDay, setHoveredDay] = useState<{
    date: string;
    minutes: number;
    cards: number;
  } | null>(null);

  const todayKey = getLocalDateKey();
  const todayLog = logs[todayKey] ?? {
    date: todayKey,
    seconds: 0,
    cardsReviewed: 0,
    strokesAttempted: 0,
    strokesCorrect: 0,
  };

  const todayMinutesExact = todayLog.seconds / 60;
  const todayGoalProgressValue =
    settings.dailyGoalType === 'minutes'
      ? Number(todayMinutesExact.toFixed(1))
      : todayLog.cardsReviewed;
  const todayGoalPct = Math.min(
    100,
    Math.round((todayGoalProgressValue / Math.max(1, settings.dailyGoalTarget)) * 100)
  );

  // Aggregate KPI totals
  const kpis = useMemo(() => {
    let kanjiMastered = 0;
    let kanjiTotal = 0;
    let vocabLearned = 0;
    let vocabTotal = 0;

    for (const deck of decks) {
      for (const card of deck.cards) {
        if (card.type === 'kanji') {
          kanjiTotal += 1;
          if (card.repetitions >= 2) kanjiMastered += 1;
        } else {
          vocabTotal += 1;
          if (card.repetitions >= 1) vocabLearned += 1;
        }
      }
    }

    let totalStrokesAttempted = 0;
    let totalStrokesCorrect = 0;
    let totalSecondsAllTime = 0;

    for (const log of Object.values(logs)) {
      totalStrokesAttempted += log.strokesAttempted;
      totalStrokesCorrect += log.strokesCorrect;
      totalSecondsAllTime += log.seconds;
    }

    const strokeAccuracyPct =
      totalStrokesAttempted > 0
        ? Math.round((totalStrokesCorrect / totalStrokesAttempted) * 100)
        : 0;

    return {
      kanjiMastered,
      kanjiTotal,
      vocabLearned,
      vocabTotal,
      strokeAccuracyPct,
      totalStrokesAttempted,
      totalMinutesAllTime: Math.round(totalSecondsAllTime / 60),
    };
  }, [decks, logs]);

  // Build 7-day bar chart data (oldest -> today)
  const sevenDayData = useMemo(() => {
    const today = new Date();
    const rows: Array<{
      date: string;
      label: string;
      minutes: number;
      cards: number;
    }> = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = getLocalDateKey(d);
      const log = logs[key];
      const minutes = log ? Number((log.seconds / 60).toFixed(1)) : 0;
      const label = d.toLocaleDateString('en-US', { weekday: 'short' });
      rows.push({
        date: key,
        label,
        minutes,
        cards: log?.cardsReviewed ?? 0,
      });
    }
    return rows;
  }, [logs]);

  const maxSevenDayMinutes = useMemo(() => {
    const peak = Math.max(
      settings.dailyGoalType === 'minutes' ? settings.dailyGoalTarget : 15,
      ...sevenDayData.map((d) => d.minutes)
    );
    return Math.max(10, Math.ceil(peak / 5) * 5);
  }, [sevenDayData, settings]);

  // Build 26-week (182-day) GitHub-style contribution heatmap
  const heatmapWeeks = useMemo(() => {
    const today = new Date();
    // Align end of grid to Saturday of current week so columns are Sunday..Saturday
    const endOfWeek = new Date(today);
    const dayOfWeek = endOfWeek.getDay(); // 0=Sun..6=Sat
    endOfWeek.setDate(endOfWeek.getDate() + (6 - dayOfWeek));

    const totalDays = 26 * 7; // 182 days
    const startDate = new Date(endOfWeek);
    startDate.setDate(endOfWeek.getDate() - (totalDays - 1));

    const weeks: Array<
      Array<{
        date: string;
        minutes: number;
        cards: number;
        isFuture: boolean;
      }>
    > = [];

    const todayTime = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    ).getTime();

    let cursor = new Date(startDate);
    for (let w = 0; w < 26; w++) {
      const week: Array<{
        date: string;
        minutes: number;
        cards: number;
        isFuture: boolean;
      }> = [];
      for (let d = 0; d < 7; d++) {
        const key = getLocalDateKey(cursor);
        const log = logs[key];
        const cursorTime = new Date(
          cursor.getFullYear(),
          cursor.getMonth(),
          cursor.getDate()
        ).getTime();
        week.push({
          date: key,
          minutes: log ? Number((log.seconds / 60).toFixed(1)) : 0,
          cards: log?.cardsReviewed ?? 0,
          isFuture: cursorTime > todayTime,
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(week);
    }

    return weeks;
  }, [logs]);

  const getHeatmapCellColor = (minutes: number, cards: number, isFuture: boolean) => {
    if (isFuture) return 'bg-transparent border border-dashed border-zinc-200/50 dark:border-zinc-800/50';
    if (minutes === 0 && cards === 0) {
      return 'bg-zinc-100 dark:bg-zinc-800/80';
    }
    if (minutes < 5) return 'bg-emerald-200 dark:bg-emerald-950';
    if (minutes < 15) return 'bg-emerald-400 dark:bg-emerald-800';
    if (minutes < 30) return 'bg-emerald-500 dark:bg-emerald-600';
    return 'bg-emerald-700 dark:bg-emerald-400';
  };

  return (
    <div className="space-y-8">
      {/* Header & Daily Goal Setting */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b border-zinc-200/80 dark:border-zinc-800 pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Progress & Study Telemetry
          </h1>
          <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">
            Active study minutes are tracked automatically during practice and pause after 60 seconds of inactivity.
          </p>
        </div>

        {/* Daily Goal Controls */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] px-4 py-3">
          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Daily Goal
          </span>
          <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5">
            <button
              type="button"
              onClick={() =>
                onUpdateSettings({
                  dailyGoalType: 'minutes',
                  dailyGoalTarget:
                    settings.dailyGoalType === 'minutes' ? settings.dailyGoalTarget : 15,
                })
              }
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                settings.dailyGoalType === 'minutes'
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              Minutes
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdateSettings({
                  dailyGoalType: 'cards',
                  dailyGoalTarget:
                    settings.dailyGoalType === 'cards' ? settings.dailyGoalTarget : 20,
                })
              }
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                settings.dailyGoalType === 'cards'
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              Cards
            </button>
          </div>
          <input
            type="number"
            min={1}
            max={240}
            aria-label="Daily goal target"
            value={settings.dailyGoalTarget}
            onChange={(e) =>
              onUpdateSettings({
                dailyGoalTarget: Math.max(1, Math.min(240, Number(e.target.value) || 1)),
              })
            }
            className="font-mono-num w-16 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-[#FAF9F6] dark:bg-[#121316] px-2.5 py-1 text-xs font-semibold text-zinc-900 dark:text-zinc-100 focus:border-emerald-600 focus:outline-none"
          />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {settings.dailyGoalType === 'minutes' ? 'min / day' : 'cards / day'}
          </span>
        </div>
      </div>

      {/* Today's Goal Progress */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] p-5 space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-zinc-800 dark:text-zinc-200">
            Today&apos;s Goal Progress
          </span>
          <span className="font-mono-num font-medium text-zinc-600 dark:text-zinc-300">
            {todayGoalProgressValue} / {settings.dailyGoalTarget}{' '}
            {settings.dailyGoalType === 'minutes' ? 'min' : 'cards'} ({todayGoalPct}%)
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full bg-emerald-600 dark:bg-emerald-500 transition-all duration-300"
            style={{ width: `${todayGoalPct}%` }}
          />
        </div>
      </div>

      {/* 4 KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] p-5">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>Daily Streak</span>
            <Flame className="h-4 w-4 text-amber-500" aria-hidden="true" />
          </div>
          <div className="mt-2 font-mono-num text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {streak} {streak === 1 ? 'day' : 'days'}
          </div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 font-mono-num">
            {kpis.totalMinutesAllTime}m total logged
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] p-5">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Kanji Mastered</div>
          <div className="mt-2 font-mono-num text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {kpis.kanjiMastered}{' '}
            <span className="text-sm font-normal text-zinc-400 dark:text-zinc-500">
              / {kpis.kanjiTotal}
            </span>
          </div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            2+ successful SRS reviews
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] p-5">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Vocab Learned</div>
          <div className="mt-2 font-mono-num text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {kpis.vocabLearned}{' '}
            <span className="text-sm font-normal text-zinc-400 dark:text-zinc-500">
              / {kpis.vocabTotal}
            </span>
          </div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Active Kana recall passed
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] p-5">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Stroke Accuracy</div>
          <div className="mt-2 font-mono-num text-2xl font-semibold text-emerald-700 dark:text-emerald-400">
            {kpis.totalStrokesAttempted > 0 ? `${kpis.strokeAccuracyPct}%` : '—'}
          </div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 font-mono-num">
            {kpis.totalStrokesAttempted} strokes evaluated
          </div>
        </div>
      </div>

      {/* 7-Day Bar Chart + Contribution Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 7-Day Exact Minutes Bar Chart */}
        <section className="lg:col-span-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Last 7 Days (Minutes Studied)
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Exact active minutes recorded per day
            </p>
          </div>

          <div className="relative mt-6 h-52 flex items-end justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-2 pt-6">
            {/* Goal threshold line when goal is in minutes */}
            {settings.dailyGoalType === 'minutes' && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 border-t border-dashed border-emerald-600/50 dark:border-emerald-400/50"
                style={{
                  bottom: `${Math.min(
                    95,
                    (settings.dailyGoalTarget / maxSevenDayMinutes) * 100
                  )}%`,
                }}
              >
                <span className="absolute -top-4 right-0 font-mono-num text-[10px] text-emerald-700 dark:text-emerald-400">
                  Goal {settings.dailyGoalTarget}m
                </span>
              </div>
            )}

            {sevenDayData.map((day) => {
              const barPct = Math.round((day.minutes / maxSevenDayMinutes) * 100);
              return (
                <div
                  key={day.date}
                  className="flex flex-1 flex-col items-center justify-end h-full gap-1.5"
                >
                  <span className="font-mono-num text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                    {day.minutes > 0 ? `${day.minutes}m` : '0'}
                  </span>
                  <div className="w-full max-w-[34px] flex-1 flex items-end">
                    <div
                      className={`w-full rounded-t-md transition-all duration-300 ${
                        day.minutes > 0
                          ? 'bg-emerald-600 dark:bg-emerald-500'
                          : 'bg-zinc-100 dark:bg-zinc-800'
                      }`}
                      style={{ height: `${Math.max(4, barPct)}%` }}
                      title={`${day.date}: ${day.minutes} min · ${day.cards} cards`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between gap-3">
            {sevenDayData.map((day) => (
              <div
                key={`lbl-${day.date}`}
                className="flex-1 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400"
              >
                {day.label}
              </div>
            ))}
          </div>
        </section>

        {/* GitHub-Style Contribution Heatmap */}
        <section className="lg:col-span-7 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] p-6 flex flex-col justify-between">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                26-Week Study Log
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Daily active study consistency across the past 6 months
              </p>
            </div>

            <div className="min-h-[20px] font-mono-num text-xs text-zinc-600 dark:text-zinc-300">
              {hoveredDay
                ? `${hoveredDay.date} · ${hoveredDay.minutes}m · ${hoveredDay.cards} cards`
                : 'Hover any cell for daily details'}
            </div>
          </div>

          <div className="mt-5 overflow-x-auto pb-2">
            <div className="inline-flex gap-1.5">
              {heatmapWeeks.map((week, wIdx) => (
                <div key={wIdx} className="flex flex-col gap-1.5">
                  {week.map((cell) => (
                    <button
                      key={cell.date}
                      type="button"
                      onMouseEnter={() =>
                        !cell.isFuture &&
                        setHoveredDay({
                          date: cell.date,
                          minutes: cell.minutes,
                          cards: cell.cards,
                        })
                      }
                      onFocus={() =>
                        !cell.isFuture &&
                        setHoveredDay({
                          date: cell.date,
                          minutes: cell.minutes,
                          cards: cell.cards,
                        })
                      }
                      onMouseLeave={() => setHoveredDay(null)}
                      aria-label={`${cell.date}: ${cell.minutes} minutes studied, ${cell.cards} cards reviewed`}
                      className={`h-3.5 w-3.5 rounded-[3px] transition-transform hover:scale-110 focus:outline-none focus:ring-1 focus:ring-emerald-600 ${getHeatmapCellColor(
                        cell.minutes,
                        cell.cards,
                        cell.isFuture
                      )}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span>Less</span>
            <span className="h-3 w-3 rounded-[2px] bg-zinc-100 dark:bg-zinc-800/80" />
            <span className="h-3 w-3 rounded-[2px] bg-emerald-200 dark:bg-emerald-950" />
            <span className="h-3 w-3 rounded-[2px] bg-emerald-400 dark:bg-emerald-800" />
            <span className="h-3 w-3 rounded-[2px] bg-emerald-500 dark:bg-emerald-600" />
            <span className="h-3 w-3 rounded-[2px] bg-emerald-700 dark:bg-emerald-400" />
            <span>More</span>
          </div>
        </section>
      </div>
    </div>
  );
};
