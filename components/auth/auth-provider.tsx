'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { User } from '@supabase/supabase-js';
import {
  getSupabaseBrowserClient,
  isSupabaseConfigured,
} from '@/lib/supabase/client';
import { LoginScreen } from './login-screen';
import { ResetPasswordScreen } from './reset-password-screen';

interface AuthContextValue {
  user: User | null;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const subscribeToHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

const EXPIRED_LINK_MESSAGE =
  'That reset link is invalid or has expired. Enter your email to request a new one.';

/**
 * Reads recovery info from the URL hash Supabase redirects back with.
 *
 * - Success (implicit flow): `#access_token=…&type=recovery`
 * - Failure: `#error=access_denied&error_code=otp_expired&error_description=…`
 *
 * The hash is left in place on success so the SDK can exchange the token.
 * On failure there is nothing to exchange, so it is removed to keep reloads clean.
 */
function readRecoveryHash(): { recovery: boolean; error: string | null } {
  if (typeof window === 'undefined' || !window.location.hash) {
    return { recovery: false, error: null };
  }

  const params = new URLSearchParams(window.location.hash.slice(1));
  const errorCode = params.get('error') ?? params.get('error_code');
  if (errorCode) {
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}`,
    );
    return {
      recovery: false,
      error: params.get('error_description') || EXPIRED_LINK_MESSAGE,
    };
  }

  return { recovery: params.get('type') === 'recovery', error: null };
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
  // Read once, before the first paint: the server snapshot is unused because
  // the loading spinner renders in both states, so there is no hydration
  // mismatch. Doing this lazily (instead of in an effect) also avoids a
  // cascading render and keeps the recovery screen from flashing the app.
  const [initialRecovery] = useState(readRecoveryHash);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // True while a recovery link is being used: the user has a session but must
  // pick a new password before reaching the app.
  const [recovering, setRecovering] = useState(initialRecovery.recovery);
  const [linkError, setLinkError] = useState(initialRecovery.error ?? '');

  useEffect(() => {
    let active = true;

    if (!configured) {
      queueMicrotask(() => {
        if (active) setLoading(false);
      });
      return () => {
        active = false;
      };
    }

    const client = getSupabaseBrowserClient();

    void client.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (error && error.name !== 'AuthSessionMissingError') {
        console.error('Could not restore Supabase authentication', error);
      }
      setUser(data.user ?? null);
      setLoading(false);
      // A recovery link that produced no session was expired or already used.
      if (!data.user && initialRecovery.recovery) {
        setRecovering(false);
        setLinkError(EXPIRED_LINK_MESSAGE);
      }
    });

    const { data: subscription } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      // Supabase emits PASSWORD_RECOVERY when a reset link is opened.
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [configured, initialRecovery.recovery]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabaseBrowserClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
    setLinkError('');
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await getSupabaseBrowserClient().auth.signOut();
    if (error) throw error;
    setRecovering(false);
    setLinkError('');
  }, []);

  /** Sends a Supabase password-recovery email that links back to this origin. */
  const resetPassword = useCallback(async (email: string) => {
    const { error } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: `${window.location.origin}/` },
    );
    if (error) throw error;
  }, []);

  /** Saves the new password for the session a recovery link established. */
  const updatePassword = useCallback(async (password: string) => {
    const { error } = await getSupabaseBrowserClient().auth.updateUser({ password });
    if (error) throw error;
    setRecovering(false);
  }, []);

  const value = useMemo(() => ({ user, signIn, signOut }), [user, signIn, signOut]);

  if (!hydrated || loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas">
        <div className="h-6 w-6 animate-pulse rounded-full border-2 border-line-strong border-t-accent" />
      </div>
    );
  }

  if (configured && recovering && user) {
    return (
      <ResetPasswordScreen
        email={user.email}
        onUpdatePassword={updatePassword}
        onCancel={signOut}
      />
    );
  }

  if (configured && !user) {
    return (
      <LoginScreen
        onSignIn={signIn}
        onResetPassword={resetPassword}
        initialError={linkError}
      />
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
