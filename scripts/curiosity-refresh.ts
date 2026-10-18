/**
 * Run the Curiosity refresh from a shell — for a self-hosted box whose cron is the
 * ordinary kind, and for checking what the scheduler will do before you install it.
 *
 *   npx tsx scripts/curiosity-refresh.ts                publish whatever is due
 *   npx tsx scripts/curiosity-refresh.ts --scope=daily  daily cards only
 *   npx tsx scripts/curiosity-refresh.ts --scope=book   One Book only
 *   npx tsx scripts/curiosity-refresh.ts --force        publish even if today exists
 *   npx tsx scripts/curiosity-refresh.ts --status       what is published, and where
 *   npx tsx scripts/curiosity-refresh.ts --backfill-pool  seed curiosity_content
 *   npx tsx scripts/curiosity-refresh.ts --at=2026-10-20T18:31:00Z  pretend a clock
 *
 * This is the same entry point the HTTP route calls, so a crontab line and a cron
 * provider exercise identical code:
 *
 *   # a server whose clock is UTC — 18:30 UTC is 00:00 Asia/Kolkata, all year
 *   30 18 * * * app cd /srv/focusdesk && /usr/bin/npx tsx scripts/curiosity-refresh.ts --trigger=cron >> /var/log/focusdesk-curiosity.log 2>&1
 *
 *   # the same minute on a server whose clock is already Asia/Kolkata
 *   0 0 * * * app cd /srv/focusdesk && /usr/bin/npx tsx scripts/curiosity-refresh.ts --trigger=cron >> /var/log/focusdesk-curiosity.log 2>&1
 *
 * `--trigger=cron` only labels the run record (cron | cli | admin | startup); it grants
 * nothing. The published day is the same either way.
 *
 * Exit code is 0 when the run published or found nothing due, 1 when it failed — so a
 * cron mail fires only on a real problem.
 */

import { getCuriosityStatus, runCuriosityRefresh, type RefreshScope } from '../lib/curiosity/job';
import type { RefreshTrigger } from '../lib/curiosity/state';
import { CURIOUSITY_CATEGORIES, poolFor } from '../lib/curiosity/pool';
import { backfillPool } from '../lib/curiosity/content-db';

function flag(name: string): string | null {
  const prefix = `--${name}`;
  const found = process.argv.slice(2).find((arg) => arg === prefix || arg.startsWith(`${prefix}=`));
  if (!found) return null;
  const [, value = ''] = found.split('=');
  return value;
}

function has(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

async function main(): Promise<number> {
  if (has('status')) {
    const status = await getCuriosityStatus();
    console.log(JSON.stringify(status, null, 2));
    return 0;
  }

  if (has('backfill-pool')) {
    const entries = CURIOUSITY_CATEGORIES.flatMap((category) => poolFor(category) as never[]);
    const result = await backfillPool(entries);
    if (result.error) {
      console.error(`Pool not written: ${result.error}`);
      return 1;
    }
    console.log(`Upserted ${result.written} rows into curiosity_content (${CURIOUSITY_CATEGORIES.join(', ')}).`);
    return 0;
  }

  const scope = (flag('scope') as RefreshScope) ?? 'all';
  if (!['all', 'daily', 'book'].includes(scope)) {
    console.error(`Unknown --scope=${scope}; expected daily, book or all.`);
    return 1;
  }
  const trigger = flag('trigger') ?? 'cli';
  if (!['cron', 'cli', 'admin', 'startup'].includes(trigger)) {
    console.error(`Unknown --trigger=${trigger}; expected cron, cli, admin or startup.`);
    return 1;
  }
  const at = flag('at');
  const now = at ? new Date(at) : new Date();
  if (at && Number.isNaN(now.getTime())) {
    console.error(`--at=${at} is not a date.`);
    return 1;
  }

  const summary = await runCuriosityRefresh({
    scope,
    force: has('force'),
    offline: has('offline'),
    trigger: trigger as RefreshTrigger,
    now,
  });
  console.log(JSON.stringify(summary, null, 2));
  return summary.status === 'failed' ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
