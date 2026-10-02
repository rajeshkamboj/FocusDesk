'use client';

import { useState } from 'react';
import { useData } from '@/components/data/data-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm';
import { DateModal } from '@/components/ui/date-modal';
import { EmptyState } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/menu';
import { Modal } from '@/components/ui/modal';
import { IconIdeas, IconMore, IconPencil, IconPlus, IconTrash } from '@/components/ui/icons';
import { PageHeader } from '@/components/layout/page-header';
import { Tabs } from '@/components/ui/tabs';
import { formatShortDate, todayISO } from '@/lib/dates';
import type { Idea } from '@/lib/types';

/**
 * Ideas / parking lot — deliberately NOT tasks, so the daily list stays calm.
 */
export function IdeasScreen() {
  const { data, actions } = useData();
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Idea | undefined>(undefined);
  const [deleting, setDeleting] = useState<Idea | undefined>(undefined);
  const [scheduling, setScheduling] = useState<Idea | undefined>(undefined);

  const ideas = data.ideas.filter((i) => (tab === 'archived' ? i.archived : !i.archived));

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-8 sm:px-8 sm:pt-10">
      <PageHeader
        title="Ideas"
        subtitle="A parking lot for things that are not tasks — yet. They never appear in Today on their own."
        actions={
          <Button variant="primary" onClick={() => { setEditing(undefined); setFormOpen(true); }}>
            <IconPlus width={16} height={16} />
            New Idea
          </Button>
        }
      />

      <div className="mb-5">
        <Tabs
          items={[
            { id: 'active', label: 'Active' },
            { id: 'archived', label: 'Archived' },
          ]}
          active={tab}
          onChange={(id) => setTab(id as 'active' | 'archived')}
        />
      </div>

      {ideas.length === 0 ? (
        <EmptyState
          icon={<IconIdeas width={24} height={24} />}
          title={tab === 'active' ? 'No ideas parked here' : 'Nothing archived'}
          hint={
            tab === 'active'
              ? 'Ideas you are not ready to act on can rest here without cluttering your task list.'
              : 'Ideas you archive will collect here.'
          }
          action={
            tab === 'active' ? (
              <Button variant="primary" size="sm" onClick={() => { setEditing(undefined); setFormOpen(true); }}>
                <IconPlus width={15} height={15} />
                New Idea
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-2.5">
          {ideas.map((idea) => (
            <div key={idea.id} className="group flex items-start gap-3 rounded-2xl border border-line bg-surface px-5 py-4 shadow-card">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[14.5px] font-semibold leading-snug text-ink">{idea.title}</h3>
                  {idea.archived ? <Badge tone="muted">Archived</Badge> : null}
                </div>
                {idea.description ? (
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{idea.description}</p>
                ) : null}
                <p className="mt-1.5 text-[11px] text-ink-3">Captured {formatShortDate(idea.createdAt.slice(0, 10))}</p>
              </div>

              <Menu
                trigger={({ toggle }) => (
                  <button onClick={toggle} aria-label="Idea actions" className="rounded-lg p-1.5 text-ink-3 opacity-0 transition-all hover:bg-surface-2 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100">
                    <IconMore width={17} height={17} />
                  </button>
                )}
              >
                {(close) => (
                  <>
                    <MenuItem onClick={() => { setEditing(idea); setFormOpen(true); close(); }}>
                      <IconPencil width={14} height={14} /> Edit…
                    </MenuItem>
                    <MenuSeparator />
                    <MenuLabel>Promote</MenuLabel>
                    <MenuItem onClick={() => { void actions.promoteIdea(idea.id, 'task'); close(); }}>
                      Promote to task
                    </MenuItem>
                    <MenuItem onClick={() => { setScheduling(idea); close(); }}>
                      Schedule as task…
                    </MenuItem>
                    <MenuItem onClick={() => { void actions.promoteIdea(idea.id, 'someday'); close(); }}>
                      Promote to Someday
                    </MenuItem>
                    <MenuItem onClick={() => { void actions.promoteIdea(idea.id, 'project'); close(); }}>
                      Promote to project
                    </MenuItem>
                    <MenuItem onClick={() => { void actions.promoteIdea(idea.id, 'goal'); close(); }}>
                      Promote to goal
                    </MenuItem>
                    <MenuSeparator />
                    {idea.archived ? (
                      <MenuItem onClick={() => { void actions.archiveIdea(idea.id, false); close(); }}>
                        Unarchive
                      </MenuItem>
                    ) : (
                      <MenuItem onClick={() => { void actions.archiveIdea(idea.id, true); close(); }}>
                        Archive
                      </MenuItem>
                    )}
                    <MenuItem danger onClick={() => { setDeleting(idea); close(); }}>
                      <IconTrash width={14} height={14} /> Delete
                    </MenuItem>
                  </>
                )}
              </Menu>
            </div>
          ))}
        </div>
      )}

      {/* Keyed + conditionally mounted so every open starts from a clean component instance:
          creating a new idea never inherits the previously typed title/notes. */}
      {formOpen ? (
        <IdeaFormModal
          key={editing?.id ?? 'new'}
          open
          onClose={() => { setFormOpen(false); setEditing(undefined); }}
          idea={editing}
        />
      ) : null}

      <DateModal
        open={scheduling !== undefined}
        title="Schedule idea as task"
        label="Work on it on"
        confirmLabel="Create task"
        initialDate={todayISO()}
        onClose={() => setScheduling(undefined)}
        onSubmit={(date) => {
          if (scheduling && date) void actions.promoteIdea(scheduling.id, 'task', { scheduledDate: date, status: 'planned' });
          setScheduling(undefined);
        }}
      />

      <ConfirmDialog
        open={deleting !== undefined}
        title="Delete idea?"
        message={`“${deleting?.title ?? ''}” will be permanently removed.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleting(undefined)}
        onConfirm={() => {
          if (deleting) void actions.deleteIdea(deleting.id);
          setDeleting(undefined);
        }}
      />
    </div>
  );
}

function IdeaFormModal({ open, onClose, idea }: { open: boolean; onClose: () => void; idea?: Idea }) {
  const { actions } = useData();
  // Fresh instance per open (see key/conditional mount above), so props are the only initial state.
  const [title, setTitle] = useState(idea?.title ?? '');
  const [description, setDescription] = useState(idea?.description ?? '');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      if (idea) await actions.updateIdea(idea.id, { title: title.trim(), description: description.trim() || undefined });
      else await actions.addIdea({ title: title.trim(), description: description.trim() || undefined });
    } catch (err) {
      setSaving(false);
      throw err;
    }
    setTitle('');
    setDescription('');
    setSaving(false);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={idea ? 'Edit idea' : 'New idea'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={!title.trim() || saving}>
            {idea ? 'Save changes' : 'Save idea'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Idea">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What if…?" autoFocus />
        </Field>
        <Field label="Notes">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Why is this interesting?" className="min-h-20" />
        </Field>
      </div>
    </Modal>
  );
}
