import type { User } from '@supabase/supabase-js';

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function firstNameFromEmail(email?: string): string | undefined {
  const localPart = email?.split('@')[0];
  const firstPart = localPart?.split(/[._+\-]+/)[0]?.trim();
  if (!firstPart) return undefined;
  return firstPart.charAt(0).toUpperCase() + firstPart.slice(1).toLowerCase();
}

export function getUserDisplayName(user: User | null, configuredName?: string): string {
  const custom = nonEmptyString(configuredName);
  if (custom) return custom;

  const metadata = user?.user_metadata;
  return (
    nonEmptyString(metadata?.display_name) ??
    nonEmptyString(metadata?.full_name) ??
    nonEmptyString(metadata?.name) ??
    firstNameFromEmail(user?.email) ??
    'there'
  );
}
