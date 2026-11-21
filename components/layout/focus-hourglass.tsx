'use client';

import { useEffect, useId, useRef } from 'react';

const CYCLE_SECONDS = 30 * 60;
const CHAMBER_TOP = 27;
const NECK = 140;
const CHAMBER_BOTTOM = 253;
const CHAMBER_HEIGHT = NECK - CHAMBER_TOP;

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * A visual hourglass driven only by Focus Mode's elapsed task timer.
 *
 * Each 30-minute interval alternates which physical chamber is the upper
 * chamber. The glass flips around its horizontal axis at the boundary. Sand
 * geometry is calculated in the glass's local coordinate system:
 * - Upright: upper chamber drains toward the neck; lower chamber fills from
 *   its base toward the neck.
 * - Inverted: the local lower chamber drains toward the neck; the local upper
 *   chamber fills from its rim toward the neck. The 3D flip maps those local
 *   chambers to the correct physical top and bottom on screen.
 */
export function FocusHourglass({ elapsedSeconds, isRunning }: { elapsedSeconds: number; isRunning: boolean }) {
  const gradientId = useId().replace(/:/g, '');
  const svgRef = useRef<SVGSVGElement>(null);

  // Pause both SVG's native SMIL grain/dash animations and the CSS 3D flip
  // transition. Resuming continues each animation from its exact paused time.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const animations = svg.getAnimations({ subtree: true });
    if (isRunning) {
      svg.unpauseAnimations();
      animations.forEach((animation) => animation.play());
    } else {
      svg.pauseAnimations();
      animations.forEach((animation) => animation.pause());
    }
  }, [isRunning]);
  const elapsed = Math.max(0, Math.floor(elapsedSeconds));
  const cycleIndex = Math.floor(elapsed / CYCLE_SECONDS);
  const progress = (elapsed % CYCLE_SECONDS) / CYCLE_SECONDS;
  const inverted = cycleIndex % 2 === 1;

  const topFill = inverted ? progress : 1 - progress;
  const bottomFill = 1 - topFill;
  const topSandHeight = CHAMBER_HEIGHT * topFill;
  const bottomSandHeight = CHAMBER_HEIGHT * bottomFill;

  // Crucial: when inverted, the local upper chamber becomes the physical
  // lower chamber, so new sand must accumulate from its local top rim.
  // Likewise, the local lower chamber drains from its neck when inverted.
  const topSandY = inverted ? CHAMBER_TOP : NECK - topSandHeight;
  const bottomSandY = inverted ? NECK : CHAMBER_BOTTOM - bottomSandHeight;

  const topSurfaceY = inverted ? topSandY + topSandHeight : topSandY;
  const bottomSurfaceY = bottomSandY;
  const secondsUntilFlip = CYCLE_SECONDS - (elapsed % CYCLE_SECONDS);
  // The stream must always begin at the physical upper pile's neck and
  // end at the physical lower pile's current surface. When the glass is
  // inverted, local SVG coordinates run opposite to screen-space gravity.
  // Therefore reverse the local path and terminate it at the growing pile.
  const flowPath = inverted
    ? `M100 ${NECK + 5} L100 ${topSandY + topSandHeight}`
    : `M100 ${NECK - 5} L100 ${bottomSandY}`;
  const isFlowing = progress > 0.003 && progress < 0.997;

  return (
    <section
      className="mt-7 flex items-center justify-center gap-5 sm:gap-7"
      aria-label={`Hourglass cycle ${cycleIndex + 1}. Next flip in ${formatCountdown(secondsUntilFlip)}`}
    >
      <div
        className="relative flex h-[172px] w-[116px] items-center justify-center sm:h-[190px] sm:w-[130px]"
        style={{ perspective: '900px' }}
      >
        <svg
          ref={svgRef}
          viewBox="0 0 200 280"
          role="img"
          aria-label="Glass hourglass with flowing golden sand"
          className="h-full w-full overflow-visible transition-transform duration-[1100ms] ease-in-out motion-reduce:transition-none"
          style={{
            transform: inverted ? 'rotateX(180deg)' : 'rotateX(0deg)',
            transformOrigin: 'center center',
            transformStyle: 'preserve-3d',
            backfaceVisibility: 'visible',
          }}
        >
          <defs>
            <linearGradient id={`${gradientId}-glass`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#8fa3b8" stopOpacity=".2" />
              <stop offset=".18" stopColor="#ffffff" stopOpacity=".82" />
              <stop offset=".38" stopColor="#a8bfd2" stopOpacity=".12" />
              <stop offset=".72" stopColor="#ffffff" stopOpacity=".48" />
              <stop offset="1" stopColor="#8fa3b8" stopOpacity=".16" />
            </linearGradient>
            <linearGradient id={`${gradientId}-sand`} x1="0" y1="0" x2=".8" y2="1">
              <stop offset="0" stopColor="#ffe7a0" />
              <stop offset=".48" stopColor="#f6bf55" />
              <stop offset="1" stopColor="#c98228" />
            </linearGradient>
            <linearGradient id={`${gradientId}-rim`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#9b7544" />
              <stop offset=".5" stopColor="#f1d09a" />
              <stop offset="1" stopColor="#8a6338" />
            </linearGradient>
            <clipPath id={`${gradientId}-top`}>
              <path d="M42 27 C42 66 73 96 91 126 Q100 140 109 126 C127 96 158 66 158 27 Z" />
            </clipPath>
            <clipPath id={`${gradientId}-bottom`}>
              <path d="M42 253 C42 214 73 184 91 154 Q100 140 109 154 C127 184 158 214 158 253 Z" />
            </clipPath>
          </defs>

          <ellipse cx="100" cy="265" rx="59" ry="7" fill="#e7a943" opacity=".12" />

          {/* Glass silhouette and reflective edges */}
          <path
            d="M35 24 C35 66 69 101 88 130 Q100 145 112 130 C131 101 165 66 165 24"
            fill="none"
            stroke={`url(#${gradientId}-rim)`}
            strokeWidth="5"
            strokeLinecap="round"
            opacity=".9"
          />
          <path
            d="M35 256 C35 214 69 179 88 150 Q100 135 112 150 C131 179 165 214 165 256"
            fill="none"
            stroke={`url(#${gradientId}-rim)`}
            strokeWidth="5"
            strokeLinecap="round"
            opacity=".9"
          />
          <path
            d="M39 24 C39 65 72 99 90 128 Q100 141 110 128 C128 99 161 65 161 24 L161 256 C161 215 128 181 110 152 Q100 139 90 152 C72 181 39 215 39 256 Z"
            fill={`url(#${gradientId}-glass)`}
            opacity=".16"
          />

          {/* Upper chamber: drains toward the neck when upright; fills from
              the rim when inverted (it then becomes the physical lower bowl). */}
          <g clipPath={`url(#${gradientId}-top)`}>
            <rect
              x="30"
              y={topSandY}
              width="140"
              height={topSandHeight + 1}
              fill={`url(#${gradientId}-sand)`}
            />
            <path
              d={`M44 ${topSurfaceY} Q100 ${topSurfaceY + (inverted ? 5 : -5)} 156 ${topSurfaceY}`}
              fill="none"
              stroke="#fff0bd"
              strokeWidth="2"
              opacity=".76"
            />
          </g>

          {/* Lower chamber: fills from its base when upright; drains from
              the neck when inverted (it then becomes the physical upper bowl). */}
          <g clipPath={`url(#${gradientId}-bottom)`}>
            <rect
              x="30"
              y={bottomSandY}
              width="140"
              height={bottomSandHeight + 1}
              fill={`url(#${gradientId}-sand)`}
            />
            <path
              d={`M45 ${bottomSurfaceY} Q100 ${bottomSurfaceY - 5} 155 ${bottomSurfaceY}`}
              fill="none"
              stroke="#fff0bd"
              strokeWidth="2"
              opacity=".62"
            />
          </g>

          {/* A continuous falling stream with moving grains. Direction reverses
              in local coordinates on alternate cycles; the glass flip makes
              the stream always travel physically downward on screen. */}
          {isFlowing && (
            <g>
              <path
                d={flowPath}
                fill="none"
                stroke="#f8d47f"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeDasharray="2 5"
                opacity=".9"
              >
                <animate attributeName="stroke-dashoffset" values="0;-14" dur=".42s" repeatCount="indefinite" />
              </path>
              {[0, 1, 2, 3].map((grain) => (
                <circle
                  key={grain}
                  r={grain === 1 ? 1.8 : 1.35}
                  fill={grain === 1 ? '#fff0bd' : '#e6a83e'}
                >
                  <animateMotion
                    path={flowPath}
                    dur="0.78s"
                    begin={`-${grain * 0.195}s`}
                    repeatCount="indefinite"
                  />
                </circle>
              ))}
            </g>
          )}

          {/* Top and bottom collars rotate with the glass during the flip. */}
          <path
            d="M30 22 Q100 14 170 22 L170 30 Q100 37 30 30 Z"
            fill={`url(#${gradientId}-rim)`}
            stroke="#f5d9aa"
            strokeOpacity=".45"
          />
          <path
            d="M30 250 Q100 257 170 250 L170 258 Q100 266 30 258 Z"
            fill={`url(#${gradientId}-rim)`}
            stroke="#f5d9aa"
            strokeOpacity=".45"
          />
          <path d="M52 39 C58 72 77 91 88 111" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" opacity=".48" />
          <path d="M148 241 C142 208 123 189 112 169" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity=".2" />
        </svg>
      </div>

      <div className="min-w-[112px] text-left">
        <p className="text-xs font-medium text-ink-3">Hourglass cycle</p>
        <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#f4c66e]">
          {cycleIndex + 1}
        </p>
        <p className="mt-4 text-xs text-ink-3">Next flip in</p>
        <p className="mt-1 rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-lg font-medium tabular-nums text-ink">
          {formatCountdown(secondsUntilFlip)}
        </p>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#c98228] via-[#f6bf55] to-[#ffe7a0] transition-[width] duration-500"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <p className="mt-1.5 text-[10px] text-ink-3">30-minute rhythm</p>
      </div>
    </section>
  );
}
