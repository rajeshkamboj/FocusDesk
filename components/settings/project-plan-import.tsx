'use client';

/**
 * Import Project Plan — the ChatGPT JSON importer (Settings → Data).
 *
 * Two modes (Phase 5):
 *
 *  1. Create New Project — the Phase 4 flow, unchanged:
 *       1. paste or choose a `focusdesk-project-plan` JSON
 *       2. it is parsed and validated as you go (never written)
 *       3. the preview shows exactly what will be created:
 *            Goal → Project → Project Milestone → Task
 *       4. only when the user presses Import does anything reach the database
 *
 *  2. Add to Existing Project — the plan adds new milestones and tasks to ONE
 *     project that already exists:
 *       1. choose the target project
 *       2. paste or choose the same JSON
 *       3. the preview is a diff: which imported milestones match an existing
 *          milestone of the target (reused, never modified), which will be
 *          created after the existing ones, and that every task is new —
 *          including the plan's top-level tasks, which become project-level
 *          tasks of the target
 *       4. the user can flip any milestone between "Use existing" and
 *          "Create new" before importing
 *
 * Everything here is additive. The importer cannot update or delete a record —
 * the format has no way to name one, its temporary ids are replaced by freshly
 * generated ones, and the write goes through the same authenticated
 * DataProvider/repository path as every other change in the app.
 *
 * Parsing, validation, the preview and the temporary-id mapping are pure and
 * live in lib/project-plan.ts, so this file is only the conversation with the
 * user.
 */

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useData } from '@/components/data/data-provider';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm';
import { Field, Select, Textarea } from '@/components/ui/form';
import { Modal } from '@/components/ui/modal';
import { Tabs } from '@/components/ui/tabs';
import { IconCheck, IconUpload } from '@/components/ui/icons';
import {
  PROJECT_PLAN_GOAL_STATUSES,
  PROJECT_PLAN_PROJECT_STATUSES,
  PROJECT_PLAN_TASK_PRIORITIES,
  PROJECT_PLAN_TASK_STATUSES,
  existingProjectImportPreview,
  findProjectPlanNameClashes,
  resolveExistingProjectImport,
  reviewProjectPlanText,
  type ExistingProjectImportPreview,
  type ExistingProjectPlanImportResult,
  type PreviewProject,
  type PreviewTask,
  type ProjectMilestoneMappingChoice,
  type ProjectPlanImportMode,
  type ProjectPlanImportResult,
  type ProjectPlanIssue,
  type ProjectPlanPreview,
  type ResolvedExistingProjectImport,
} from '@/lib/project-plan';

/** Rows the hierarchy renders before it says "and N more". */
const MAX_TREE_ROWS = 300;

type ImportOutcome =
  | { mode: 'create-new-project'; created: ProjectPlanImportResult }
  | { mode: 'add-to-existing-project'; created: ExistingProjectPlanImportResult; resolved: ResolvedExistingProjectImport };

const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
  `${count} ${count === 1 ? singular : pluralForm}`;

