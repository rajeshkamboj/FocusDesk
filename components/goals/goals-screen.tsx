'use client';

import { useMemo, useState } from 'react';
import { useData } from '@/components/data/data-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm';
import { EmptyState, ProgressBar } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menu';
import { Modal } from '@/components/ui/modal';
import { IconChevronDown, IconGoals, IconMore, IconPencil, IconPlus, IconTrash } from '@/components/ui/icons';
import { PageHeader } from '@/components/layout/page-header';
import { TaskList } from '@/components/tasks/task-list';
import { TaskFormModal } from '@/components/tasks/task-form-modal';
import { formatShortDate } from '@/lib/dates';
import { compareDatedEntities, goalProgress } from '@/lib/selectors';
import type { EntityDateSort } from '@/lib/selectors';
import type { Goal, GoalStatus } from '@/lib/types';

const STATUS_LABEL: Record<GoalStatus, string> = {
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
};

export function GoalsScreen() {
  const { data, actions } = useData();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | undefined>(undefined);
  const [deleting, setDeleting] = useState<Goal | undefined>(undefined);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addTaskFor, setAddTaskFor] = useState<string | null>(null);
  const [sort, setSort] = useState<EntityDateSort>('deadline-asc');

  const goals = useMemo(
    () => [...data.goals].sort((a, b) => compareDatedEntities(a, b, sort)),
    [data.goals, sort],
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-5 pb-10 pt-8 sm:px-8 sm:pb-16 sm:pt-10">
      <PageHeader
        title="Goals"
        subtitle="Broader outcomes you are moving toward. A goal can own projects — or stand on its own."
        actions={
          <Button variant="primary" onClick={() => { setEditing(undefined); setFormOpen(true); }}>
            <IconPlus width={16} height={16} />
            New Goal
          </Button>
        }
      />

      <div className="mb-5 flex justify-end">
        <div className="min-w-0 sm:w-56">
          <Select value={sort} onChange={(e) => setSort(e.target.value as EntityDateSort)} aria-label="Sort goals">
            <option value="deadline-asc">Sort by · Deadline — Soonest first</option>
            <option value="deadline-desc">Sort by · Deadline — Latest first</option>
            <option value="created-desc">Sort by · Created — Newest first</option>
            <option value="created-asc">Sort by · Created — Oldest first</option>
          </Select>
        </div>
      </div>

      {goals.length === 0 ? (
        <EmptyState
          icon={<IconGoals width={24} height={24} />}
          title="No goals yet"
          hint="Goals capture the bigger outcomes behind your work. Create one whenever you are ready — nothing here is mandatory."
          action={
            <Button variant="primary" size="sm" onClick={() => { setEditing(undefined); setFormOpen(true); }}>
              <IconPlus width={15} height={15} />
              New Goal
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {goals.map((goal) => {
            const prog = goalProgress(data.tasks, data.projects, goal.id);
            const linkedProjects = data.projects.filter((p) => p.goalId === goal.id);
            const directTasks = data.tasks.filter(
              (t) => t.goalId === goal.id && t.status !== 'cancelled' && !linkedProjects.some((p) => p.id === t.projectId),
            );
            const isExpanded = expanded === goal.id;

            return (
              <div key={goal.id} className="rounded-2xl border border-line bg-surface shadow-card">
                <div className="flex items-start gap-3 p-5">
                  <button
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line text-ink-3 transition-colors hover:border-line-strong hover:text-ink"
                    onClick={() => setExpanded(isExpanded ? null : goal.id)}
                    aria-label={isExpanded ? 'Collapse goal' : 'Expand goal'}
                  >
                    <IconChevronDown width={16} height={16} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[15px] font-semibold text-ink">{goal.name}</h3>
                      <Badge tone={goal.status === 'active' ? 'accent' : goal.status === 'completed' ? 'neutral' : 'muted'}>
                        {STATUS_LABEL[goal.status]}
                      </Badge>
                    </div>
                    {goal.description ? (
                      <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-2">{goal.description}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <ProgressBar done={prog.done} total={prog.total} className="max-w-56" />
                      <span className="text-[11px] tabular-nums text-ink-3">
                        {prog.done}/{prog.total} tasks done
                      </span>
                      {goal.deadline ? (
                        <span className="text-[11px] text-ink-3">Deadline {formatShortDate(goal.deadline)}</span>
                      ) : null}
                      {linkedProjects.length > 0 ? (
                        <span className="text-[11px] text-ink-3">
                          {linkedProjects.length} project{linkedProjects.length === 1 ? '' : 's'}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <Menu
                    trigger={({ toggle }) => (
                      <button onClick={toggle} aria-label="Goal actions" className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink">
                        <IconMore width={17} height={17} />
                      </button>
                    )}
                  >
                    {(close) => (
                      <>
                        <MenuItem onClick={() => { setEditing(goal); setFormOpen(true); close(); }}>
                          <IconPencil width={14} height={14} /> Edit…
                        </MenuItem>
                        {goal.status !== 'completed' ? (
                          <MenuItem onClick={() => { void actions.updateGoal(goal.id, { status: 'completed' }); close(); }}>
                            Mark completed
                          </MenuItem>
                        ) : (
                          <MenuItem onClick={() => { void actions.updateGoal(goal.id, { status: 'active' }); close(); }}>
                            Reopen goal
                          </MenuItem>
                        )}
                        {goal.status !== 'archived' ? (
                          <MenuItem onClick={() => { void actions.updateGoal(goal.id, { status: 'archived' }); close(); }}>
                            Archive
                          </MenuItem>
                        ) : null}
                        <MenuSeparator />
                        <MenuItem danger onClick={() => { setDeleting(goal); close(); }}>
                          <IconTrash width={14} height={14} /> Delete goal
                        </MenuItem>
                      </>
                    )}
                  </Menu>
                </div>

                {isExpanded ? (
                  <div className="space-y-4 border-t border-line px-5 py-4">
                    <Button variant="ghost" size="sm" onClick={() => setAddTaskFor(goal.id)}>
                      <IconPlus width={14} height={14} /> Add task to goal
                    </Button>
                    {linkedProjects.length > 0 ? (
                      <div>
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">Projects</p>
                        <div className="flex flex-wrap gap-2">
                          {linkedProjects.map((p) => (
                            <span key={p.id} className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[12.5px] font-medium text-ink">
                              {p.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">Tasks linked to this goal</p>
                      {directTasks.length > 0 ? (
                        <TaskList tasks={directTasks} />
                      ) : (
                        <p className="text-[13px] text-ink-3">No tasks linked directly to this goal.</p>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <GoalFormModal open={formOpen} onClose={() => setFormOpen(false)} goal={editing} />
      <TaskFormModal
        open={addTaskFor !== null}
        onClose={() => setAddTaskFor(null)}
        defaults={addTaskFor ? { goalId: addTaskFor } : undefined}
      />
      <ConfirmDialog
        open={deleting !== undefined}
        title="Delete goal?"
        message={`“${deleting?.name ?? ''}” will be removed. Its projects and tasks are kept — they simply lose the goal link.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleting(undefined)}
        onConfirm={() => {
          if (deleting) void actions.deleteGoal(deleting.id);
          setDeleting(undefined);
        }}
      />
    </div>
  );
}

export function GoalFormModal({
  open,
  onClose,
  goal,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  goal?: Goal;
  defaults?: { name?: string; description?: string };
}) {
  const { actions } = useData();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [status, setStatus] = useState<GoalStatus>('active');
  const [saving, setSaving] = useState(false);
  const [syncedId, setSyncedId] = useState<string | null>(null);

  if (open && syncedId !== (goal?.id ?? 'new')) {
    setSyncedId(goal?.id ?? 'new');
    setName(goal?.name ?? defaults?.name ?? '');
    setDescription(goal?.description ?? defaults?.description ?? '');
    setDeadline(goal?.deadline ?? '');
    setStatus(goal?.status ?? 'active');
    setSaving(false);
  }

  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      deadline: deadline || undefined,
      status,
    };
    if (goal) await actions.updateGoal(goal.id, payload);
    else await actions.addGoal(payload);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={goal ? 'Edit goal' : 'New goal'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={!name.trim() || saving}>
            {goal ? 'Save changes' : 'Create goal'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Goal">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="What do you want to achieve?" autoFocus />
        </Field>
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Why does this matter?" className="min-h-16" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as GoalStatus)}>
              {(['active', 'completed', 'archived'] as GoalStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Deadline" hint="Optional">
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
