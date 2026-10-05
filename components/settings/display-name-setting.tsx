'use client';

import { useState } from 'react';
import { useData } from '@/components/data/data-provider';
import { Input } from '@/components/ui/form';
import { Button } from '@/components/ui/button';

export function DisplayNameSetting({ savedName }: { savedName: string }) {
  const { actions, data } = useData();
  const [name, setName] = useState(savedName);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <form className="px-5 py-4" onSubmit={async (event) => {
      event.preventDefault();
      if (saving) return;
      setSaving(true);
      setMessage('');
      try {
        await actions.updateSettings({ general: { ...data.settings.general, displayName: name.trim() } });
        setName(name.trim());
        setMessage('Name saved');
      } catch {
        setMessage('Could not save your name. Please try again.');
      } finally { setSaving(false); }
    }}>
      <label htmlFor="display-name" className="text-[13.5px] font-medium text-ink">Your name</label>
      <p id="display-name-hint" className="mt-1 text-xs text-ink-2">Used for your greeting in FocusDesk.</p>
      <div className="mt-3 flex gap-2">
        <Input id="display-name" autoComplete="given-name" aria-describedby="display-name-hint" maxLength={80} placeholder="Your preferred name" value={name} disabled={saving} onChange={(event) => { setName(event.target.value); setMessage(''); }} className="min-w-0 flex-1" />
        <Button type="submit" disabled={saving || name.trim() === savedName}>{saving ? 'Saving…' : 'Save'}</Button>
      </div>
      <p role="status" className="mt-1 text-xs text-ink-2">{message}</p>
    </form>
  );
}
