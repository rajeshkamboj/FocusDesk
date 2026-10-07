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
import { IconChevronDown, IconMore, IconPencil, IconPlus, IconProjects, IconTrash } from '@/components/ui/icons';
import { PageHeader } from '@/components/layout/page-header';
import { TaskList } from '@/components/tasks/task-list';
import { TaskFormModal } from '@/components/tasks/task-form-modal';
import { formatFocusedTime, formatShortDate, todayISO } from '@/lib/dates';
import { projectMilestonesFor } from '@/lib/project-milestones';
import { compareDatedEntities, projectFocusedSeconds, projectProgress } from '@/lib/selectors';
import type { EntityDateSort } from '@/lib/selectors';
import type { Project, ProjectMilestone, ProjectStatus } from '@/lib/types';
import { ProjectMilestoneFormModal, ProjectMilestoneSections } from './project-milestones';

const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Active',
  on_hold: 'On Hold',
  completed: 'Completed',
  archived: 'Archived',
};

const STATUS_TONE: Record<ProjectStatus, 'accent' | 'warning' | 'neutral' | 'muted'> = {
  active: 'accent',
  on_hold: 'warning',
  completed: 'neutral',
  archived: 'muted',
};

type Filter = 'all' | ProjectStatus;

export function ProjectsScreen() {
  const { data, actions, notify, projectMilestonesEnabled } = useData();
  const [filter, setFilter] = useState<Filter>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Project | undefined>(undefined);
  const [deleting, setDeleting] = useState<Project | undefined>(undefined);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addTaskFor, setAddTaskFor] = useState<{ projectId: string; projectMilestoneId?: string } | null>(null);
  // Only `projectId` → new milestone in that project; with `milestone` → edit it.
  const [milestoneForm, setMilestoneForm] = useState<{ projectId: string; milestone?: ProjectMilestone } | null>(null);
  const [deletingMilestone, setDeletingMilestone] = useState<ProjectMilestone | undefined>(undefined);
  const [sort, setSort] = useState<EntityDateSort>('deadline-asc');

  const projects = useMemo(() => {
    const list = filter === 'all' ? data.projects : data.projects.filter((p) => p.status === filter);
    return [...list].sort((a, b) => compareDatedEntities(a, b, sort));
  }, [data.projects, filter, sort]);

  return (
    <div className="mx-auto w-full max-w-4xl px-5 pb-10 pt-8 sm:px-8 sm:pb-16 sm:pt-10">
      <PageHeader
        title="Projects"
        subtitle="Group related work toward an outcome. Projects are yours to define — nothing is predefined."
        actions={
          <Button variant="primary" onClick={() => { setEditing(undefined); setFormOpen(true); }}>
            <IconPlus width={16} height={16} />
            New Project
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        <div className="ml-auto min-w-0 sm:w-56">
          <Select value={sort} onChange={(e) => setSort(e.target.value as EntityDateSort)} aria-label="Sort projects">
            <option value="deadline-asc">Sort by · Deadline — Soonest first</option>
            <option value="deadline-desc">Sort by · Deadline — Latest first</option>
            <option value="created-desc">Sort by · Created — Newest first</option>
            <option value="created-asc">Sort by · Created — Oldest first</option>
          </Select>
        </div>
        {(['all', 'active', 'on_hold', 'completed', 'archived'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              filter === f ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-ink-2 hover:border-line-strong'
            }`}
          >
            {f === 'all' ? 'All' : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon={<IconProjects width={24} height={24} />}
          title="No projects yet"
          hint="Projects are optional. Create one when a goal deserves its own container — or keep working with plain tasks."
          action={
            <Button variant="primary" size="sm" onClick={() => { setEditing(undefined); setFormOpen(true); }}>
              <IconPlus width={15} height={15} />
              New Project
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {projects.map((project) => {
            const prog = projectProgress(data.tasks, project.id);
            const focused = projectFocusedSeconds(data.tasks, project.id);
            const goal = project.goalId ? data.goals.find((g) => g.id === project.goalId) : undefined;
            const tasks = data.tasks.filter((t) => t.projectId === project.id && t.status !== 'cancelled');
            const openTasks = tasks.filter((t) => t.status !== 'completed');
            const milestones = projectMilestonesEnabled ? projectMilestonesFor(data.projectMilestones, project.id) : [];
            const isExpanded = expanded === project.id;
            const deadlineSoon = project.deadline !== undefined && project.deadline >= todayISO();

            return (
              <div key={project.id} className="rounded-2xl border border-line bg-surface shadow-card">
                <div className="flex items-start gap-3 p-5">
                  <button
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line text-ink-3 transition-colors hover:border-line-strong hover:text-ink"
                    onClick={() => setExpanded(isExpanded ? null : project.id)}
                    aria-label={isExpanded ? 'Collapse project' : 'Expand project'}
                  >
                    <IconChevronDown
                      width={16}
                      height={16}
                      className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[15px] font-semibold text-ink">{project.name}</h3>
                      <Badge tone={STATUS_TONE[project.status]}>{STATUS_LABEL[project.status]}</Badge>
                      {goal ? <Badge tone="muted">→ {goal.name}</Badge> : null}
                    </div>
                    {project.description ? (
                      <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-2">{project.description}</p>
                    ) : null}
                    <div className="mt-3 flex items-center gap-3">
                      <ProgressBar done={prog.done} total={prog.total} className="max-w-56" />
                      <span className="text-[11px] tabular-nums text-ink-3">
                        {prog.done}/{prog.total} tasks done
                        {focused > 0 ? ` · ${formatFocusedTime(focused)} focused` : ''}
                      </span>
                      {project.deadline ? (
                        <span className={`text-[11px] ${deadlineSoon ? 'text-warning' : 'text-ink-3'}`}>
                          Deadline {formatShortDate(project.deadline)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <Menu
                    trigger={({ toggle }) => (
                      <button onClick={toggle} aria-label="Project actions" className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink">
                        <IconMore width={17} height={17} />
                      </button>
                    )}
                  >
                    {(close) => (
                      <>
                        <MenuItem onClick={() => { setEditing(project); setFormOpen(true); close(); }}>
                          <IconPencil width={14} height={14} /> Edit…
                        </MenuItem>
                        {project.status !== 'active' && project.status !== 'archived' ? (
                          <MenuItem onClick={() => { void actions.updateProject(project.id, { status: 'active' }); close(); }}>
                            Set active
                          </MenuItem>
                        ) : null}
                        {project.status === 'active' ? (
                          <MenuItem onClick={() => { void actions.updateProject(project.id, { status: 'on_hold' }); close(); }}>
                            Put on hold
                          </MenuItem>
                        ) : null}
                        {project.status !== 'completed' ? (
                          <MenuItem onClick={() => { void actions.updateProject(project.id, { status: 'completed' }); close(); }}>
                            Mark completed
                          </MenuItem>
                        ) : null}
                        {project.status !== 'archived' ? (
                          <MenuItem onClick={() => { void actions.updateProject(project.id, { status: 'archived' }); close(); }}>
                            Archive
                          </MenuItem>
                        ) : (
                          <MenuItem onClick={() => { void actions.updateProject(project.id, { status: 'active' }); close(); }}>
                            Unarchive
                          </MenuItem>
                        )}
                        <MenuSeparator />
                        <MenuItem danger onClick={() => { setDeleting(project); close(); }}>
                          <IconTrash width={14} height={14} /> Delete project
                        </MenuItem>
                      </>
                    )}
                  </Menu>
                </div>

                {isExpanded ? (
                  <div className="border-t border-line px-5 py-4">
                    <div className="mb-3 flex flex-wrap items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAddTaskFor({ projectId: project.id })}
                      >
                        <IconPlus width={14} height={14} /> Add task to project
                      </Button>
                      {projectMilestonesEnabled ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setMilestoneForm({ projectId: project.id })}
                        >
                          <IconPlus width={14} height={14} /> Add milestone
                        </Button>
                      ) : null}
                    </div>
                    {milestones.length > 0 ? (
                      <ProjectMilestoneSections
                        milestones={milestones}
                        tasks={tasks}
                        onAddTask={(m) => setAddTaskFor({ projectId: project.id, projectMilestoneId: m.id })}
                        onEdit={(m) => setMilestoneForm({ projectId: project.id, milestone: m })}
                        onDelete={(m) => setDeletingMilestone(m)}
                      />
                    ) : tasks.length > 0 ? (
                      <TaskList tasks={tasks} />
                    ) : (
                      <p className="text-[13px] text-ink-3">No tasks in this project yet.</p>
                    )}
                    <p className="mt-2 text-[11px] text-ink-3">
                      {openTasks.length} open · {tasks.length - openTasks.length} completed
                    </p>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <ProjectFormModal open={formOpen} onClose={() => setFormOpen(false)} project={editing} />
      <TaskFormModal
        open={addTaskFor !== null}
        onClose={() => setAddTaskFor(null)}
        defaults={addTaskFor ?? undefined}
      />
      {/* Keyed + conditionally mounted so each open starts clean. */}
      {milestoneForm ? (
        <ProjectMilestoneFormModal
          key={milestoneForm.milestone?.id ?? `new-${milestoneForm.projectId}`}
          open
          projectId={milestoneForm.projectId}
          milestone={milestoneForm.milestone}
          onClose={() => setMilestoneForm(null)}
        />
      ) : null}
      <ConfirmDialog
        open={deletingMilestone !== undefined}
        title="Delete milestone?"
        message={`“${deletingMilestone?.name ?? ''}” will be removed. Its tasks are kept — they stay in the project without a milestone.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeletingMilestone(undefined)}
        onConfirm={() => {
          if (deletingMilestone) {
            void actions.deleteProjectMilestone(deletingMilestone.id).catch((error: unknown) => {
              console.error('Milestone deletion failed', error);
              notify('Could not delete the milestone — please try again');
            });
          }
          setDeletingMilestone(undefined);
        }}
      />
      <ConfirmDialog
        open={deleting !== undefined}
        title="Delete project?"
        message={
          deleting && data.projectMilestones.some((m) => m.projectId === deleting.id)
            ? `“${deleting.name}” and its milestones will be removed. Its tasks are kept — they simply lose the project link.`
            : `“${deleting?.name ?? ''}” will be removed. Its tasks are kept — they simply lose the project link.`
        }
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleting(undefined)}
        onConfirm={() => {
          if (deleting) void actions.deleteProject(deleting.id);
          setDeleting(undefined);
        }}
      />
    </div>
  );
}