export function ProjectPlanImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, actions, projectMilestonesEnabled } = useData();
  const [mode, setMode] = useState<ProjectPlanImportMode>('create-new-project');
  const [targetProjectId, setTargetProjectId] = useState('');
  const [text, setText] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportOutcome | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [askAboutNames, setAskAboutNames] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Mapping choices are stored together with the plan text and target project
  // they were made against: a new plan or a new target simply does not match,
  // and the defaults apply again — no effect, no cascading render.
  const [choiceState, setChoiceState] = useState<{
    text: string;
    targetProjectId: string;
    choices: Record<string, ProjectMilestoneMappingChoice>;
  }>({ text: '', targetProjectId: '', choices: {} });
  const choices = useMemo(
    () => (choiceState.text === text && choiceState.targetProjectId === targetProjectId ? choiceState.choices : {}),
    [choiceState, text, targetProjectId],
  );

  // Validated on every change, so the preview and the problems appear as the
  // plan is pasted. Nothing is written here — that only happens in `run()`.
  const review = useMemo(
    () => reviewProjectPlanText(text, { projectMilestonesAvailable: projectMilestonesEnabled, mode }),
    [text, projectMilestonesEnabled, mode],
  );

  const targetProject = useMemo(() => data.projects.find((p) => p.id === targetProjectId), [data.projects, targetProjectId]);

  // The resolved import is what the repository will write — the preview is
  // built from the same object, so the two cannot disagree.
  const resolved = useMemo<ResolvedExistingProjectImport | null>(() => {
    if (mode !== 'add-to-existing-project' || !review.ok || !review.plan || !targetProject) return null;
    try {
      return resolveExistingProjectImport(review, targetProject, data.projectMilestones, data.tasks, choices);
    } catch {
      return null;
    }
  }, [mode, review, targetProject, data.projectMilestones, data.tasks, choices]);

  const existingPreview = useMemo(() => (resolved ? existingProjectImportPreview(resolved) : null), [resolved]);

  const clashes = useMemo(
    () =>
      mode === 'create-new-project' && review.ok && review.plan ? findProjectPlanNameClashes(review.plan, data.projects) : [],
    [mode, review, data.projects],
  );

  const total = review.counts.goals + review.counts.projects + review.counts.projectMilestones + review.counts.tasks;
  const addsSomething = resolved !== null && resolved.counts.newMilestones + resolved.counts.newTasks > 0;
  const canImport =
    review.ok && !importing && (mode === 'create-new-project' ? total > 0 : targetProject !== undefined && addsSomething);

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setResult(null);
      setFailure(null);
      setText(String(reader.result ?? ''));
    };
    reader.onerror = () => setFailure('That file could not be read.');
    reader.readAsText(file);
  };

  const run = async () => {
    if (importing) return;
    if (mode === 'create-new-project') {
      if (!review.ok || !review.plan) return;
      setImporting(true);
      setFailure(null);
      try {
        setResult({ mode, created: await actions.importProjectPlan(review.plan) });
        setText('');
      } catch (error) {
        // A failed import kept nothing — say so, with the reason.
        setFailure(error instanceof Error ? error.message : 'The import failed.');
      } finally {
        setImporting(false);
      }
      return;
    }
    if (!resolved) return;
    setImporting(true);
    setFailure(null);
    try {
      setResult({ mode, created: await actions.importProjectPlanIntoExistingProject(resolved), resolved });
      setText('');
    } catch (error) {
      // A failed import kept nothing — say so, with the reason.
      setFailure(error instanceof Error ? error.message : 'The import failed.');
    } finally {
      setImporting(false);
    }
  };

  const onImport = () => {
    // Duplicate project names are reported, never merged: the user decides.
    // (Only the create-new-project mode creates projects.)
    if (mode === 'create-new-project' && clashes.length > 0) setAskAboutNames(true);
    else void run();
  };

  const onChoice = (tempId: string, choice: ProjectMilestoneMappingChoice) => {
    setChoiceState({ text, targetProjectId, choices: { ...choices, [tempId]: choice } });
  };

  const switchMode = (next: string) => {
    if (next === mode) return;
    setMode(next as ProjectPlanImportMode);
    setResult(null);
    setFailure(null);
  };

  const reset = () => {
    setResult(null);
    setFailure(null);
    setText('');
  };

  const importLabel =
    mode === 'create-new-project' ? (importing ? 'Importing…' : 'Import plan') : importing ? 'Adding…' : 'Add to project';

  return (
    <>
      <Modal
        open={open}
        onClose={importing ? () => {} : onClose}
        title="Import project plan"
        size="lg"
        footer={
          result ? (
            <>
              <Button variant="ghost" onClick={reset}>
                Import another plan
              </Button>
              <Button variant="primary" onClick={onClose}>
                Done
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose} disabled={importing}>
                Cancel
              </Button>
              <Button variant="primary" onClick={onImport} disabled={!canImport}>
                {importLabel}
              </Button>
            </>
          )
        }
      >
        {result ? (
          result.mode === 'create-new-project' ? (
            <ImportResult result={result.created} onClose={onClose} />
          ) : (
            <ExistingImportResult
              result={result.created}
              resolved={result.resolved}
              onClose={onClose}
            />
          )
        ) : (
          <div className="space-y-4">
            <p className="text-[13px] leading-relaxed text-ink-2">
              {mode === 'create-new-project' ? (
                <>
                  Paste a plan in the <code className="text-ink">focusdesk-project-plan</code> JSON format — the one
                  ChatGPT can write for you. Nothing is saved until you have seen the preview and pressed Import, and
                  nothing that already exists is changed: a plan only ever <em>adds</em> a goal, projects, project
                  milestones and tasks.
                </>
              ) : (
                <>
                  Paste a plan in the <code className="text-ink">focusdesk-project-plan</code> JSON format and choose
                  the project to add it to. Only <em>new</em> milestones and tasks are created inside that project —
                  the project, its goal, its existing milestones and its existing tasks stay exactly as they are.
                </>
              )}
            </p>

            <Tabs
              items={[
                { id: 'create-new-project', label: 'Create New Project' },
                { id: 'add-to-existing-project', label: 'Add to Existing Project' },
              ]}
              active={mode}
              onChange={switchMode}
            />

            {mode === 'add-to-existing-project' ? (
              <Field
                label="Add to project"
                hint={
                  data.projects.length === 0
                    ? 'You have no projects yet — create one first, or switch to Create New Project.'
                    : 'Nothing is added until you choose a project.'
                }
              >
                <Select
                  aria-label="Target project"
                  value={targetProjectId}
                  onChange={(e) => setTargetProjectId(e.target.value)}
                  disabled={importing}
                >
                  <option value="">Choose a project…</option>
                  {data.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.status === 'archived' ? ' (archived)' : ''}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={importing}>
                <IconUpload width={14} height={14} />
                Choose a JSON file
              </Button>
              {text ? (
                <Button size="sm" variant="ghost" onClick={reset} disabled={importing}>
                  Clear
                </Button>
              ) : null}
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) readFile(file);
                  e.target.value = '';
                }}
              />
            </div>

            <Textarea
              value={text}
              onChange={(e) => {
                setResult(null);
                setFailure(null);
                setText(e.target.value);
              }}
              placeholder={'{\\n  "format": "focusdesk-project-plan",\\n  "version": 1,\\n  "projects": [ … ]\\n}'}
              className="min-h-44 font-mono text-[12px]"
              disabled={importing}
              aria-label="Project plan JSON"
            />

            {!projectMilestonesEnabled ? (
              <p className="text-[11.5px] leading-relaxed text-ink-3">
                Project milestones are not available on this database yet, so a plan that contains them is refused
                rather than imported without them. Plans of projects and tasks still work.
              </p>
            ) : null}

            {failure ? (
              <div className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3">
                <p className="text-[12.5px] font-medium text-danger">{failure}</p>
              </div>
            ) : null}

            {text.trim() ? (
              review.ok ? (
                mode === 'create-new-project' && review.preview ? (
                  <PlanPreview preview={review.preview} issues={review.warnings} clashes={clashes} />
                ) : existingPreview ? (
                  <ExistingProjectPreview preview={existingPreview} issues={review.warnings} onChoice={onChoice} />
                ) : (
                  <p className="text-[12px] leading-relaxed text-ink-3">
                    Choose a project above to see what the plan would add to it.
                  </p>
                )
              ) : (
                <IssueList tone="danger" title="This plan cannot be imported" issues={review.errors} />
              )
            ) : null}
          </div>
        )}
      </Modal>

      {askAboutNames ? (
        <ConfirmDialog
          open
          title="A project with this name already exists"
          message={
            clashes.length === 1
              ? `“${clashes[0].name}” already exists. FocusDesk does not merge projects: the plan will be imported as new, creating a second project with that name. The existing one is left exactly as it is.`
              : `${clashes.length} projects in this plan share a name with existing ones (${clashes
                  .map((c) => c.name)
                  .join(', ')}). They will be created as new projects; the existing ones are left exactly as they are.`
          }
          confirmLabel="Create as new"
          onCancel={() => setAskAboutNames(false)}
          onConfirm={() => {
            setAskAboutNames(false);
            void run();
          }}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Preview — Create New Project (Phase 4, unchanged)                   */
/* ------------------------------------------------------------------ */

function PlanPreview({
  preview,
  issues,
  clashes,
}: {
  preview: ProjectPlanPreview;
  issues: ProjectPlanIssue[];
  clashes: { name: string; existingId: string }[];
}) {
  const { counts } = preview;
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-line bg-surface-2 px-4 py-3">
        <p className="text-[12.5px] text-ink-2">
          {preview.goal ? (
            <>
              <span className="text-ink-3">Goal</span>{' '}
              <span className="font-medium text-ink">{preview.goal.name}</span>
              {preview.goal.deadline ? <span className="text-ink-3"> · deadline {preview.goal.deadline}</span> : null}
            </>
          ) : (
            <span className="text-ink-3">No goal in this plan — the projects will be created without one.</span>
          )}
        </p>
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          <Count label={counts.projects === 1 ? 'Project' : 'Projects'} value={counts.projects} />
          <Count label={counts.projectMilestones === 1 ? 'Project Milestone' : 'Project Milestones'} value={counts.projectMilestones} />
          <Count label={counts.tasks === 1 ? 'Task' : 'Tasks'} value={counts.tasks} />
        </div>
      </div>

      {clashes.length > 0 ? (
        <div className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3">
          <p className="text-[12.5px] font-medium text-warning">
            {clashes.length === 1
              ? 'An existing project with this name already exists'
              : `${clashes.length} of these projects share a name with an existing one`}
          </p>
          <ul className="mt-1 space-y-0.5 text-[12px] text-ink-2">
            {clashes.map((clash) => (
              <li key={clash.existingId} className="min-w-0 break-words">
                · {clash.name}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-3">
            The plan is imported as new — nothing existing is merged, renamed or changed. You will be asked to
            confirm before anything is written.
          </p>
        </div>
      ) : null}

      <PlanTree preview={preview} />

      {issues.length > 0 ? <IssueList tone="warning" title="Worth knowing before you import" issues={issues} /> : null}
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2">
      <p className="text-[17px] font-semibold leading-none text-ink">{value}</p>
      <p className="mt-1 text-[11px] leading-tight text-ink-3">{label}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The hierarchy                                                       */
/* ------------------------------------------------------------------ */

type NodeKind = 'goal' | 'project' | 'milestone' | 'task' | 'section';

interface PreviewNode {
  kind: NodeKind;
  label: string;
  meta?: string;
  children: PreviewNode[];
}

interface TreeRow extends PreviewNode {
  key: string;
  depth: number;
  connector: string;
}

const taskMeta = (task: PreviewTask): string | undefined => {
  const parts: string[] = [];
  if (task.dueDate) parts.push(`due ${task.dueDate}`);
  else if (task.scheduledDate) parts.push(`scheduled ${task.scheduledDate}`);
  if (task.status !== 'created') parts.push(PROJECT_PLAN_TASK_STATUSES[task.status]);
  if (task.priority !== 'medium') parts.push(`${PROJECT_PLAN_TASK_PRIORITIES[task.priority]} priority`);
  return parts.length > 0 ? parts.join(' · ') : undefined;
};

const taskNode = (task: PreviewTask): PreviewNode => ({ kind: 'task', label: task.title, meta: taskMeta(task), children: [] });

const projectNode = (project: PreviewProject): PreviewNode => {
  const tasks = project.tasks.length + project.milestones.reduce((total, m) => total + m.tasks.length, 0);
  return {
    kind: 'project',
    label: project.name,
    meta: [
      project.deadline ? `deadline ${project.deadline}` : undefined,
      PROJECT_PLAN_PROJECT_STATUSES[project.status] !== 'Active' ? PROJECT_PLAN_PROJECT_STATUSES[project.status] : undefined,
      `${tasks} ${tasks === 1 ? 'task' : 'tasks'}`,
    ]
      .filter(Boolean)
      .join(' · '),
    children: [
      ...project.milestones.map((milestone) => ({
        kind: 'milestone' as const,
        label: milestone.name,
        meta: [
          milestone.targetDate ? `target ${milestone.targetDate}` : undefined,
          `${milestone.tasks.length} ${milestone.tasks.length === 1 ? 'task' : 'tasks'}`,
        ]
          .filter(Boolean)
          .join(' · '),
        children: milestone.tasks.map(taskNode),
      })),
      ...project.tasks.map(taskNode),
    ],
  };
};

function previewNodes(preview: ProjectPlanPreview): PreviewNode[] {
  const roots: PreviewNode[] = [];
  if (preview.goal) {
    roots.push({
      kind: 'goal',
      label: preview.goal.name,
      meta:
        preview.goal.deadline !== undefined
          ? `deadline ${preview.goal.deadline}`
          : PROJECT_PLAN_GOAL_STATUSES[preview.goal.status],
      children: preview.projects.map(projectNode),
    });
  } else {
    roots.push(...preview.projects.map(projectNode));
  }
  if (preview.tasks.length > 0) {
    roots.push({
      kind: 'section',
      label: 'Tasks without a project',
      meta: `${preview.tasks.length}`,
      children: preview.tasks.map(taskNode),
    });
  }
  return roots;
}

const countNodes = (nodes: PreviewNode[]): number =>
  nodes.reduce((total, node) => total + 1 + countNodes(node.children), 0);

/** Depth-first rows with the connector each one needs, capped for huge plans. */
function treeRows(nodes: PreviewNode[]): { rows: TreeRow[]; hidden: number } {
  const rows: TreeRow[] = [];
  const walk = (list: PreviewNode[], depth: number, prefix: string) => {
    list.forEach((node, index) => {
      if (rows.length >= MAX_TREE_ROWS) return;
      const last = index === list.length - 1;
      rows.push({
        ...node,
        key: `${prefix}${index}`,
        depth,
        connector: depth === 0 ? '' : last ? '└──' : '├──',
      });
      walk(node.children, depth + 1, `${prefix}${index}.`);
    });
  };
  walk(nodes, 0, '');
  return { rows, hidden: Math.max(0, countNodes(nodes) - rows.length) };
}

const KIND_STYLE: Record<NodeKind, string> = {
  goal: 'font-semibold text-ink',
  project: 'font-medium text-ink',
  milestone: 'font-medium text-ink-2',
  task: 'text-ink-2',
  section: 'font-medium text-ink-3',
};

function PlanTree({ preview }: { preview: ProjectPlanPreview }) {
  const { rows, hidden } = useMemo(() => treeRows(previewNodes(preview)), [preview]);
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-3">What will be created</p>
      <ul className="space-y-[3px]">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex min-w-0 items-baseline gap-1.5"
            style={{ paddingLeft: row.depth * 14 }}
          >
            {row.connector ? (
              <span aria-hidden className="shrink-0 font-mono text-[11px] leading-snug text-ink-3">
                {row.connector}
              </span>
            ) : null}
            <span className="min-w-0 text-[12.5px] leading-snug">
              <span className={`break-words ${KIND_STYLE[row.kind]}`}>{row.label}</span>
              {row.meta ? <span className="break-words text-ink-3"> · {row.meta}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      {hidden > 0 ? (
        <p className="mt-2 text-[11.5px] text-ink-3">
          …and {hidden} more {hidden === 1 ? 'record' : 'records'} — the counts above are the whole plan.
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Preview — Add to Existing Project (Phase 5): a diff                 */
/* ------------------------------------------------------------------ */

function ExistingProjectPreview({
  preview,
  issues,
  onChoice,
}: {
  preview: ExistingProjectImportPreview;
  issues: ProjectPlanIssue[];
  onChoice: (tempId: string, choice: ProjectMilestoneMappingChoice) => void;
}) {
  const { counts, existing } = preview;
  const addsNothing = counts.newMilestones + counts.newTasks === 0;
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-line bg-surface-2 px-4 py-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-3">Target project</p>
            <p className="mt-0.5 truncate text-[13px] font-medium text-ink">{preview.targetProject.name}</p>
            <p className="text-[11.5px] text-ink-3">
              {plural(existing.milestones, 'existing milestone')} · {plural(existing.tasks, 'existing task')}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-3">Source plan</p>
            <p className="mt-0.5 truncate text-[13px] font-medium text-ink">{preview.sourceProject.name}</p>
            <p className="text-[11.5px] text-ink-3">
              {preview.planName ? `${preview.planName} · ` : ''}
              {plural(counts.newMilestones + counts.reusedMilestones, 'milestone')} · {plural(counts.newTasks, 'task')}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface px-4 py-3">
        <p className="text-[12px] leading-relaxed text-ink-2">
          {preview.sourceGoal ? (
            <>
              <span className="font-medium text-ink">Goal:</span> the existing project goal will be preserved. The
              imported plan goal (<span className="font-medium text-ink">{preview.sourceGoal.name}</span>) will not be
              created or applied.
            </>
          ) : (
            <>This plan has no goal — nothing about goals changes.</>
          )}
        </p>
      </div>

      <div className="rounded-xl border border-line bg-surface px-4 py-3">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-3">Milestones</p>
        {preview.milestones.length === 0 ? (
          <p className="text-[12px] text-ink-3">This plan has no milestones — only tasks will be added.</p>
        ) : (
          <ul className="space-y-2.5">
            {preview.milestones.map(({ mapping, tasks }) => (
              <li key={mapping.tempId} className="min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium text-ink">
                      {mapping.decision === 'use-existing' ? '✓' : '+'} {mapping.name}
                    </p>
                    <p className="text-[11px] text-ink-3">
                      {mapping.targetDate ? `target ${mapping.targetDate} · ` : ''}
                      {plural(tasks.length, 'task')}
                    </p>
                  </div>
                  <Select
                    aria-label={`Mapping for milestone “${mapping.name}”`}
                    className="w-48 shrink-0"
                    value={mapping.decision === 'use-existing' ? (mapping.existingMilestoneId ?? '') : 'create-new'}
                    onChange={(e) => onChoice(mapping.tempId, e.target.value as ProjectMilestoneMappingChoice)}
                  >
                    <option value="create-new">Create new milestone</option>
                    {mapping.matches.map((m) => (
                      <option key={m.id} value={m.id}>
                        Use existing: {m.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink-3">
                  {mapping.decision === 'use-existing'
                    ? '→ Use existing milestone — it stays exactly as it is; only the new tasks join it.'
                    : '→ Create new milestone — appended after the project’s existing milestones.'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-line bg-surface px-4 py-3">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-3">Tasks</p>
        <div className="grid grid-cols-3 gap-2">
          <Count label="New tasks" value={counts.newTasks} />
          <Count label={counts.newMilestones === 1 ? 'New milestone' : 'New milestones'} value={counts.newMilestones} />
          <Count label={counts.reusedMilestones === 1 ? 'Milestone reused' : 'Milestones reused'} value={counts.reusedMilestones} />
        </div>
        <ul className="mt-2.5 space-y-0.5 text-[12px] text-ink-2">
          {counts.milestoneTasks > 0 ? <li>· {plural(counts.milestoneTasks, 'task')} under a milestone (existing or new)</li> : null}
          {counts.projectLevelTasks > 0 ? <li>· {plural(counts.projectLevelTasks, 'project-level task')} — no milestone</li> : null}
          {counts.rootTasks > 0 ? (
            <li>
              · {plural(counts.rootTasks, 'root task')} → project-level {counts.rootTasks === 1 ? 'task' : 'tasks'} of{' '}
              {preview.targetProject.name}
            </li>
          ) : null}
        </ul>
        <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">
          Every task is created new — even when an existing task has the same title. No existing task is modified.
        </p>
      </div>

      <div className="rounded-xl border border-line bg-surface px-4 py-3">
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-3">Existing data</p>
        <p className="text-[12px] leading-relaxed text-ink-2">
          {plural(existing.milestones, 'existing milestone')} unchanged · {plural(existing.tasks, 'existing task')}{' '}
          unchanged · the project and its goal unchanged.
        </p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">
          No existing task, milestone, project or goal will be modified.
        </p>
      </div>

      {preview.warnings.length > 0 ? (
        <div className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3">
          <p className="text-[12.5px] font-medium text-warning">Worth knowing before you add</p>
          <ul className="mt-1.5 space-y-1">
            {preview.warnings.map((warning, index) => (
              <li key={index} className="text-[12px] leading-relaxed text-ink-2">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {addsNothing ? (
        <div className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3">
          <p className="text-[12.5px] font-medium text-warning">This plan adds nothing</p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-2">
            Every milestone already exists and the plan has no tasks — there is nothing to add to{' '}
            {preview.targetProject.name}.
          </p>
        </div>
      ) : null}

      {issues.length > 0 ? <IssueList tone="warning" title="Worth knowing before you import" issues={issues} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Problems and warnings                                               */
/* ------------------------------------------------------------------ */

const MAX_ISSUES = 8;

function IssueList({ tone, title, issues }: { tone: 'danger' | 'warning'; title: string; issues: ProjectPlanIssue[] }) {
  if (issues.length === 0) return null;
  const shown = issues.slice(0, MAX_ISSUES);
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        tone === 'danger' ? 'border-danger/30 bg-danger-soft' : 'border-warning/30 bg-warning-soft'
      }`}
    >
      <p className={`text-[12.5px] font-medium ${tone === 'danger' ? 'text-danger' : 'text-warning'}`}>
        {title} ({issues.length})
      </p>
      <ul className="mt-1.5 space-y-1">
        {shown.map((issue, index) => (
          <li key={`${issue.path}-${index}`} className="min-w-0 text-[12px] leading-relaxed text-ink-2">
            <span className="break-words">{issue.message}</span>
            {issue.path !== 'plan' ? <span className="break-all text-[11px] text-ink-3"> ({issue.path})</span> : null}
          </li>
        ))}
      </ul>
      {issues.length > shown.length ? (
        <p className="mt-1.5 text-[11.5px] text-ink-3">…and {issues.length - shown.length} more.</p>
      ) : null}
      {tone === 'danger' ? (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-3">
          Fix these in the JSON — the whole plan is refused until they are gone, so nothing is half-imported.
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

function ImportResult({ result, onClose }: { result: ProjectPlanImportResult; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3">
        <span className="mt-0.5 shrink-0 text-accent-ink">
          <IconCheck width={16} height={16} />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-accent-ink">Import successful</p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-2">
            Everything below was created. Nothing that already existed — goals, projects, tasks, project milestones
            or learnings — was changed.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Count label={result.goals.length === 1 ? 'Goal created' : 'Goals created'} value={result.goals.length} />
        <Count label={result.projects.length === 1 ? 'Project created' : 'Projects created'} value={result.projects.length} />
        <Count
          label={result.projectMilestones.length === 1 ? 'Project Milestone' : 'Project Milestones'}
          value={result.projectMilestones.length}
        />
        <Count label={result.tasks.length === 1 ? 'Task created' : 'Tasks created'} value={result.tasks.length} />
      </div>

      {result.projects.length > 0 ? (
        <div className="rounded-xl border border-line bg-surface px-4 py-3">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-3">Imported projects</p>
          <ul className="space-y-1">
            {result.projects.map((project) => {
              const milestones = result.projectMilestones.filter((m) => m.projectId === project.id).length;
              const tasks = result.tasks.filter((t) => t.projectId === project.id).length;
              return (
                <li key={project.id} className="min-w-0 text-[12.5px] leading-snug text-ink-2">
                  <span className="break-words font-medium text-ink">{project.name}</span>
                  <span className="break-words text-ink-3">
                    {' '}
                    · {milestones} {milestones === 1 ? 'milestone' : 'milestones'} · {tasks} {tasks === 1 ? 'task' : 'tasks'}
                  </span>
                </li>
              );
            })}
          </ul>
          <Link
            href="/projects"
            onClick={onClose}
            className="mt-2.5 inline-flex text-[12.5px] font-medium text-accent-ink underline underline-offset-2"
          >
            Open Projects
          </Link>
        </div>
      ) : null}

      {result.tasks.some((t) => t.projectId === undefined) ? (
        <p className="text-[11.5px] leading-relaxed text-ink-3">
          {result.tasks.filter((t) => t.projectId === undefined).length} of the new tasks have no project — they are in
          Tasks on their own.
        </p>
      ) : null}
    </div>
  );
}

function ExistingImportResult({
  result,
  resolved,
  onClose,
}: {
  result: ExistingProjectPlanImportResult;
  resolved: ResolvedExistingProjectImport;
  onClose: () => void;
}) {
  const targetName = resolved.targetProject.name;
  const reusedIds = new Set(
    resolved.mappings.filter((m) => m.decision === 'use-existing').map((m) => m.existingMilestoneId),
  );
  const joinedExisting = result.tasks.filter((t) => t.projectMilestoneId !== undefined && reusedIds.has(t.projectMilestoneId));
  const projectLevel = result.tasks.filter((t) => t.projectMilestoneId === undefined);
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3">
        <span className="mt-0.5 shrink-0 text-accent-ink">
          <IconCheck width={16} height={16} />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-accent-ink">Added to {targetName}</p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-2">
            Everything below was created inside the project. Nothing that already existed — the project, its goal,
            its milestones or its tasks — was changed.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Count
          label={result.projectMilestones.length === 1 ? 'Milestone added' : 'Milestones added'}
          value={result.projectMilestones.length}
        />
        <Count label={result.tasks.length === 1 ? 'Task added' : 'Tasks added'} value={result.tasks.length} />
      </div>

      <div className="rounded-xl border border-line bg-surface px-4 py-3">
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-3">New in {targetName}</p>
        <ul className="space-y-1">
          {result.projectMilestones.map((milestone) => {
            const tasks = result.tasks.filter((t) => t.projectMilestoneId === milestone.id).length;
            return (
              <li key={milestone.id} className="min-w-0 text-[12.5px] leading-snug text-ink-2">
                <span className="break-words font-medium text-ink">+ {milestone.name}</span>
                <span className="break-words text-ink-3">
                  {' '}
                  · position {milestone.position} · {plural(tasks, 'new task')}
                </span>
              </li>
            );
          })}
          {projectLevel.map((task) => (
            <li key={task.id} className="min-w-0 text-[12.5px] leading-snug text-ink-2">
              <span className="break-words">+ {task.title}</span>
              <span className="break-words text-ink-3"> · project-level task, no milestone</span>
            </li>
          ))}
        </ul>
        {joinedExisting.length > 0 ? (
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">
            {plural(joinedExisting.length, 'task')} joined {plural(reusedIds.size, 'existing milestone')} — the{' '}
            {reusedIds.size === 1 ? 'milestone was' : 'milestones were'} not modified.
          </p>
        ) : null}
        <Link
          href="/projects"
          onClick={onClose}
          className="mt-2.5 inline-flex text-[12.5px] font-medium text-accent-ink underline underline-offset-2"
        >
          Open Projects
        </Link>
      </div>
    </div>
  );
}
