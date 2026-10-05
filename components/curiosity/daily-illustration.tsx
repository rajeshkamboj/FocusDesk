export function DailyIllustration({ kind }: { kind: 'history' | 'literature' | 'sharpener' }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 160 96" fill="none" className="pointer-events-none absolute right-2 top-2 h-24 w-40 opacity-25">
      <circle cx="112" cy="39" r="34" fill="currentColor" opacity=".15" />
      {kind === 'history' ? <g stroke="currentColor" strokeWidth="3" strokeLinejoin="round"><path d="m55 34 43-23 43 23H55Zm5 8h76M56 82h84M63 73h69M70 44v28m18-28v28m20-28v28m18-28v28" /><path d="M16 83q25-24 47-4m75-4 16-12" /></g> : kind === 'literature' ? <g stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"><path d="M42 37q27-12 51 3 24-15 51-3v44q-27-12-51 3-24-15-51-3V37Zm51 3v44m-40-33 27 3m-27 9 27 3m24-12 28-3m-28 15 28-3M23 69Q7 36 35 12q8 36-12 57Zm0 0 9-42" /></g> : <g stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"><path d="m51 17 75 7-6 65-75-7 6-65Zm12 18 43 4M62 47l22 2m-23 9 43 4m-44 8 29 3m35-6 23-41 7 4-23 41-10 8 3-12Z" /><circle cx="28" cy="35" r="12" /><path d="M22 35h12m-6-6v12" /></g>}
    </svg>
  );
}