export function ProjectFormModal({
  open,
  onClose,
  project,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  project?: Project;
  defaults?: { name?: string; description?: string };
}) {
  const { data, actions } = useData();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [goalId, setGoalId] = useState('');
  const [deadline, setDeadline] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('active');
  const [saving, setSaving] = useState(false);

  // Sync form with the entity being edited.
  const [syncedId, setSyncedId] = useState<string | null>(null);
  if (open && syncedId !== (project?.id ?? 'new')) {
    setSyncedId(project?.id ?? 'new');
    setName(project?.name ?? defaults?.name ?? '');
    setDescription(project?.description ?? defaults?.description ?? '');
    setGoalId(project?.goalId ?? '');
    setDeadline(project?.deadline ?? '');
    setStatus(project?.status ?? 'active');
    setSaving(false);
  }

  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      goalId: goalId || undefined,
      deadline: deadline || undefined,
      status,
    };
    if (project) await actions.updateProject(project.id, payload);
    else await actions.addProject(payload);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? 'Edit project' : 'New project'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={!name.trim() || saving}>
            {project ? 'Save changes' : 'Create project'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Project name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name your project" autoFocus />
        </Field>
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this project about?" className="min-h-16" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
              {(['active', 'on_hold', 'completed', 'archived'] as ProjectStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Deadline" hint="Optional">
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
          <Field label="Goal" hint="Optional">
            <Select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              <option value="">No goal</option>
              {data.goals.filter((g) => g.status !== 'archived').map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}
