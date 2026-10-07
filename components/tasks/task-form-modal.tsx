'use client';

import { useState } from 'react';
import { useData } from '@/components/data/data-provider';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import type { ISODate, Task, TaskInput, TaskPriority } from '@/lib/types';
import { formatDuration, todayISO } from '@/lib/dates';
import { projectMilestonesFor } from '@/lib/project-milestones';

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'high', label: 'Important' },
  { value: 'medium', label: 'Normal' },
  { value: 'low', label: 'Optional' },
];

function toLocalInputValue(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Create/edit task form. A task only needs a title — every other field is
 * optional and can be added later.
 */
export function TaskFormModal({
  open,
  onClose,
  task,
  defaults,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Existing task to edit (omit to create). */
  task?: Task;
  /** Prefill for new tasks (e.g. scheduled date). */
  defaults?: Partial<TaskInput>;
  onSaved?: () => void;
}) {
  const { data, actions, ready, notify, projectMilestonesEnabled } = useData();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [projectMilestoneId, setProjectMilestoneId] = useState('');
  const [goalId, setGoalId] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [estimatedDuration, setEstimatedDuration] = useState('');
  const [reminder, setReminder] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);

  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
  }
  if (open && !wasOpen) {
    setTitle(task?.title ?? '');
    setDescription(task?.description ?? '');
    setProjectId(task?.projectId ?? defaults?.projectId ?? '');
    setProjectMilestoneId(task?.projectMilestoneId ?? defaults?.projectMilestoneId ?? '');
    setGoalId(task?.goalId ?? defaults?.goalId ?? '');
    setScheduledDate(task?.scheduledDate ?? defaults?.scheduledDate ?? '');
    setDueDate(task?.dueDate ?? defaults?.dueDate ?? '');
    setPriority(task?.priority ?? defaults?.priority ?? 'medium');
    setEstimatedDuration(
      String(task?.estimatedDuration ?? defaults?.estimatedDuration ?? (task ? '' : ready ? data.settings.general.defaultTaskDuration : '')),
    );
    setReminder(toLocalInputValue(task?.reminder ?? defaults?.reminder));
    setNotes(task?.notes ?? '');
    setTags((task?.tags ?? defaults?.tags ?? []).join(', '));
    setSaving(false);
  }

  // Only the selected project's milestones are offered, so the form can never
  // build an invalid project/milestone pair. A stored milestone that is no
  // longer among them reads (and saves) as "No milestone".
  const milestoneOptions = projectMilestonesFor(data.projectMilestones, projectId || undefined);
  const selectedMilestoneId = milestoneOptions.some((m) => m.id === projectMilestoneId) ? projectMilestoneId : '';

  const submit = async () => {
    const clean = title.trim();
    if (!clean || saving) return;
    setSaving(true);
    const payload: TaskInput & Partial<Task> = {
      title: clean,
      description: description.trim() || undefined,
      projectId: projectId || undefined,
      // Sent only when the feature is available, so an unavailable backend
      // never has an existing assignment cleared by an ordinary edit.
      ...(projectMilestonesEnabled ? { projectMilestoneId: (projectId && selectedMilestoneId) || undefined } : {}),
      goalId: goalId || undefined,
      scheduledDate: (scheduledDate as ISODate) || undefined,
      dueDate: (dueDate as ISODate) || undefined,
      priority,
      estimatedDuration: estimatedDuration ? Number(estimatedDuration) : undefined,
      reminder: reminder ? new Date(reminder).toISOString() : undefined,
      notes: notes.trim() || undefined,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };
    try {
      if (task) {
        await actions.updateTask(task.id, payload);
      } else {
        const isToday = payload.scheduledDate !== undefined && payload.scheduledDate === todayISO();
        await actions.addTask({ ...payload, status: payload.scheduledDate ? (isToday ? 'today' : 'planned') : 'created' });
      }
    } catch (error) {
      setSaving(false);
      notify(error instanceof Error ? error.message : 'Could not save the task');
      return;
    }
    onSaved?.();
    onClose();
  };

  const activeProjects = data.projects.filter((p) => p.status !== 'archived');
  const activeGoals = data.goals.filter((g) => g.status !== 'archived');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={task ? 'Edit task' : 'New task'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={!title.trim() || saving}>
            {task ? 'Save changes' : 'Add task'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to be done?"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
          />
        </Field>

        <Field label="Description">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional details…"
            className="min-h-16"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Project">
            <Select
              value={projectId}
              onChange={(e) => {
                // A milestone belongs to exactly one project, so a different
                // project always starts again from "No milestone".
                if (e.target.value !== projectId) setProjectMilestoneId('');
                setProjectId(e.target.value);
              }}
            >
              <option value="">No project</option>
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          {projectMilestonesEnabled ? (
            <Field
              label="Milestone"
              hint={!projectId ? 'Choose a project first' : milestoneOptions.length === 0 ? 'This project has no milestones' : undefined}
            >
              <Select
                aria-label="Milestone"
                value={selectedMilestoneId}
                onChange={(e) => setProjectMilestoneId(e.target.value)}
                disabled={!projectId}
              >
                <option value="">No milestone</option>
                {milestoneOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Goal">
            <Select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              <option value="">No goal</option>
              {activeGoals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Scheduled date" hint="When you plan to work on it">
            <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
          </Field>
          <Field label="Deadline" hint="Must be completed by">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="Priority">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Estimated duration" hint={estimatedDuration ? formatDuration(Number(estimatedDuration)) : 'Minutes'}>
            <Input
              type="number"
              min={0}
              step={5}
              value={estimatedDuration}
              onChange={(e) => setEstimatedDuration(e.target.value)}
              placeholder={String(data.settings.general.defaultTaskDuration)}
            />
          </Field>
          <Field label="Reminder">
            <Input type="datetime-local" value={reminder} onChange={(e) => setReminder(e.target.value)} />
          </Field>
          <Field label="Tags" hint="Comma separated">
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="focus, admin…" />
          </Field>
        </div>

        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything else…" className="min-h-16" />
        </Field>
      </div>
    </Modal>
  );
}
