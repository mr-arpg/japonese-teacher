import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Hash,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';
import { KanjiStrokeData } from '../utils/kanjiVg';

interface KanjiStrokeDiagramProps {
  character: string;
  strokes: KanjiStrokeData[];
}

export const KanjiStrokeDiagram: React.FC<KanjiStrokeDiagramProps> = ({
  character,
  strokes,
}) => {
  const [visibleCount, setVisibleCount] = useState<number>(strokes.length);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showNumbers, setShowNumbers] = useState(true);

  useEffect(() => {
    setVisibleCount(strokes.length);
    setIsPlaying(false);
  }, [character, strokes.length]);

  useEffect(() => {
    if (!isPlaying || strokes.length === 0) return;

    if (visibleCount >= strokes.length) {
      setIsPlaying(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setVisibleCount((prev) => {
        const next = prev + 1;
        if (next >= strokes.length) {
          setIsPlaying(false);
        }
        return Math.min(strokes.length, next);
      });
    }, 650);

    return () => window.clearTimeout(timer);
  }, [isPlaying, visibleCount, strokes.length]);

  const handleTogglePlay = () => {
    if (strokes.length === 0) return;
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    if (visibleCount >= strokes.length) {
      setVisibleCount(0);
    }
    setIsPlaying(true);
  };

  const handleStepBack = () => {
    setIsPlaying(false);
    setVisibleCount((v) => Math.max(0, v - 1));
  };

  const handleStepForward = () => {
    setIsPlaying(false);
    setVisibleCount((v) => Math.min(strokes.length, v + 1));
  };

  const handleReset = () => {
    setIsPlaying(false);
    setVisibleCount(strokes.length);
  };

  const activeStrokeIndex = useMemo(() => {
    if (visibleCount <= 0) return -1;
    return visibleCount - 1;
  }, [visibleCount]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative h-44 w-44 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-[#121316]">
        <svg
          viewBox="0 0 109 109"
          className="h-full w-full"
          role="img"
          aria-label={`Stroke order diagram for ${character}`}
        >
          {/* Genkouyoushi Reference Grid */}
          <g className="stroke-zinc-200 dark:stroke-zinc-800" strokeWidth="0.6" fill="none">
            <rect x="6" y="6" width="97" height="97" rx="2" strokeDasharray="2 2" />
            <line x1="54.5" y1="6" x2="54.5" y2="103" strokeDasharray="2.5 2.5" />
            <line x1="6" y1="54.5" x2="103" y2="54.5" strokeDasharray="2.5 2.5" />
          </g>

          {/* Ghost outline of remaining strokes */}
          <g
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3.8"
            className="stroke-zinc-200/80 dark:stroke-zinc-800"
          >
            {strokes.map((s) => (
              <path key={`bg-${s.index}`} d={s.d} />
            ))}
          </g>

          {/* Drawn strokes up to visibleCount */}
          <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4.6">
            {strokes.slice(0, visibleCount).map((s) => {
              const isLatest = isPlaying || visibleCount < strokes.length ? s.index === activeStrokeIndex : false;
              return (
                <path
                  key={`fg-${s.index}`}
                  d={s.d}
                  className={
                    isLatest
                      ? 'stroke-emerald-600 dark:stroke-emerald-400'
                      : 'stroke-zinc-900 dark:stroke-zinc-100'
                  }
                />
              );
            })}
          </g>

          {/* Start point indicator on active stroke */}
          {activeStrokeIndex >= 0 &&
            (isPlaying || visibleCount < strokes.length) &&
            strokes[activeStrokeIndex]?.samples[0] && (
              <circle
                cx={strokes[activeStrokeIndex].samples[0].x}
                cy={strokes[activeStrokeIndex].samples[0].y}
                r="2.8"
                className="fill-emerald-600 dark:fill-emerald-400"
              />
            )}

          {/* Optional stroke order numbers */}
          {showNumbers &&
            strokes.slice(0, visibleCount).map((s) => {
              const pt = s.samples[0];
              if (!pt) return null;
              const nx = Math.min(101, Math.max(8, pt.x - 3.5));
              const ny = Math.min(101, Math.max(10, pt.y - 2.5));
              return (
                <text
                  key={`num-${s.index}`}
                  x={nx}
                  y={ny}
                  fontSize="6.5"
                  fontFamily="IBM Plex Mono, monospace"
                  fontWeight="600"
                  className="fill-emerald-700 dark:fill-emerald-400 select-none"
                >
                  {s.index + 1}
                </text>
              );
            })}
        </svg>
      </div>

      {/* Step & Playback Controls */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleTogglePlay}
          disabled={strokes.length === 0}
          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
        >
          {isPlaying ? (
            <>
              <Pause className="h-3.5 w-3.5" aria-hidden="true" />
              Pause
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              Animate
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleStepBack}
          disabled={visibleCount <= 0}
          aria-label="Previous stroke"
          title="Previous stroke"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 cursor-pointer"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        <span className="font-mono-num text-xs text-zinc-500 dark:text-zinc-400 min-w-[3.2rem] text-center">
          {visibleCount}/{strokes.length}
        </span>

        <button
          type="button"
          onClick={handleStepForward}
          disabled={visibleCount >= strokes.length}
          aria-label="Next stroke"
          title="Next stroke"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 cursor-pointer"
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={handleReset}
          aria-label="Show all strokes"
          title="Show all strokes"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => setShowNumbers((v) => !v)}
          aria-label={showNumbers ? 'Hide stroke numbers' : 'Show stroke numbers'}
          title={showNumbers ? 'Hide stroke numbers' : 'Show stroke numbers'}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors cursor-pointer ${
            showNumbers
              ? 'border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] text-zinc-500 dark:text-zinc-400'
          }`}
        >
          <Hash className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
