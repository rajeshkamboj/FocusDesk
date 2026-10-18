'use client';

import { useState, type FormEvent } from 'react';
import { BrandMark } from '@/components/layout/sidebar';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';

/**
 * Shown after a user follows a Supabase recovery link. The link establishes a
 * short-lived session, so AuthProvider renders this instead of the app until a
 * new password has been saved (or the user cancels).
 */
export function ResetPasswordScreen({
  email,
  onUpdatePassword,
  onCancel,
}: {
  email?: string;
  onUpdatePassword(password: string): Promise<void>;
  onCancel(): Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (password !== confirmation) {
      setError('Those passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await onUpdatePassword(password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update your password');
      setSubmitting(false);
    }
  };

  const cancel = async () => {
    setError('');
    setCancelling(true);
    try {
      await onCancel();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not cancel');
      setCancelling(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-5">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-card">
        <div className="flex items-center gap-3">
          <BrandMark />
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight text-ink">Focus Desk</h1>
            <p className="text-[12px] text-ink-3">Choose a new password</p>
          </div>
        </div>

        <p className="mt-4 text-[12.5px] leading-relaxed text-ink-2">
          Your reset link worked{email ? <> for <span className="font-medium text-ink">{email}</span></> : null}.
          Set a new password to get back in.
        </p>

        <form className="mt-5 space-y-4" onSubmit={submit}>
          <Field label="New password" hint="At least 8 characters.">
            <Input
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <Field label="Confirm new password">
            <Input
              type="password"
              autoComplete="new-password"
              required
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </Field>
          {error ? (
            <p role="alert" className="text-[12px] text-danger">
              {error}
            </p>
          ) : null}
          <Button className="w-full" type="submit" disabled={submitting || cancelling}>
            {submitting ? 'Updating…' : 'Update password'}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => void cancel()}
            disabled={submitting || cancelling}
            className="text-[12px] text-ink-3 underline-offset-2 transition-colors hover:text-ink hover:underline disabled:opacity-50"
          >
            {cancelling ? 'Signing out…' : 'Cancel and sign out'}
          </button>
        </div>
      </div>
    </main>
  );
}
