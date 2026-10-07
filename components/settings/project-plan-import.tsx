'use client';

/**
 * Import Project Plan — the ChatGPT JSON importer (Settings → Data).
 *
 *   1. paste or choose a `focusdesk-project-plan` JSON
 *   2. it is parsed and validated as you go (never written)
 *   3. the preview shows exactly what will be created:
 *        Goal → Project → Project Milestone → Task
 *   4. only when the user presses Import does anything reach the database
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
import { Textarea } from '@/components/ui/form';
import { Modal } from '@/components/ui/modal';
import { IconCheck, IconUpload } from '@/components/ui/icons';
import {
  PROJECT_PLAN_GOAL_STATUSES,
  PROJECT_PLAN_PROJECT_STATUSES,
  PROJECT_PLAN_TASK_PRIORITIES,
  PROJECT_PLAN_TASK_STATUSES,
  findProjectPlanNameClashes,
  reviewProjectPlanText,
  type PreviewProject,
  type PreviewTask,
  type ProjectPlanImportResult,
  type ProjectPlanIssue,
  type ProjectPlanPreview,
} from '@/lib/project-plan';

/** Rows the hierarchy renders before it says "and N more". */
const MAX_TREE_ROWS = 300;

export function ProjectPlanImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, actions, projectMilestonesEnabled } = useData();
  const [text, setText] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ProjectPlanImportResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [askAboutNames, setAskAboutNames] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Validated on every change, so the preview and the problems appear as the
  // plan is pasted. Nothing is written here — that only happens in `run()`.
  const review = useMemo(
    () => reviewProjectPlanText(text, { projectMilestonesAvailable: projectMilestonesEnabled }),
    [text, projectMilestonesEnabled],
  );

  const clashes = useMemo(
    () => (review.ok && review.plan ? findProjectPlanNameClashes(review.plan, data.projects) : []),
    [review, data.projects],
  );

  const total = review.counts.goals + review.counts.projects + review.counts.projectMilestones + review.counts.tasks;
  const canImport = review.ok && total > 0 && !importing;

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
    if (!review.ok || !review.plan || importing) return;
    setImporting(true);
    setFailure(null);
    try {
      setResult(await actions.importProjectPlan(review.plan));
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
    if (clashes.length > 0) setAskAboutNames(true);
    else void run();
  };

  const reset = () => {
    setResult(null);
    setFailure(null);
    setText('');
  };

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
                {importing ? 'Importing…' : 'Import plan'}
              </Button>
            </>
          )
        }
      >
        {result ? (
          <ImportResult result={result} onClose={onClose} />
        ) : (
          <div className="space-y-4">
            <p className="text-[13px] leading-relaxed text-ink-2">
              Paste a plan in the <code className="text-ink">focusdesk-project-plan</code> JSON format — the one
              ChatGPT can write for you. Nothing is saved until you have seen the preview and pressed Import, and
              nothing that already exists is changed: a plan only ever <em>adds</em> a goal, projects, project
              milestones and tasks.
            </p>

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
              placeholder={'{\n  "format": "focusdesk-project-plan",\n  "version": 1,\n  "projects": [ … ]\n}'}
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
              review.ok && review.preview ? (
                <PlanPreview preview={review.preview} issues={review.warnings} clashes={clashes} />
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
/* Preview                                                             */
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
