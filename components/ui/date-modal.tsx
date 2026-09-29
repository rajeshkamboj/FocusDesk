'use client';

import { useState } from 'react';
import { Modal } from './modal';
import { Button } from './button';
import { Input } from './form';
import type { ISODate } from '@/lib/types';

/**
 * Small date picker dialog. Pass `clearable` to allow removing the date.
 */
export function DateModal({
  open,
  title,
  label,
  confirmLabel,
  initialDate,
  clearable,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  label: string;
  confirmLabel: string;
  initialDate?: ISODate;
  clearable?: boolean;
  onSubmit: (date: ISODate | undefined) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialDate ?? '');

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValue(initialDate ?? '');
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          {clearable ? (
            <Button variant="ghost" onClick={() => onSubmit(undefined)}>
              Clear
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!value}
            onClick={() => value && onSubmit(value)}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
        <Input type="date" value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
    </Modal>
  );
}
