import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

export function Swatch({ hex, label }: { hex: string; label: string }) {
  return <span class="swatch" style={{ background: hex }} role="img" aria-label={`${label}: ${hex}`} />;
}

export function ErrorNote({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p class="note note-warn" role="alert">
      {message}
    </p>
  );
}

export type StepState = 'idle' | 'run' | 'ok' | 'err';

export function Progress({ steps }: { steps: Array<{ label: string; state: StepState; detail?: string }> }) {
  return (
    <ul class="progress" aria-live="polite">
      {steps.map((s) => (
        <li key={s.label}>
          <span class={`dot ${s.state === 'idle' ? '' : `dot-${s.state}`}`} aria-hidden="true" />
          <span>
            {s.label}
            {s.state === 'run' && <span class="muted"> · working…</span>}
            {s.state === 'ok' && <span class="sr-only"> done</span>}
            {s.detail && <span class="muted small"> · {s.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Picks a photo from the camera or the library and hands back the file. */
export function PhotoPicker({
  label,
  hint,
  preview,
  busy,
  onPick,
  capture = 'user',
}: {
  label: string;
  hint: ComponentChildren;
  preview?: string;
  busy?: boolean;
  onPick: (file: File) => void;
  capture?: 'user' | 'environment';
}) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const take = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) onPick(file);
  };
  return (
    <div class="photo-slot">
      <h3>{label}</h3>
      <div class="muted small">{hint}</div>
      {preview && <img src={preview} alt={`${label} preview`} />}
      <div class="row">
        <button type="button" class="btn btn-primary" disabled={busy} onClick={() => camera.current?.click()}>
          {preview ? 'Retake' : 'Take photo'}
        </button>
        <button type="button" class="btn btn-ghost" disabled={busy} onClick={() => library.current?.click()}>
          Choose from library
        </button>
      </div>
      <input ref={camera} class="sr-only" type="file" accept="image/*" capture={capture} onChange={take} tabIndex={-1} aria-hidden="true" />
      <input ref={library} class="sr-only" type="file" accept="image/jpeg,image/png" onChange={take} tabIndex={-1} aria-hidden="true" />
    </div>
  );
}

/** Before/after slider. Keyboard and screen-reader friendly (it is a native range input). */
export function Compare({ before, after, alt }: { before: string; after: string; alt: string }) {
  const [pos, setPos] = useState(50);
  return (
    <div class="compare">
      <img src={before} alt={`You now (${alt})`} />
      <div class="after" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
        <img src={after} alt={`Preview: ${alt}`} />
      </div>
      <span class="label" style={{ left: '10px' }}>
        Now
      </span>
      <span class="label" style={{ right: '10px' }}>
        Preview
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        aria-label="Slide to compare your photo with the preview"
        onInput={(e) => setPos(Number((e.currentTarget as HTMLInputElement).value))}
      />
    </div>
  );
}

/** Object URL for a Blob held in memory, revoked on change/unmount. */
export function useBlobUrl(blob?: Blob): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return setUrl(undefined);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}
