import { useEffect, useState } from 'preact/hooks';
import { useApp, useImage, type Look, type LookKind } from '../state';
import { Compare, ErrorNote, PhotoPicker, Swatch, useBlobUrl } from '../components';
import { analyze } from '../lib/run';
import { listHairTemplates, uploadPhoto, type HairTemplate } from '../lib/api';
import { preparePhoto } from '../lib/image';
import { friendlyError } from '../lib/errors';
import { browPencil, mix } from '../lib/guidance';

type Tab = 'wig' | 'short' | 'color' | 'hat' | 'brows';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'wig', label: 'Wigs like my hair' },
  { id: 'short', label: 'Short cut first' },
  { id: 'color', label: 'A new colour' },
  { id: 'hat', label: 'Hats' },
  { id: 'brows', label: 'Brows' },
];

const COLORS = [
  { hex: '#2b1d16', label: 'Espresso' },
  { hex: '#5a3a24', label: 'Chestnut' },
  { hex: '#8a5a3b', label: 'Caramel' },
  { hex: '#b98a5a', label: 'Honey' },
  { hex: '#d9c3a0', label: 'Sand blonde' },
  { hex: '#9a9a9a', label: 'Silver' },
  { hex: '#7a2f22', label: 'Auburn' },
];

/** Short styles are what many people choose before shedding starts; we pick them by title keywords. */
const SHORT = /pixie|crop|buzz|short|bob|undercut/i;

