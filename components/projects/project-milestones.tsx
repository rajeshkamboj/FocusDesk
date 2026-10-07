'use client';

import { useState } from 'react';
import { useData } from '@/components/data/data-provider';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menu';
import { Modal } from '@/components/ui/modal';
import { IconMore, IconPencil, IconPlus, IconTrash } from '@/components/ui/icons';
import { TaskList } from '@/components/tasks/task-list';
import { formatShortDate } from '@/lib/dates';
import { moveProjectMilestone } from '@/lib/project-milestones';
import type { ProjectMilestone, Task } from '@/lib/types';

/**
 * A project's tasks grouped under its milestones, in manual order, followed
 * by the tasks that sit directly under the project ("No milestone").
 *
 * Deliberately plain: a name, an optional target date and description, the
 * task list. No status, no completion figures, no scheduling — milestones
 * are structure, not another thing to track.
 */
export function ProjectMilestoneSections({
  milestones,
  tasks,
  onAddTask,
  onEdit,
  onDelete,
}: {
  /** This project's milestones, already in manual order. */
  milestones: ProjectMilestone[];
  /** This project's (non-cancelled) tasks. */
  tasks: Task[];
  onAddTask: (milestone: ProjectMilestone) => void;
  onEdit: (milestone: ProjectMilestone) => void;
  onDelete: (milestone: ProjectMilestone) => void;
}) {
  const { actions, notify } = useData();
  const known = new Set(milestones.map((m) => m.id));
  // A task whose milestone is gone is still shown — under "No milestone".
  const direct = tasks.filter((t) => !t.projectMilestoneId || !known.has(t.projectMilestoneId));

  const move = (milestone: ProjectMilestone, direction: -1 | 1) => {
    void actions
      .reorderProjectMilestones(milestone.projectId, moveProjectMilestone(milestones, milestone.id, direction))
      .catch((error: unknown) => {
        console.error('Milestone reorder failed', error);
        notify('Could not move the milestone — please try again');
      });
  };

  return (
    <div className="space-y-4">
      {milestones.map((milestone, index) => {
        const items = tasks.filter((t) => t.projectMilestoneId === milestone.id);
        return (
          <section key={milestone.id} aria-label={`Milestone: ${milestone.name}`}>
            <div className="mb-1.5 flex items-start gap-2 px-1">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <h4 className="break-words text-[13px] font-semibold text-ink">{milestone.name}</h4>
                  <span className="text-[11px] tabular-nums text-ink-3">
                    {items.length} {items.length === 1 ? 'task' : 'tasks'}
                  </span>
                  {milestone.targetDate ? (
                    <span className="text-[11px] text-ink-3">Target {formatShortDate(milestone.targetDate)}</span>
                  ) : null}
                </div>
                {milestone.description ? (
                  <p className="mt-0.5 whitespace-pre-line break-words text-[12px] leading-relaxed text-ink-3">{milestone.description}</p>
                ) : null}
              </div>
              <Menu
                trigger={({ toggle }) => (
                  <button
                    onClick={toggle}
                    aria-label={`Milestone actions: ${milestone.name}`}
                    className="rounded-lg p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
                  >
                    <IconMore width={16} height={16} />
                  </button>
                )}
              >
                {(close) => (
                  <>
                    <MenuItem onClick={() => { onAddTask(milestone); close(); }}>
                      <IconPlus width={14} height={14} /> Add task to milestone
                    </MenuItem>
                    <MenuItem onClick={() => { onEdit(milestone); close(); }}>
                      <IconPencil width={14} height={14} /> Edit…
                    </MenuItem>
                    {index > 0 ? (
                      <MenuItem onClick={() => { move(milestone, -1); close(); }}>Move up</MenuItem>
                    ) : null}
                    {index < milestones.length - 1 ? (
                      <MenuItem onClick={() => { move(milestone, 1); close(); }}>Move down</MenuItem>
                    ) : null}
                    <MenuSeparator />
                    <MenuItem danger onClick={() => { onDelete(milestone); close(); }}>
                      <IconTrash width={14} height={14} /> Delete milestone
                    </MenuItem>
                  </>
                )}
              </Menu>
            </div>
            {items.length > 0 ? (
              <TaskList tasks={items} />
            ) : (
              <p className="px-3 py-1 text-[12.5px] text-ink-3">No tasks in this milestone yet.</p>
            )}
          </section>
        );
      })}

      {direct.length > 0 ? (
        <section aria-label="Tasks without a milestone">
          <h4 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">No milestone</h4>
          <TaskList tasks={direct} />
        </section>
      ) : null}
    </div>
  );
}

/** Create (with `projectId`) or edit (with `milestone`) a project milestone. */
export function ProjectMilestoneFormModal({
  open,
  onClose,
  projectId,
  milestone,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  milestone?: ProjectMilestone;
}) {
  const { actions, notify } = useData();
  const [name, setName] = useState(milestone?.name ?? '');
  const [description, setDescription] = useState(milestone?.description ?? '');
  const [targetDate, setTargetDate] = useState(milestone?.targetDate ?? '');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    const fields = {
      name: name.trim(),
      description: description.trim() || undefined,
      targetDate: targetDate || undefined,
    };
    try {
      if (milestone) await actions.updateProjectMilestone(milestone.id, fields);
      else await actions.addProjectMilestone({ projectId, ...fields });
    } catch (error) {
      setSaving(false);
      notify(error instanceof Error ? error.message : 'Could not save the milestone');
      return;
    }
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
          <Button variant="primary" onClick={() => void submit()} disabled={!name.trim() || saving}>
            {milestone ? 'Save changes' : 'Add milestone'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Milestone name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Public beta"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submit();
              }
            }}
          />
        </Field>
        <Field label="Description" hint="Optional">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does reaching it mean?"
            className="min-h-16"
          />
        </Field>
        <Field label="Target date" hint="Optional">
          <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
