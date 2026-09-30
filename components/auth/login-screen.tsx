'use client';

import { useState, type FormEvent } from 'react';
import { BrandMark } from '@/components/layout/sidebar';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';

export function LoginScreen({
  onSignIn,
}: {
  onSignIn(email: string, password: string): Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onSignIn(email, password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign in');
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-5">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-card">
        <div className="flex items-center gap-3">
          <BrandMark />
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight text-ink">Pace</h1>
            <p className="text-[12px] text-ink-3">Sign in to FocusDesk</p>
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
          <Field label="Password">
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          {error ? <p className="text-[12px] text-danger">{error}</p> : null}
          <Button className="w-full" type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </main>
  );
}