export function Studio() {
  const { data, addLook, toggleFavorite, removeLook } = useApp();
  const [tab, setTab] = useState<Tab>('wig');
  const [templates, setTemplates] = useState<HairTemplate[]>([]);
  const [templatesError, setTemplatesError] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<{ blob: Blob; label: string }>();
  const [gender, setGender] = useState<'female' | 'male'>('female');
  const [hat, setHat] = useState<Blob>();
  const hatUrl = useBlobUrl(hat);
  const portrait = useImage(data.portraitKey);
  const resultUrl = useBlobUrl(result?.blob);
  const p = data.profile;

  useEffect(() => {
    let alive = true;
    (async () => {
      const all: HairTemplate[] = [];
      let token: string | undefined;
      for (let page = 0; page < 4; page++) {
        const res = await listHairTemplates(token);
        all.push(...res.templates);
        if (!res.next) break;
        token = res.next;
      }
      if (alive) setTemplates(all);
    })().catch((e) => alive && setTemplatesError(friendlyError(e)));
    return () => {
      alive = false;
    };
  }, []);

  const run = async (kind: LookKind, label: string, job: () => Promise<{ image?: Blob }>, details?: Record<string, string>) => {
    if (busy) return;
    setError(undefined);
    setBusy(label);
    setResult(undefined);
    try {
      const { image } = await job();
      if (!image) throw new Error('no image');
      setResult({ blob: image, label });
      await addLook({ kind, label, details }, image);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(undefined);
    }
  };

  const portraitKey = data.portraitKey!;
  const tryTemplate = (t: HairTemplate, kind: 'wig' | 'short') =>
    run(kind, t.title ?? 'Hairstyle', () => analyze('hairstyle', portraitKey, { template_id: t.id, hair_color: 'src' }), {
      Style: t.title ?? t.id,
      Colour: 'Your own colour',
    });

  const shortOnes = templates.filter((t) => SHORT.test(`${t.title ?? ''} ${t.category_name ?? ''}`));
  const pencil = p?.browHex ? browPencil(p.browHex) : undefined;
  const ownHex = p?.hairSampledHex ?? p?.hairHex;
  const colours = ownHex ? [{ hex: ownHex, label: 'Your colour' }, { hex: mix(ownHex, '#ffffff', 0.15), label: 'Yours, a shade lighter' }, ...COLORS] : COLORS;

  return (
    <div class="stack">
      <p class="eyebrow">Step 3 of 3</p>
      <h1>Try your options</h1>
      <p class="lede">Every preview is made from your own photo. Tap the heart on the ones you want to show your wig fitter or family.</p>

      <div class="tabs" role="tablist" aria-label="Kinds of preview">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <section role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label} class="stack">
        {tab === 'wig' && (
          <>
            <p class="muted">Styles keep your own hair colour, so you see how a wig that matches you would look.</p>
            <ErrorNote message={templatesError} />
            <TemplateGrid items={templates} busy={busy} onPick={(t) => tryTemplate(t, 'wig')} />
          </>
        )}
        {tab === 'short' && (
          <>
            <p class="muted">
              Many people cut their hair short or shave it before it falls out, because shedding is less upsetting and less
              uncomfortable when hair is short. See it first.
            </p>
            <TemplateGrid items={shortOnes.length ? shortOnes : templates} busy={busy} onPick={(t) => tryTemplate(t, 'short')} />
          </>
        )}
        {tab === 'color' && (
          <>
            <p class="muted">Wigs come in any colour. If you ever wanted to try one, now is a gentle time to play.</p>
            <div class="row">
              {colours.map((c) => (
                <button
                  key={c.hex + c.label}
                  class="btn btn-ghost"
                  disabled={Boolean(busy)}
                  onClick={() => run('color', c.label, () => analyze('hair-color', portraitKey, { color: c.hex }), { Colour: `${c.label} (${c.hex})` })}
                >
                  <Swatch hex={c.hex} label={c.label} /> {c.label}
                </button>
              ))}
            </div>
          </>
        )}
        {tab === 'hat' && (
          <>
            <p class="muted">Soft linings (cotton, bamboo, silk) are kindest to a sensitive scalp.</p>
            <fieldset class="row" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend class="small muted">The hat tool styles the result as:</legend>
              {(['female', 'male'] as const).map((g) => (
                <label key={g} class="check">
                  <input type="radio" name="gender" checked={gender === g} onChange={() => setGender(g)} />
                  <span>{g === 'female' ? 'Feminine' : 'Masculine'}</span>
                </label>
              ))}
            </fieldset>
            <PhotoPicker
              label="Photo of the hat or scarf"
              hint="Photograph one you own or like in a shop, laid flat or on a stand, or save a product photo. The whole item should be visible."
              preview={hatUrl}
              busy={Boolean(busy)}
              capture="environment"
              onPick={async (file) => {
                setError(undefined);
                try {
                  setHat((await preparePhoto(file, 1600, 512)).blob);
                } catch (e) {
                  setError(friendlyError(e));
                }
              }}
            />
            <div>
              <button
                class="btn btn-primary"
                disabled={!hat || Boolean(busy)}
                onClick={() =>
                  hat &&
                  run('hat', 'Your headwear', async () => analyze('hat', portraitKey, { ref_file_id: await uploadPhoto(hat), gender }), {
                    Headwear: 'Photographed item',
                  })
                }
              >
                Try it on
              </button>
            </div>
          </>
        )}
        {tab === 'brows' && (
          <>
            <p class="muted">
              Brows can thin during treatment. Preview fuller brows in the pencil shade that matches you, so you know what to draw.
            </p>
            {pencil ? (
              <div class="row">
                {[
                  { label: 'Natural, filled in', intensity: 45, thickness: 0 },
                  { label: 'Fuller', intensity: 60, thickness: 35 },
                  { label: 'Soft and defined', intensity: 55, thickness: 15 },
                ].map((b) => (
                  <button
                    key={b.label}
                    class="btn btn-ghost"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      run(
                        'brows',
                        `Brows: ${b.label}`,
                        () => analyze('brows', portraitKey, { color: pencil.hex, intensity: b.intensity, ...(b.thickness ? { shape: 'SoftArch1', thickness: b.thickness } : {}) }),
                        { 'Brow pencil': `${pencil.name} (${pencil.hex})` },
                      )
                    }
                  >
                    <Swatch hex={pencil.hex} label={pencil.name} /> {b.label}
                  </button>
                ))}
              </div>
            ) : (
              <p class="note">
                Measure your hair first so we know your brow colour. <a href="#/today">Go to “Your hair today”</a>.
              </p>
            )}
          </>
        )}
      </section>

      {busy && (
        <p class="note" role="status">
          Creating “{busy}” from your photo… this usually takes under a minute.
        </p>
      )}
      <ErrorNote message={error} />
      {result && portrait && resultUrl && (
        <section class="card stack" aria-live="polite">
          <h2>{result.label}</h2>
          <Compare before={portrait} after={resultUrl} alt={result.label} />
          <p class="muted small">Saved to your looks below.</p>
        </section>
      )}

      <section class="stack">
        <h2>Your looks</h2>
        {data.looks.length === 0 ? (
          <p class="muted">Previews you create appear here.</p>
        ) : (
          <div class="looks">
            {data.looks.map((l) => (
              <LookCard key={l.id} look={l} onFavorite={() => toggleFavorite(l.id)} onRemove={() => removeLook(l.id)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TemplateGrid({ items, busy, onPick }: { items: HairTemplate[]; busy?: string; onPick: (t: HairTemplate) => void }) {
  if (!items.length) return <p class="muted">Loading styles…</p>;
  return (
    <div class="tiles">
      {items.map((t) => (
        <button key={t.id} class="tile" disabled={Boolean(busy)} onClick={() => onPick(t)}>
          {t.thumb ? <img src={t.thumb} alt="" loading="lazy" /> : null}
          <span>{t.title ?? 'Style'}</span>
        </button>
      ))}
    </div>
  );
}

function LookCard({ look, onFavorite, onRemove }: { look: Look; onFavorite: () => void; onRemove: () => void }) {
  const url = useImage(look.imageKey);
  return (
    <figure class="look">
      {url && <img src={url} alt={look.label} />}
      <figcaption>
        <span>{look.label}</span>
        <span class="row" style={{ gap: 0 }}>
          <button class="icon-btn" aria-pressed={look.favorite} aria-label={look.favorite ? 'Remove from favourites' : 'Add to favourites'} onClick={onFavorite}>
            {look.favorite ? '♥' : '♡'}
          </button>
          <button class="icon-btn" aria-label={`Delete ${look.label}`} onClick={onRemove}>
            ×
          </button>
        </span>
      </figcaption>
    </figure>
  );
}
