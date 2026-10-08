import { SectionCard, VisualMark } from '../section-card';
import { IconMyth } from '@/components/ui/icons';
import type { ClaimLayer, MythCharacter } from '@/lib/curiosity/types';

/**
 * Mythology — Character of the Day.
 *
 * The one card on the page that earns extra width and a second column: the
 * character needs a narrative on the left and a reference panel on the right
 * (family, key relationships, timeline, texts). Below `lg` the two columns
 * simply stack, so a phone sees story first and reference second.
 *
 * Nothing here decides what the reader should believe. Every claim carries the
 * evidence layer it belongs to — A textual, B traditional, C modern analysis,
 * D inference — and the legend is printed above the list rather than buried in
 * a footnote. A speculating sentence is never allowed to look like scripture.
 */
const LAYERS: Record<ClaimLayer, { label: string; tone: string; hint: string }> = {
  textual: { label: 'A · Textual', tone: 'bg-accent-soft text-accent-ink', hint: 'stated in the named source' },
  traditional: { label: 'B · Traditional', tone: 'bg-surface-2 text-ink-2', hint: 'how the tradition retells it' },
  analysis: { label: 'C · Analysis', tone: 'border border-line text-ink-2', hint: 'a modern reading' },
  inference: { label: 'D · Inference', tone: 'border border-dashed border-line text-ink-3', hint: 'a reasoned guess' },
};

function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/30 p-3.5 sm:p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">{label}</p>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

export function MythologySection({ character }: { character: MythCharacter }) {
  return (
    <SectionCard label="Mythology · Character of the Day">
      <div className="space-y-5">
        <div className="flex gap-3.5">
          <VisualMark>
            <IconMyth width={18} height={18} />
          </VisualMark>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-medium leading-snug text-ink">{character.name}</h3>
            <p className="mt-0.5 text-[12.5px] leading-snug text-ink-3">{character.tradition}</p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-start lg:gap-x-8">
          {/* Narrative and layered claims */}
          <div className="space-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                The story
                <span className="ml-2 font-normal normal-case tracking-normal">told as the tradition tells it</span>
              </p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{character.story}</p>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Lesser-known points</p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-ink-3">
                Each point is labelled: A stated in the text · B traditional interpretation · C modern analysis · D speculation or inference.
              </p>
              <ul className="mt-2.5 space-y-2.5">
                {character.lesserKnown.map((claim) => {
                  const layer = LAYERS[claim.layer];
                  return (
                    <li key={claim.text} className="flex min-w-0 gap-2.5">
                      <span
                        className={`mt-0.5 inline-flex h-[19px] shrink-0 items-center rounded-md px-1.5 text-[10px] font-semibold uppercase tracking-wide ${layer.tone}`}
                        title={layer.hint}
                      >
                        {layer.label}
                      </span>
                      <p className="min-w-0 break-words text-[12.5px] leading-relaxed text-ink-2">{claim.text}</p>
                    </li>
                  );
                })}
              </ul>
            </div>

            {character.variants && character.variants.length > 0 ? (
              <div className="rounded-xl border border-line bg-surface-2/40 p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Where traditions differ</p>
                <ul className="mt-2 space-y-2">
                  {character.variants.map((variant) => (
                    <li key={variant.tradition} className="text-[12.5px] leading-relaxed text-ink-2">
                      <span className="font-medium text-ink">{variant.tradition}: </span>
                      {variant.difference}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="rounded-xl border border-line/70 bg-surface-2/40 px-3.5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                Modern reading
                <span className="ml-2 font-normal normal-case tracking-normal">C · analysis, not scripture</span>
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{character.analysis}</p>
            </div>
          </div>

          {/* Reference panel */}
          <div className="space-y-4">
            <Panel label="Family & relationships">
              <ul className="space-y-2.5 border-l border-line pl-3.5">
                {character.family.map((member) => (
                  <li key={`${member.relation}-${member.name}`} className="relative min-w-0">
                    <span aria-hidden className="absolute -left-3.5 top-2 h-px w-2.5 bg-line" />
                    <p className="break-words text-[12.5px] leading-snug text-ink">{member.name}</p>
                    <p className="break-words text-[11px] leading-snug text-ink-3">
                      {member.relation}
                      {member.note ? ` · ${member.note}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="mt-3.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Key relationships</p>
              <ul className="mt-2 space-y-2">
                {character.relationships.map((relationship) => (
                  <li key={relationship.with} className="min-w-0">
                    <p className="text-[12.5px] leading-snug text-ink">{relationship.with}</p>
                    <p className="break-words text-[11.5px] leading-relaxed text-ink-3">{relationship.note}</p>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel label="Timeline">
              <ol className="space-y-2.5 border-l border-line pl-3.5">
                {character.timeline.map((entry) => (
                  <li key={`${entry.when}-${entry.event}`} className="relative min-w-0">
                    <span aria-hidden className="absolute -left-[17px] top-[5px] h-1.5 w-1.5 rounded-full bg-accent" />
                    <p className="text-[12px] font-medium leading-snug text-ink">{entry.when}</p>
                    <p className="break-words text-[11.5px] leading-relaxed text-ink-3">{entry.event}</p>
                  </li>
                ))}
              </ol>
            </Panel>

            <div className="rounded-xl border border-dashed border-line px-3.5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Texts & traditions</p>
              <ul className="mt-2 space-y-1">
                {character.sources.map((source) => (
                  <li key={source} className="break-words text-[11.5px] leading-relaxed text-ink-2">{source}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
