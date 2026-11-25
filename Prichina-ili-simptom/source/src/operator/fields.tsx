import { useEffect, useState, type InputHTMLAttributes } from 'react';

// Text input that keeps its own value while typing and commits on blur or Enter,
// so updates from the server don't fight with the keyboard.
export function TextField({ value, onCommit, multiline = false, ...rest }: {
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setDraft(value); }, [value, focused]);
  const commit = () => { setFocused(false); if (draft !== value) onCommit(draft); };
  if (multiline) {
    return (
      <textarea value={draft} placeholder={rest.placeholder} onFocus={() => setFocused(true)} onChange={e => setDraft(e.target.value)} onBlur={commit} />
    );
  }
  return (
    <input
      {...rest}
      value={draft}
      onFocus={() => setFocused(true)}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}

export function NumberField({ value, onCommit, min, max, step = 1, suffix }: {
  value: number;
  onCommit: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <span className="number-field">
      <TextField
        value={String(value)}
        inputMode="decimal"
        onCommit={v => {
          const n = Number(v.replace(',', '.'));
          if (Number.isFinite(n)) onCommit(Math.min(max, Math.max(min, Math.round(n / step) * step)));
        }}
      />
      {suffix && <span>{suffix}</span>}
    </span>
  );
}

export function Stepper({ value, onChange, min = 0, max = 99 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <span className="stepper">
      <button type="button" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label="Меньше">−</button>
      <b>{value}</b>
      <button type="button" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="Больше">+</button>
    </span>
  );
}
