'use client';

import { useMemo, useState } from 'react';
import { useData } from '@/components/data/data-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm';
import { EmptyState } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Menu, MenuItem } from '@/components/ui/menu';
import { Modal } from '@/components/ui/modal';
import { IconMilestones, IconMore, IconPencil, IconPlus, IconTrash } from '@/components/ui/icons';
import { PageHeader } from '@/components/layout/page-header';
import {
  MILESTONE_CATEGORIES,
  categoryLabel,
  formatMilestoneDate,
  groupMilestones,
  isValidMilestoneDate,
  precisionOf,
} from '@/lib/milestones';
import type { Milestone, MilestoneCategory } from '@/lib/types';

type CategoryFilter = 'all' | MilestoneCategory;

/**
 * Milestones — the learning timeline.
 *
 * Latest first, grouped Year → Month, with deliberately partial dates
 * (a year, a month, or an exact day) so an honest "sometime in 2024" can
 * sit next to "14 Aug 2025" without being faked into a precise day.
 */
export function MilestonesScreen() {
  const { data, actions } = useData();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Milestone | undefined>(undefined);
  const [deleting, setDeleting] = useState<Milestone | undefined>(undefined);
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [query, setQuery] = useState('');

  const milestones = data.milestones;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return milestones.filter((m) => {
      if (category !== 'all' && m.category !== category) return false;
      if (!q) return true;
      return (
        m.title.toLowerCase().includes(q) ||
        (m.description ?? '').toLowerCase().includes(q)
      );
    });
  }, [milestones, category, query]);

  const years = useMemo(() => groupMilestones(filtered), [filtered]);
  const thisYear = new Date().getFullYear();
  const thisYearCount = milestones.filter((m) => m.date.slice(0, 4) === String(thisYear)).length;

  // Only offer categories that actually exist in the data, plus "All" —
  // an empty filter is noise, not a feature.
  const usedCategories = useMemo(() => {
    const present = new Set(milestones.map((m) => m.category));
    return MILESTONE_CATEGORIES.filter((c) => present.has(c.id));
  }, [milestones]);

  const openNew = () => {
    setEditing(undefined);
    setFormOpen(true);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-10 pt-8 sm:px-8 sm:pb-16 sm:pt-10">
      <PageHeader
        title="Milestones"
        subtitle="When you first picked something up — tools, frameworks, ideas. Newest first."
        actions={
          <Button variant="primary" onClick={openNew}>
            <IconPlus width={16} height={16} />
            New Milestone
          </Button>
        }
      />

      {milestones.length > 0 ? (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{milestones.length} total</Badge>
          <Badge tone="accent">{thisYearCount} in {thisYear}</Badge>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="h-9 w-40 text-[13px]"
            />
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value as CategoryFilter)}
              className="h-9 w-auto text-[13px]"
            >
              <option value="all">All categories</option>
              {usedCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </Select>
          </div>
        </div>
      ) : null}

      {years.length === 0 ? (
        <EmptyState
          icon={<IconMilestones width={24} height={24} />}
          title={milestones.length === 0 ? 'Your timeline starts here' : 'Nothing matches'}
          hint={
            milestones.length === 0
              ? 'Log the day you first tried a tool, framework or idea — and look back later to see how fast you were moving.'
              : 'Try a different category or search term.'
          }
          action={
            milestones.length === 0 ? (
              <Button variant="primary" size="sm" onClick={openNew}>
                <IconPlus width={15} height={15} />
                New Milestone
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-8">
          {years.map((year) => (
            <section key={year.year}>
              <div className="mb-3 flex items-baseline gap-2">
                <h2 className="text-lg font-semibold tracking-tight text-ink">{year.year}</h2>
                <span className="text-[11px] text-ink-3">
                  {year.count} {year.count === 1 ? 'milestone' : 'milestones'}
                </span>
              </div>

              {year.months.map((month) => (
                <div key={`${year.year}-${month.month}`} className="mb-4 last:mb-0">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-3">
                    {month.label}
                  </p>

                  {/* The rail: one continuous line per month, a dot per entry. */}
                  <ul className="relative space-y-2.5 border-l border-line pl-5">
                    {month.items.map((m) => (
                      <li key={m.id} className="relative">
                        <span
                          aria-hidden
                          className={`absolute -left-[23px] top-5 h-2.5 w-2.5 rounded-full border-2 border-background ${
                            precisionOf(m.date) === 'day' ? 'bg-accent' : 'bg-line-strong'
                          }`}
                        />
                        <MilestoneCard
                          milestone={m}
                          onEdit={() => { setEditing(m); setFormOpen(true); }}
                          onDelete={() => setDeleting(m)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}

      {/* Keyed + conditionally mounted so each open starts clean. */}
      {formOpen ? (
        <MilestoneFormModal
          key={editing?.id ?? 'new'}
          open
          milestone={editing}
          onClose={() => { setFormOpen(false); setEditing(undefined); }}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== undefined}
        title="Delete milestone?"
        message={`“${deleting?.title ?? ''}” will be permanently removed from your timeline.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleting(undefined)}
        onConfirm={() => {
          if (deleting) void actions.deleteMilestone(deleting.id);
          setDeleting(undefined);
        }}
      />
    </div>
  );
}

function MilestoneCard({
  milestone,
  onEdit,
  onDelete,
}: {
  milestone: Milestone;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-start gap-3 rounded-2xl border border-line bg-surface px-5 py-4 shadow-card">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[14.5px] font-semibold leading-snug text-ink">{milestone.title}</h3>
          <Badge tone="muted">{categoryLabel(milestone.category)}</Badge>
        </div>
        {milestone.description ? (
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{milestone.description}</p>
        ) : null}
        <p className="mt-1.5 text-[11px] text-ink-3">{formatMilestoneDate(milestone.date)}</p>
      </div>

      <Menu
        trigger={({ toggle }) => (
          <button
            onClick={toggle}
            aria-label="Milestone actions"
            className="rounded-lg p-1.5 text-ink-3 opacity-0 transition-all hover:bg-surface-2 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
          >
            <IconMore width={17} height={17} />
          </button>
        )}
      >
        {(close) => (
          <>
            <MenuItem onClick={() => { onEdit(); close(); }}>
              <IconPencil width={14} height={14} /> Edit…
            </MenuItem>
            <MenuItem danger onClick={() => { onDelete(); close(); }}>
              <IconTrash width={14} height={14} /> Delete
            </MenuItem>
          </>
        )}
      </Menu>
    </div>
  );
}

const MONTH_OPTIONS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function MilestoneFormModal({
  open,
  onClose,
  milestone,
}: {
  open: boolean;
  onClose: () => void;
  milestone?: Milestone;
}) {
  const { actions } = useData();
  const existingPrecision = milestone ? precisionOf(milestone.date) : 'day';

  const [title, setTitle] = useState(milestone?.title ?? '');
  const [category, setCategory] = useState<MilestoneCategory>(milestone?.category ?? 'ai-tool');
  const [description, setDescription] = useState(milestone?.description ?? '');
  const [precision, setPrecision] = useState(existingPrecision);
  const now = new Date();
  const [year, setYear] = useState(milestone ? milestone.date.slice(0, 4) : String(now.getFullYear()));
  const [month, setMonth] = useState(
    milestone && existingPrecision !== 'year'
      ? milestone.date.slice(5, 7)
      : String(now.getMonth() + 1).padStart(2, '0'),
  );
  const [day, setDay] = useState(
    milestone && existingPrecision === 'day'
      ? milestone.date.slice(8, 10)
      : String(now.getDate()).padStart(2, '0'),
  );
  const [saving, setSaving] = useState(false);

  const date =
    precision === 'year' ? year : precision === 'month' ? `${year}-${month}` : `${year}-${month}-${day}`;
  const dateValid = isValidMilestoneDate(date);
  const canSave = title.trim().length > 0 && dateValid && !saving;

  const daysInMonth =
    precision === 'day' && /^\d{4}$/.test(year)
      ? new Date(Number(year), Number(month), 0).getDate()
      : 31;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    const payload = {
      title: title.trim(),
      category,
      description: description.trim() || undefined,
      date,
    };
    try {
      if (milestone) await actions.updateMilestone(milestone.id, payload);
      else await actions.addMilestone(payload);
    } catch (err) {
      setSaving(false);
      throw err;
    }
    setSaving(false);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={milestone ? 'Edit milestone' : 'New milestone'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={!canSave}>
            {milestone ? 'Save changes' : 'Add to timeline'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="What did you start?">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Dyad"
            autoFocus
          />
        </Field>

        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value as MilestoneCategory)}>
            {MILESTONE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </Select>
        </Field>

        <Field label="Description" hint="One line — what it is, or what it solved.">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Why it mattered…"
            className="min-h-20"
          />
        </Field>

        <Field label="How precisely do you remember?">
          <Select value={precision} onChange={(e) => setPrecision(e.target.value as typeof precision)}>
            <option value="day">Exact date</option>
            <option value="month">Month and year</option>
            <option value="year">Year only</option>
          </Select>
        </Field>

        <div className="flex gap-3">
          {precision === 'day' ? (
            <Field label="Day" className="w-24">
              <Select value={day} onChange={(e) => setDay(e.target.value)}>
                {Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0')).map((d) => (
                  <option key={d} value={d}>{Number(d)}</option>
                ))}
              </Select>
            </Field>
          ) : null}

          {precision !== 'year' ? (
            <Field label="Month" className="flex-1">
              <Select value={month} onChange={(e) => setMonth(e.target.value)}>
                {MONTH_OPTIONS.map((label, i) => {
                  const value = String(i + 1).padStart(2, '0');
                  return <option key={value} value={value}>{label}</option>;
                })}
              </Select>
            </Field>
          ) : null}

          <Field label="Year" className="w-28">
            <Input
              value={year}
              onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              placeholder="2025"
            />
          </Field>
        </div>

        {!dateValid ? (
          <p className="text-[12px] text-danger">That date is not valid — check the year.</p>
        ) : null}
      </div>
    </Modal>
  );
}
