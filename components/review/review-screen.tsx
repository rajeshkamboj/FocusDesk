'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Tabs } from '@/components/ui/tabs';
import { DailyReview } from './daily-review';
import { WeeklyReview } from './weekly-review';
import { MonthlyReview } from './monthly-review';
import { todayISO } from '@/lib/dates';
import type { ISODate } from '@/lib/types';

type TabId = 'daily' | 'weekly' | 'monthly';

export function ReviewScreen() {
  const [tab, setTab] = useState<TabId>('daily');
  const [day, setDay] = useState<ISODate>(todayISO());

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-8 sm:px-8 sm:pt-10">
      <PageHeader
        title="Review"
        subtitle="Facts about what happened — daily, weekly and monthly. No scores, no judgment."
        actions={
          <Tabs
            items={[
              { id: 'daily', label: 'Daily' },
              { id: 'weekly', label: 'Weekly' },
              { id: 'monthly', label: 'Monthly' },
            ]}
            active={tab}
            onChange={(id) => setTab(id as TabId)}
          />
        }
      />

      {tab === 'daily' ? <DailyReview date={day} onDateChange={setDay} /> : null}
      {tab === 'weekly' ? <WeeklyReview /> : null}
      {tab === 'monthly' ? <MonthlyReview /> : null}
    </div>
  );
}
