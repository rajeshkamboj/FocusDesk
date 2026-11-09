'use client';

import { useState } from 'react';
import type {
  ScienceConcept,
  ScienceEducationLevel,
  ScienceLevelSet,
} from '@/lib/curiosity/types';
import {
  DEFAULT_SCIENCE_EDUCATION_LEVEL,
  SCIENCE_EDUCATION_LEVELS,
  SCIENCE_EDUCATION_LEVEL_HINTS,
  SCIENCE_EDUCATION_LEVEL_LABELS,
} from '@/lib/curiosity/types';
import { IconBiology, IconChemistry, IconPhysics } from '@/components/ui/icons';
import { ScienceCard } from './science';

/**
 * The Science group, with the two educational levels.
 *
 * There are exactly two controls and there is no third. `foundation` — school-level
 * science in plain language — is the default, and it is what `briefing.chemistry`,
 * `physics` and `biology` publish, so a reader who never touches the selector still
 * gets the accessible version. `undergraduate` shows the scored research records,
 * still labelled with their provenance.
 *
 * A discipline with no qualified undergraduate record today is not silently filled
 * with foundation content under the wrong label: the card says there is nothing at
 * that level today. That is the honest behaviour, and it is also what stops the
 * research lane from quietly becoming the default again.
 */
export function ScienceSection({
  concepts,
  levels,
  note,
}: {
  concepts: { chemistry: ScienceConcept; physics: ScienceConcept; biology: ScienceConcept };
  levels?: ScienceLevelSet;
  note?: string;
}) {
  const [level, setLevel] = useState<ScienceEducationLevel>(DEFAULT_SCIENCE_EDUCATION_LEVEL);

  const foundation = levels?.foundation ?? concepts;
  const undergraduate = levels?.undergraduate;
  const hasUndergraduate = Boolean(
    undergraduate && (undergraduate.chemistry || undergraduate.physics || undergraduate.biology),
  );

  const cardFor = (discipline: 'chemistry' | 'physics' | 'biology') => {
    if (level === 'foundation') return foundation[discipline];
    return undergraduate?.[discipline];
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-surface px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Choose a level</p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-2">{SCIENCE_EDUCATION_LEVEL_HINTS[level]}</p>
          </div>
          {/* Wraps: the two labels are long enough to exceed 320px side by side, and
              a control that overflows the card is a control half the readers cannot
              reach. The selected state is unchanged. */}
          <div
            role="group"
            aria-label="Science educational level"
            className="flex max-w-full flex-wrap gap-1.5 rounded-full border border-line bg-surface-2/60 p-1"
          >
            {SCIENCE_EDUCATION_LEVELS.map((option) => {
              const selected = level === option;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setLevel(option)}
                  className={`max-w-full rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                    selected ? 'bg-accent-soft text-accent-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                  }`}
                >
                  {SCIENCE_EDUCATION_LEVEL_LABELS[option]}
                </button>
              );
            })}
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
          {level === 'undergraduate'
            ? hasUndergraduate
              ? 'Undergraduate cards are research records. Each states whether it is peer-reviewed or a preprint, and what is still unknown.'
              : 'No undergraduate-level record qualified for today. The Foundation level below is the complete briefing for today.'
            : 'Foundation cards explain the concept in plain language and say where the idea shows up in ordinary life.'}
          {note ? ` ${note}` : ''}
        </p>
      </div>

      <div className="grid gap-7 lg:grid-cols-3">
        <section className="h-full">
          {cardFor('chemistry') ? (
            <ScienceCard
              label="Chemistry of the Day"
              connectionLabel="Everyday connection"
              icon={<IconChemistry width={18} height={18} />}
              concept={cardFor('chemistry')!}
              level={level}
            />
          ) : (
            <EmptyLevelCard label="Chemistry of the Day" level={level} />
          )}
        </section>
        <section className="h-full">
          {cardFor('physics') ? (
            <ScienceCard
              label="Physics of the Day"
              connectionLabel="Real-world connection"
              icon={<IconPhysics width={18} height={18} />}
              concept={cardFor('physics')!}
              level={level}
            />
          ) : (
            <EmptyLevelCard label="Physics of the Day" level={level} />
          )}
        </section>
        <section className="h-full">
          {cardFor('biology') ? (
            <ScienceCard
              label="Biology of the Day"
              connectionLabel="Everyday connection"
              icon={<IconBiology width={18} height={18} />}
              concept={cardFor('biology')!}
              level={level}
            />
          ) : (
            <EmptyLevelCard label="Biology of the Day" level={level} />
          )}
        </section>
      </div>
    </div>
  );
}

function EmptyLevelCard({ label, level }: { label: string; level: ScienceEducationLevel }) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-dashed border-line bg-surface p-4 sm:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">{label}</p>
      <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
        Nothing at the {SCIENCE_EDUCATION_LEVEL_LABELS[level].toLowerCase()} level qualified today. Rather than pad the
        card with content from another level, it stays empty — switch to School / Foundation Science for today’s
        explainer.
      </p>
    </div>
  );
}
