/**
 * Repository factory.
 *
 * Chooses the Supabase backend when public credentials are configured,
 * otherwise falls back to local browser storage. The rest of the application
 * is identical either way.
 */

import type { AppRepository } from './repository';
import { LocalRepository } from './local-repository';
import { SupabaseRepository } from './supabase-repository';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase/client';

export * from './repository';
export { LocalRepository } from './local-repository';
export { SupabaseRepository } from './supabase-repository';
export { defaultSettings, emptyData } from './defaults';

export function createRepository(userId?: string): AppRepository {
  if (isSupabaseConfigured()) {
    if (!userId) throw new Error('An authenticated user is required for Supabase');
    return new SupabaseRepository(getSupabaseBrowserClient(), userId);
  }
  return new LocalRepository();
}

export function repositoryKind(): 'local' | 'supabase' {
  return isSupabaseConfigured() ? 'supabase' : 'local';
}
