import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eraser,
  Eye,
  EyeOff,
  Ghost,
  RotateCcw,
} from 'lucide-react';
import {
  KanjiStrokeData,
  Point,
  StrokeValidationResult,
  validateStroke,
} from '../utils/kanjiVg';

interface KanjiCanvasProps {
  character: string;
  strokes: KanjiStrokeData[];
  defaultTracingGuide?: boolean;
  onStrokeAttempt: (isCorrect: boolean) => void;
  onComplete: (accuracyPct: number) => void;
}

interface CompletedStrokeVisual {
  index: number;
  d: string;
  justMatched: boolean;
}

export const KanjiCanvas: React.FC<KanjiCanvasProps> = ({
  character,
  strokes,
  defaultTracingGuide = false,
  onStrokeAttempt,
  onComplete,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [failedAttemptsOnCurrent, setFailedAttemptsOnCurrent] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [totalAccuracySum, setTotalAccuracySum] = useState(0);
  const [showTracingGuide, setShowTracingGuide] = useState(defaultTracingGuide);
  const [showGhostHint, setShowGhostHint] = useState(false);

  const [isDrawing, setIsDrawing] = useState(false);
  const [activePoints, setActivePoints] = useState<Point[]>([]);
  const activePointsRef = useRef<Point[]>([]);

  const [errorPoints, setErrorPoints] = useState<Point[] | null>(null);
  const [shaking, setShaking] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'neutral' | 'success' | 'error';
    text: string;
  }>({
    type: 'neutral',
    text: `Draw stroke 1 of ${strokes.length}`,
  });

  const [justMatchedIndex, setJustMatchedIndex] = useState<number | null>(null);

  // Reset state whenever character or stroke data changes
  useEffect(() => {
    setCompletedCount(0);
    setFailedAttemptsOnCurrent(0);
    setTotalAttempts(0);
    setTotalAccuracySum(0);
    setShowGhostHint(false);
    setActivePoints([]);
    activePointsRef.current = [];
    setErrorPoints(null);
    setShaking(false);
    setJustMatchedIndex(null);
    setFeedback({
      type: 'neutral',
      text: strokes.length > 0 ? `Draw stroke 1 of ${strokes.length}` : 'Loading strokes...',
    });
  }, [character, strokes]);

  const isCompleted = strokes.length > 0 && completedCount >= strokes.length;

  const to109Coords = useCallback((clientX: number, clientY: number): Point | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = ((clientX - rect.left) / rect.width) * 109;
    const y = ((clientY - rect.top) / rect.height) * 109;
    return {
      x: Math.max(0, Math.min(109, x)),
      y: Math.max(0, Math.min(109, y)),
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isCompleted || strokes.length === 0) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = to109Coords(e.clientX, e.clientY);
    if (!pt) return;
    setErrorPoints(null);
    setIsDrawing(true);
    const initial = [pt];
    activePointsRef.current = initial;
    setActivePoints(initial);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDrawing) return;
    const pt = to109Coords(e.clientX, e.clientY);
    if (!pt) return;
    const prev = activePointsRef.current[activePointsRef.current.length - 1];
    if (prev && Math.hypot(pt.x - prev.x, pt.y - prev.y) < 0.7) return;
    const next = [...activePointsRef.current, pt];
    activePointsRef.current = next;
    setActivePoints(next);
  };

  const finishStroke = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const drawn = activePointsRef.current;
    activePointsRef.current = [];
    setActivePoints([]);

    if (drawn.length < 2 || isCompleted) return;

    const result: StrokeValidationResult = validateStroke(drawn, strokes, completedCount);
    const nextTotalAttempts = totalAttempts + 1;
    setTotalAttempts(nextTotalAttempts);

    if (result.valid) {
      onStrokeAttempt(true);
      const nextCompleted = completedCount + 1;
      const nextAccuracySum = totalAccuracySum + result.accuracy;
      setCompletedCount(nextCompleted);
      setTotalAccuracySum(nextAccuracySum);
      setFailedAttemptsOnCurrent(0);
      setShowGhostHint(false);
      setJustMatchedIndex(completedCount);
      setTimeout(() => {
        setJustMatchedIndex((curr) => (curr === completedCount ? null : curr));
      }, 350);

      if (nextCompleted >= strokes.length) {
        const penalty = Math.max(0, (nextTotalAttempts - strokes.length) * 6);
        const avgAcc = Math.round(
          Math.max(50, Math.min(100, nextAccuracySum / strokes.length - penalty))
        );
        setFeedback({
          type: 'success',
          text: `Completed! ${avgAcc}% stroke accuracy`,
        });
        onComplete(avgAcc);
      } else {
        setFeedback({
          type: 'success',
          text: `Stroke ${nextCompleted} accepted — draw stroke ${nextCompleted + 1} of ${strokes.length}`,
        });
      }
    } else {
      onStrokeAttempt(false);
      const nextFailed = failedAttemptsOnCurrent + 1;
      setFailedAttemptsOnCurrent(nextFailed);
      setErrorPoints(drawn);
      setShaking(true);
      setFeedback({
        type: 'error',
        text:
          nextFailed >= 2
            ? `${result.message} Ghost hint unlocked below.`
            : result.message,
      });
      setTimeout(() => {
        setShaking(false);
        setErrorPoints(null);
      }, 420);
    }
  };

  const handleUndo = () => {
    if (completedCount <= 0 || isCompleted) return;
    const prev = completedCount - 1;
    setCompletedCount(prev);
    setFailedAttemptsOnCurrent(0);
    setShowGhostHint(false);
    setFeedback({
      type: 'neutral',
      text: `Undid stroke ${prev + 1} — draw stroke ${prev + 1} of ${strokes.length}`,
    });
  };

  const handleClear = () => {
    if (isCompleted) return;
    setCompletedCount(0);
    setFailedAttemptsOnCurrent(0);
    setShowGhostHint(false);
    setActivePoints([]);
    activePointsRef.current = [];
    setErrorPoints(null);
    setFeedback({
      type: 'neutral',
      text: `Canvas cleared — draw stroke 1 of ${strokes.length}`,
    });
  };

  const completedVisuals: CompletedStrokeVisual[] = useMemo(() => {
    return strokes.slice(0, completedCount).map((s) => ({
      index: s.index,
      d: s.d,
      justMatched: s.index === justMatchedIndex,
    }));
  }, [strokes, completedCount, justMatchedIndex]);

  const currentTarget = strokes[completedCount];
  const ghostStartPoint = currentTarget?.samples[0];

  const pointsToSvgPath = (pts: Point[]) => {
    if (pts.length === 0) return '';
    return pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  };

  return (
    <div className="flex flex-col items-center w-full">
      {/* Canvas Container */}
      <div
        className={`relative w-full max-w-[340px] aspect-square rounded-xl border bg-white dark:bg-[#191B20] transition-colors ${
          errorPoints
            ? 'border-red-500 dark:border-red-500'
            : isCompleted
            ? 'border-emerald-500 dark:border-emerald-500'
            : 'border-zinc-200 dark:border-zinc-800'
        } ${shaking ? 'animate-shake' : ''}`}
      >
        {/* Top-left stroke counter */}
        <div className="pointer-events-none absolute left-3 top-2.5 z-10 flex items-center gap-2 text-xs font-mono-num text-zinc-500 dark:text-zinc-400">
          <span>
            Stroke {Math.min(completedCount + (isCompleted ? 0 : 1), strokes.length)} / {strokes.length}
          </span>
        </div>

        <svg
          ref={svgRef}
          viewBox="0 0 109 109"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          className={`h-full w-full select-none rounded-xl ${
            isCompleted ? 'cursor-default' : 'cursor-crosshair'
          }`}
          style={{ touchAction: 'none' }}
          role="img"
          aria-label={`Handwriting practice canvas for ${character}`}
        >
          {/* Traditional Genkouyoushi 4-quadrant dashed grid */}
          <g className="stroke-zinc-200 dark:stroke-zinc-700/70" strokeWidth="0.55" fill="none">
            <rect x="6" y="6" width="97" height="97" rx="2" strokeDasharray="2 2" />
            <line x1="54.5" y1="6" x2="54.5" y2="103" strokeDasharray="2.5 2.5" />
            <line x1="6" y1="54.5" x2="103" y2="54.5" strokeDasharray="2.5 2.5" />
            <line
              x1="6"
              y1="6"
              x2="103"
              y2="103"
              strokeDasharray="1.5 3.5"
              className="opacity-50"
            />
            <line
              x1="103"
              y1="6"
              x2="6"
              y2="103"
              strokeDasharray="1.5 3.5"
              className="opacity-50"
            />
          </g>

          {/* Optional Tracing Guide (full character watermark) */}
          {showTracingGuide && (
            <g
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="4.2"
              className="stroke-zinc-300/65 dark:stroke-zinc-700/70"
            >
              {strokes.map((s) => (
                <path key={`guide-${s.index}`} d={s.d} />
              ))}
            </g>
          )}

          {/* Ghost Hint for Next Stroke (animated stroke path + starting point) */}
          {showGhostHint && currentTarget && !isCompleted && (
            <g>
              <path
                d={currentTarget.d}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="4.4"
                className="stroke-amber-500/40 dark:stroke-amber-400/35"
              />
              <path
                d={currentTarget.d}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3.6"
                style={{ '--stroke-len': Math.ceil(currentTarget.length + 10) } as React.CSSProperties}
                className="stroke-amber-600 dark:stroke-amber-400 animate-ghost-stroke"
              />
              {ghostStartPoint && (
                <circle
                  cx={ghostStartPoint.x}
                  cy={ghostStartPoint.y}
                  r="3.2"
                  className="fill-amber-600 dark:fill-amber-400"
                />
              )}
            </g>
          )}

          {/* Completed Snapped KanjiVG Strokes */}
          <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5.2">
            {completedVisuals.map((s) => (
              <path
                key={`done-${s.index}`}
                d={s.d}
                className={
                  s.justMatched
                    ? 'stroke-emerald-600 dark:stroke-emerald-400 transition-colors duration-300'
                    : 'stroke-zinc-900 dark:stroke-zinc-100 transition-colors duration-300'
                }
              />
            ))}
          </g>

          {/* Active User Brush Stroke */}
          {activePoints.length > 1 && (
            <path
              d={pointsToSvgPath(activePoints)}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="5"
              className="stroke-zinc-800 dark:stroke-zinc-200"
            />
          )}

          {/* Failed Stroke Flash */}
          {errorPoints && errorPoints.length > 1 && (
            <path
              d={pointsToSvgPath(errorPoints)}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="5"
              className="stroke-red-500 dark:stroke-red-400"
            />
          )}
        </svg>
      </div>

      {/* Explicit Dual-Coded Status Feedback (Icon + Text, never hue alone) */}
      <div
        role="status"
        aria-live="polite"
        className={`mt-3 flex items-center gap-2 text-xs font-medium min-h-[20px] ${
          feedback.type === 'error'
            ? 'text-red-600 dark:text-red-400'
            : feedback.type === 'success'
            ? 'text-emerald-700 dark:text-emerald-400'
            : 'text-zinc-500 dark:text-zinc-400'
        }`}
      >
        {feedback.type === 'error' && <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        {feedback.type === 'success' && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        <span>{feedback.text}</span>
      </div>

      {/* Canvas Controls */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={handleUndo}
          disabled={completedCount === 0 || isCompleted}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Undo Stroke
        </button>

        <button
          type="button"
          onClick={handleClear}
          disabled={completedCount === 0 || isCompleted}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Eraser className="h-3.5 w-3.5" aria-hidden="true" />
          Clear Canvas
        </button>

        <button
          type="button"
          onClick={() => setShowTracingGuide((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            showTracingGuide
              ? 'border-emerald-600/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
              : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800'
          }`}
        >
          {showTracingGuide ? (
            <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {showTracingGuide ? 'Hide Tracing Guide' : 'Tracing Guide'}
        </button>

        {!isCompleted && (failedAttemptsOnCurrent >= 2 || showGhostHint) && (
          <button
            type="button"
            onClick={() => setShowGhostHint((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showGhostHint
                ? 'border-amber-500 bg-amber-500/15 text-amber-800 dark:text-amber-300'
                : 'border-amber-500/60 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/20'
            }`}
          >
            <Ghost className="h-3.5 w-3.5" aria-hidden="true" />
            {showGhostHint ? 'Hide Stroke Ghost' : 'Show Next Stroke Ghost'}
          </button>
        )}
      </div>
    </div>
  );
};
