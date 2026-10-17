'use client';

import { useState, type FormEvent } from 'react';
import { BrandMark } from '@/components/layout/sidebar';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';

type Mode = 'signin' | 'forgot';

export function LoginScreen({
  onSignIn,
  onResetPassword,
  initialError = '',
}: {
  onSignIn(email: string, password: string): Promise<void>;
  onResetPassword(email: string): Promise<void>;
  initialError?: string;
}) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setNotice('');
    setSubmitting(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      if (mode === 'forgot') {
        await onResetPassword(email);
        setNotice(
          'If that email has an account, a reset link is on its way. Check your inbox and spam folder, then open the link on this device.',
        );
      } else {
        await onSignIn(email, password);
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : mode === 'forgot'
            ? 'Could not send the reset link'
            : 'Could not sign in',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const forgot = mode === 'forgot';

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-5">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-card">
        <div className="flex items-center gap-3">
          <BrandMark />
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight text-ink">Pace</h1>
            <p className="text-[12px] text-ink-3">
              {forgot ? 'Reset your password' : 'Sign in to FocusDesk'}
            </p>
          </div>
        </div>

        <form className="mt-6 space-y-4" onSubmit={submit}>
          <Field label="Email">
            <Input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          {forgot ? null : (
            <Field label="Password">
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
          )}
          {error ? (
            <p role="alert" className="text-[12px] text-danger">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="rounded-lg bg-accent-soft px-3 py-2 text-[12px] leading-relaxed text-accent-ink">
              {notice}
            </p>
          ) : null}
          <Button className="w-full" type="submit" disabled={submitting}>
            {submitting
              ? forgot
                ? 'Sending…'
                : 'Signing in…'
              : forgot
                ? 'Send reset link'
                : 'Sign in'}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => switchMode(forgot ? 'signin' : 'forgot')}
            className="text-[12px] text-ink-3 underline-offset-2 transition-colors hover:text-ink hover:underline"
          >
            {forgot ? 'Back to sign in' : 'Forgot password?'}
          </button>
        </div>
      </div>
    </main>
  );
}
