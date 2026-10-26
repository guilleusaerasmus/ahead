import { useApp, useImage, type Look } from '../state';
import { Swatch } from '../components';
import { browPencil, wigDensity, wigLength, SOURCES } from '../lib/guidance';

export function Plan() {
  const { data } = useApp();
  const p = data.profile;
  const favourites = data.looks.filter((l) => l.favorite);
  const pencil = p?.browHex ? browPencil(p.browHex) : undefined;
  const last = data.checkins[data.checkins.length - 1];

  return (
    <div class="stack">
      <div class="row no-print" style={{ justifyContent: 'space-between' }}>
        <div>
          <p class="eyebrow">Bring it with you</p>
          <h1>My plan</h1>
        </div>
        <button class="btn btn-primary" onClick={() => print()}>
          Print or save as PDF
        </button>
      </div>
      <p class="lede no-print">One page for your wig fitter, hairdresser or the person helping you. Only your favourite looks are included.</p>

      <section class="card">
        <h2>Hair card</h2>
        {p ? (
          <dl class="spec">
            {(p.hairSampledHex || p.hairHex) && (
              <>
                <dt>Colour</dt>
                <dd>
                  <Swatch hex={(p.hairSampledHex ?? p.hairHex)!} label="Hair colour" /> {p.hairColorName} ({p.hairSampledHex ?? p.hairHex})
                </dd>
              </>
            )}
            {p.length && (
              <>
                <dt>Length</dt>
                <dd>{wigLength(p.length)}</dd>
              </>
            )}
            {p.densityTerm && (
              <>
                <dt>Cap density</dt>
                <dd>{wigDensity(p.densityTerm)}</dd>
              </>
            )}
            {pencil && (
              <>
                <dt>Brow pencil</dt>
                <dd>
                  <Swatch hex={pencil.hex} label="Brow pencil" /> {pencil.name} ({pencil.hex})
                </dd>
              </>
            )}
            <dt>Measured</dt>
            <dd>{new Date(p.measuredAt).toLocaleDateString()}</dd>
          </dl>
        ) : (
          <p class="muted">
            Not measured yet. <a href="#/today">Measure your hair</a>.
          </p>
        )}
      </section>

      <section class="card stack">
        <h2>Looks I like</h2>
        {favourites.length ? (
          <div class="looks">
            {favourites.map((l) => (
              <PlanLook key={l.id} look={l} />
            ))}
          </div>
        ) : (
          <p class="muted">
            Tap ♡ on a preview in <a href="#/try">Try options</a> to add it here.
          </p>
        )}
      </section>

      {last && (
        <section class="card">
          <h2>Latest check-in</h2>
          <p>
            {new Date(last.at).toLocaleDateString()}
            {last.densityTerm ? ` · hair density: ${last.densityTerm.toLowerCase()}` : ''}
          </p>
        </section>
      )}

      <section class="card">
        <h2>Questions to ask</h2>
        <ul>
          <li>Can I get a prescription for a wig, and will my insurance cover part of it?</li>
          <li>Is scalp cooling an option with my treatment?</li>
          <li>Which skin products do you recommend during treatment?</li>
        </ul>
        <p class="small muted">
          Based on <a href={SOURCES.hairLoss.url}>{SOURCES.hairLoss.label}</a> and <a href={SOURCES.skin.url}>{SOURCES.skin.label}</a>.
        </p>
      </section>
    </div>
  );
}

function PlanLook({ look }: { look: Look }) {
  const url = useImage(look.imageKey);
  return (
    <figure class="look">
      {url && <img src={url} alt={look.label} />}
      <figcaption style={{ display: 'block' }}>
        <strong>{look.label}</strong>
        {look.details &&
          Object.entries(look.details).map(([k, v]) => (
            <div key={k} class="small muted">
              {k}: {v}
            </div>
          ))}
      </figcaption>
    </figure>
  );
}
