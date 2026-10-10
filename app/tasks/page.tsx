import { Suspense } from 'react';
import type { Metadata } from 'next';
import { TasksScreen } from '@/components/tasks/tasks-screen';

export const metadata: Metadata = {
  title: 'Tasks',
};

export default function TasksPage() {
  // TasksScreen reads `?focus=<task id>` (timer navigation) with
  // useSearchParams, which a statically prerendered page must wrap in
  // Suspense. The fallback is never visible in practice: AppShell already
  // shows its loading indicator until the data is ready.
  return (
    <Suspense fallback={null}>
      <TasksScreen />
    </Suspense>
  );
}
