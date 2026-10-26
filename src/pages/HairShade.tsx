import { useEffect, useRef, useState } from 'preact/hooks';
import * as store from '../lib/store';
import { Swatch } from '../components';

/**
 * YouCam reports hair colour as one of a few families. To match a wig, the exact shade matters,
 * so the user taps their hair in the photo and we take the median colour of a small patch there
 * (the median ignores stray highlights and shadows better than the mean).
 */
export function HairShade({ photoKey, value, onPick }: { photoKey: string; value?: string; onPick: (hex: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [marker, setMarker] = useState<{ x: number; y: number }>();

  useEffect(() => {
    let alive = true;
    (async () => {
      const blob = await store.get<Blob>('images', photoKey);
      if (!blob || !alive || !canvas.current) return;
      const bitmap = await createImageBitmap(blob);
      const c = canvas.current;
      c.width = bitmap.width;
      c.height = bitmap.height;
      c.getContext('2d', { willReadFrequently: true })?.drawImage(bitmap, 0, 0);
      bitmap.close();
    })();
    return () => {
      alive = false;
    };
  }, [photoKey]);

  const sample = (clientX: number, clientY: number) => {
    const c = canvas.current;
    const ctx = c?.getContext('2d', { willReadFrequently: true });
    if (!c || !ctx) return;
    const rect = c.getBoundingClientRect();
    const x = Math.round(((clientX - rect.left) / rect.width) * c.width);
    const y = Math.round(((clientY - rect.top) / rect.height) * c.height);
    const r = Math.max(4, Math.round(c.width / 120));
    const { data } = ctx.getImageData(Math.max(0, x - r), Math.max(0, y - r), r * 2 + 1, r * 2 + 1);
    const ch: number[][] = [[], [], []];
    for (let i = 0; i < data.length; i += 4) for (let k = 0; k < 3; k++) ch[k].push(data[i + k]);
    const median = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1];
    const hex = `#${ch.map((a) => median(a).toString(16).padStart(2, '0')).join('')}`;
    setMarker({ x: ((clientX - rect.left) / rect.width) * 100, y: ((clientY - rect.top) / rect.height) * 100 });
    onPick(hex);
  };

  return (
    <div class="stack">
      <div style={{ position: 'relative', maxWidth: '360px' }}>
        <canvas
          ref={canvas}
          style={{ width: '100%', borderRadius: 'var(--radius-sm)', cursor: 'crosshair', display: 'block' }}
          role="img"
          aria-label="Your photo. Tap on your hair to pick its exact shade."
          onClick={(e) => sample(e.clientX, e.clientY)}
        />
        {marker && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: `${marker.x}%`,
              top: `${marker.y}%`,
              width: '22px',
              height: '22px',
              marginLeft: '-11px',
              marginTop: '-11px',
              borderRadius: '50%',
              border: '3px solid white',
              boxShadow: '0 0 0 2px rgb(0 0 0 / 50%)',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
      <p class="muted small">
        {value ? (
          <>
            <Swatch hex={value} label="Your exact hair shade" /> Your shade: {value}. Tap again to adjust, ideally on a mid-tone strand, not a
            highlight or a shadow.
          </>
        ) : (
          'Tap on your hair, on a mid-tone strand rather than a highlight or a shadow.'
        )}
      </p>
    </div>
  );
}
