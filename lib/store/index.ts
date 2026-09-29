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

export * from './repository';
export { LocalRepository } from './local-repository';
export { SupabaseRepository } from './supabase-repository';
export { defaultSettings, emptyData } from './defaults';

export function createRepository(): AppRepository {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anonKey) {
    return new SupabaseRepository({ url, anonKey });
  }
  return new LocalRepository();
}

export function repositoryKind(): 'local' | 'supabase' {
  return process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? 'supabase'
    : 'local';
}
