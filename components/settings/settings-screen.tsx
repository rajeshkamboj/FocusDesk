'use client';

import { DisplayNameSetting } from './display-name-setting';
import { ProjectPlanImportModal } from './project-plan-import';
import { useRef, useState } from 'react';
import { useAuth } from '@/components/auth/auth-provider';
import { useData } from '@/components/data/data-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import {
  IconDownload,
  IconMonitor,
  IconMoon,
  IconProjects,
  IconSun,
  IconUpload,
} from '@/components/ui/icons';
import { PageHeader, SectionTitle } from '@/components/layout/page-header';
import { applyTheme } from '@/lib/theme';
import { PROJECT_PLAN_FORMAT, isProjectPlanPayload } from '@/lib/project-plan';
import {
  notificationPermission,
  notificationsSupported,
  requestNotificationPermission,
} from '@/lib/notifications';
import type { AppDataImport, ThemePreference } from '@/lib/types';

export function SettingsScreen() {
  const { user, signOut } = useAuth();
  const { data, actions, repoKind, projectMilestonesEnabled, ready, notify } = useData();
  const [permission, setPermission] = useState(notificationPermission());
  const [planImportOpen, setPlanImportOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { general, notifications, appearance } = data.settings;

  const setTheme = (theme: ThemePreference) => {
    applyTheme(theme);
    void actions.updateSettings({ appearance: { theme } });
  };

  const exportJson = async () => {
    const payload = await actions.exportData();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pace-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Export downloaded');
  };

  const importJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        // Current exports and pre-Phase-3 ones (learning timeline under
        // `milestones`) are both accepted; the repository normalizes them.
        const parsed = JSON.parse(String(reader.result)) as AppDataImport;
        // A project plan is additive; this import replaces everything. Sending
        // one here would wipe the database, so it is refused and pointed at
        // the importer that understands it.
        if (isProjectPlanPayload(parsed)) {
          notify('That is a project plan — use Import Project Plan below');
          return;
        }
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tasks)) {
          notify('That file does not look like a Pace export');
          return;
        }
        void actions.importData(parsed).catch((error: unknown) => {
          console.error('Import failed', error);
          notify(error instanceof Error ? error.message : 'Import failed');
        });
      } catch {
        notify('Could not read that file');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-10 pt-8 sm:px-8 sm:pb-16 sm:pt-10">
      <PageHeader
        title="Settings"
        subtitle="Make the system yours. Every setting below is real — nothing is a placeholder."
      />

      <div className="space-y-8">
        {repoKind === 'supabase' ? (
          <section>
            <SectionTitle>Account</SectionTitle>
            <div className="mt-3 flex items-center justify-between gap-6 rounded-2xl border border-line bg-surface px-5 py-4 shadow-card">
              <div>
                <p className="text-[13.5px] font-medium text-ink">Signed in</p>
                <p className="mt-0.5 text-[11.5px] text-ink-3">{user?.email}</p>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  void signOut().catch((error: unknown) =>
                    notify(error instanceof Error ? error.message : 'Could not sign out'),
                  );
                }}
              >
                Sign out
              </Button>
            </div>
          </section>
        ) : null}

        {/* General */}
        <section>
          <SectionTitle>General</SectionTitle>
          <div className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            <DisplayNameSetting savedName={general.displayName ?? ''} />
            <SettingRow
              label="Start on Today"
              hint="Open the app on the Today screen. When off, you return to the last section you visited."
            >
              <Switch
                label="Start on Today"
                checked={general.startOnToday}
                onChange={(v) => void actions.updateSettings({ general: { ...general, startOnToday: v } })}
              />
            </SettingRow>
            <SettingRow label="Confirm task deletion" hint="Ask before permanently removing a task.">
              <Switch
                label="Confirm task deletion"
                checked={general.confirmTaskDeletion}
                onChange={(v) => void actions.updateSettings({ general: { ...general, confirmTaskDeletion: v } })}
              />
            </SettingRow>
            <SettingRow
              label="Automatic carry-forward"
              hint="When the app opens, unfinished tasks from past days move to today."
            >
              <Switch
                label="Automatic carry-forward"
                checked={general.automaticCarryForward}
                onChange={(v) => void actions.updateSettings({ general: { ...general, automaticCarryForward: v } })}
              />
            </SettingRow>
            <SettingRow label="Default task duration" hint="Pre-fills the estimate on new tasks.">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={5}
                  step={5}
                  value={general.defaultTaskDuration}
                  onChange={(e) =>
                    void actions.updateSettings({
                      general: { ...general, defaultTaskDuration: Math.max(5, Number(e.target.value) || 5) },
                    })
                  }
                  className="w-24"
                />
                <span className="text-[12px] text-ink-3">min</span>
              </div>
            </SettingRow>
          </div>
        </section>

        {/* Notifications */}
        <section>
          <SectionTitle>Notifications</SectionTitle>
          <div className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            <SettingRow label="Morning priority reminder" hint="A gentle nudge to set the one thing that matters today.">
              <Switch
                label="Morning priority reminder"
                checked={notifications.morningPriorityReminder}
                onChange={(v) => void actions.updateSettings({ notifications: { ...notifications, morningPriorityReminder: v } })}
              />
            </SettingRow>
            <SettingRow label="Task reminders" hint="Surfaces reminders you set on individual tasks.">
              <Switch
                label="Task reminders"
                checked={notifications.taskReminders}
                onChange={(v) => void actions.updateSettings({ notifications: { ...notifications, taskReminders: v } })}
              />
            </SettingRow>
            <SettingRow label="Deadline reminders" hint="The day before and on the day a deadline is due.">
              <Switch
                label="Deadline reminders"
                checked={notifications.deadlineReminders}
                onChange={(v) => void actions.updateSettings({ notifications: { ...notifications, deadlineReminders: v } })}
              />
            </SettingRow>
            <SettingRow label="Evening review reminder" hint="A nudge to close the day with the daily review.">
              <Switch
                label="Evening review reminder"
                checked={notifications.eveningReviewReminder}
                onChange={(v) => void actions.updateSettings({ notifications: { ...notifications, eveningReviewReminder: v } })}
              />
            </SettingRow>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface-2/50 px-4 py-3.5">
            {notificationsSupported() ? (
              <>
                <Badge tone={permission === 'granted' ? 'accent' : permission === 'denied' ? 'danger' : 'neutral'}>
                  {permission === 'granted' ? 'Browser notifications enabled' : permission === 'denied' ? 'Blocked in browser' : 'Not enabled yet'}
                </Badge>
                {permission !== 'granted' ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={permission === 'denied'}
                    onClick={async () => {
                      const result = await requestNotificationPermission();
                      setPermission(result);
                    }}
                  >
                    Enable browser notifications
                  </Button>
                ) : null}
              </>
            ) : (
              <Badge tone="neutral">This browser does not support notifications</Badge>
            )}
            <p className="w-full text-[11.5px] leading-relaxed text-ink-3">
              Reminders fire while FocusDesk is open, minimized, or in a background tab, and catch up after sleep,
              wake, or a restart. Fully closing the browser cannot be guaranteed on the web without a push server —
              missed reminders are delivered the next time you open FocusDesk. Allow notifications above; blocking
              them in the browser silently skips delivery.
            </p>
          </div>
        </section>

        {/* Appearance */}
        <section>
          <SectionTitle>Appearance</SectionTitle>
          <div className="mt-3 rounded-2xl border border-line bg-surface p-5 shadow-card">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['light', 'Light', IconSun],
                  ['dark', 'Dark', IconMoon],
                  ['system', 'System', IconMonitor],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] font-medium transition-colors ${
                    appearance.theme === value
                      ? 'border-accent bg-accent-soft text-accent-ink'
                      : 'border-line text-ink-2 hover:border-line-strong'
                  }`}
                >
                  <Icon width={16} height={16} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Data */}
        <section>
          <SectionTitle>Data</SectionTitle>
          <div className="mt-3 rounded-2xl border border-line bg-surface p-5 shadow-card">
            <div className="flex flex-wrap gap-2.5">
              <Button variant="secondary" onClick={() => void exportJson()}>
                <IconDownload width={15} height={15} />
                Export (JSON)
              </Button>
              <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                <IconUpload width={15} height={15} />
                Import (JSON)
              </Button>
              <Button variant="secondary" onClick={() => setPlanImportOpen(true)}>
                <IconProjects width={15} height={15} />
                Import Project Plan
              </Button>
              <Button variant="secondary" onClick={() => void actions.backupNow()}>
                Backup on this device
              </Button>
              <Button variant="secondary" onClick={() => void actions.restoreBackup()}>
                Restore backup
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importJson(file);
                  e.target.value = '';
                }}
              />
            </div>
            <div className="mt-4 space-y-1.5 text-[11.5px] leading-relaxed text-ink-3">
              <p>
                Storage backend:{' '}
                <span className="font-medium text-ink-2">
                  {repoKind === 'supabase' ? 'Supabase (PostgreSQL)' : 'This browser (local storage)'}
                </span>
              </p>
              {repoKind === 'supabase' && ready ? (
                <p>
                  Project milestones:{' '}
                  <span className="font-medium text-ink-2">
                    {projectMilestonesEnabled ? 'Available' : 'Waiting for database migration 008'}
                  </span>
                </p>
              ) : null}
              <p>
                Import replaces everything currently stored. Backups live in this browser only — export to JSON for a
                durable copy. When Supabase credentials are added, the same data flows into PostgreSQL without changing
                how anything works here.
              </p>
              <p>
                Import Project Plan is different: it takes a{' '}
                <span className="font-medium text-ink-2">{PROJECT_PLAN_FORMAT}</span> JSON plan (the kind ChatGPT can
                write) and <span className="font-medium text-ink-2">adds</span> its goal, projects, project milestones
                and tasks after showing you exactly what will be created. It never changes or deletes anything that
                already exists. It can either create a new project from the plan, or add the milestones and tasks of a
                plan to a project you already have. See{' '}
                <span className="font-medium text-ink-2">docs/focusdesk-project-plan-v1.md</span> for the format and the
                prompt to give ChatGPT.
              </p>
            </div>
          </div>
        </section>
      </div>

      {planImportOpen ? <ProjectPlanImportModal open onClose={() => setPlanImportOpen(false)} /> : null}
    </div>
  );
}

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-5 px-5 py-4 sm:gap-6">
      {/* `min-w-0` so the label block is the part that yields: without it the
          row's min-content is the label plus the full control, which left a
          settings row only a few pixels short of a 320px screen. */}
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium text-ink">{label}</p>
        {hint ? <p className="mt-0.5 max-w-md text-[11.5px] leading-relaxed text-ink-3">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}
