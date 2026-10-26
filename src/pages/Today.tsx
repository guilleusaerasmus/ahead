import { useState } from 'preact/hooks';
import { useApp } from '../state';
import { ErrorNote, Progress, Swatch, type StepState } from '../components';
import { analyze, readDensity, readLength, readTone } from '../lib/run';
import { friendlyError } from '../lib/errors';
import { browPencil, hairShadeName, wigDensity, wigLength, SOURCES, type HairProfile } from '../lib/guidance';
import { newId } from '../lib/store';
import { HairShade } from './HairShade';

type Step = 'tone' | 'length' | 'density';
const LABELS: Record<Step, string> = {
  tone: 'Hair, brow and skin colour',
  length: 'Hair length',
  density: 'Hair density',
};

export function Today() {
  const { data, saveProfile, addCheckIn } = useApp();
  const [steps, setSteps] = useState<Record<Step, StepState>>({ tone: 'idle', length: 'idle', density: 'idle' });
  const [error, setError] = useState<string>();
  const running = Object.values(steps).includes('run');
  const p = data.profile;

  const measure = async () => {
    if (!data.portraitKey || !data.closeupKey || !data.hairlineKey) return;
    setError(undefined);
    setSteps({ tone: 'run', length: 'run', density: 'run' });
    const profile: HairProfile = { measuredAt: new Date().toISOString() };
    const mark = (s: Step, state: StepState) => setSteps((prev) => ({ ...prev, [s]: state }));
    const errors: string[] = [];
    const jobs: Array<Promise<void>> = [
      analyze('tone', data.closeupKey).then(
        ({ results }) => (Object.assign(profile, readTone(results)), mark('tone', 'ok')),
        (e) => (errors.push(friendlyError(e)), mark('tone', 'err')),
      ),
      analyze('hair-length', data.portraitKey).then(
        ({ results }) => ((profile.length = readLength(results)), mark('length', 'ok')),
        (e) => (errors.push(friendlyError(e)), mark('length', 'err')),
      ),
      analyze('hair-density', data.hairlineKey).then(
        ({ results }) => {
          const d = readDensity(results);
          profile.density = d.density;
          profile.densityTerm = d.term;
          mark('density', 'ok');
        },
        (e) => (errors.push(friendlyError(e, 'hair-density')), mark('density', 'err')),
      ),
    ];
    await Promise.all(jobs);
    if (errors.length) setError([...new Set(errors)].join(' '));
    if (profile.hairHex || profile.length || profile.density !== undefined) {
      await saveProfile({ ...data.profile, ...profile });
      // The first density reading is the baseline for weekly check-ins.
      if (profile.density !== undefined && !data.checkins.some((c) => c.density !== undefined)) {
        await addCheckIn({ id: newId(), at: profile.measuredAt, density: profile.density, densityTerm: profile.densityTerm });
      }
    }
  };

  const pencil = p?.browHex ? browPencil(p.browHex) : undefined;

  return (
    <div class="stack">
      <p class="eyebrow">Step 2 of 3</p>
      <h1>Your hair today</h1>
      <p class="lede">
        A wig looks most like you when it matches your colour, length and fullness. We measure them now, while your hair is still yours
        to measure.
      </p>

      {!p && (
        <div class="card stack">
          <Progress steps={(Object.keys(LABELS) as Step[]).map((s) => ({ label: LABELS[s], state: steps[s] }))} />
          <button class="btn btn-primary" onClick={measure} disabled={running}>
            {running ? 'Measuring…' : 'Measure my hair'}
          </button>
          <p class="muted small">Takes about a minute. Uses your two photos.</p>
        </div>
      )}
      <ErrorNote message={error} />

      {p && (
        <>
          <section class="card" aria-labelledby="spec-title">
            <p class="eyebrow">Take this to your wig fitter</p>
            <h2 id="spec-title">Your hair card</h2>
            <dl class="spec">
              {(p.hairSampledHex || p.hairHex) && (
                <>
                  <dt>Colour</dt>
                  <dd>
                    <Swatch hex={p.hairSampledHex ?? p.hairHex!} label="Hair colour" />
                    {p.hairSampledHex ? hairShadeName(p.hairSampledHex) : 'Tap your hair below to record your exact shade'}
                    <span class="muted small">
                      {p.hairSampledHex ? `${p.hairSampledHex}` : ''}
                      {p.hairColorName ? ` · automatic family: ${p.hairColorName.toLowerCase()}` : ''}
                    </span>
                  </dd>
                </>
              )}
              {p.length && (
                <>
                  <dt>Length</dt>
                  <dd>
                    {wigLength(p.length)} <span class="muted small">(measured: {p.length})</span>
                  </dd>
                </>
              )}
              {p.densityTerm && (
                <>
                  <dt>Cap density</dt>
                  <dd>
                    {wigDensity(p.density, p.densityTerm)} <span class="muted small">(measured: {p.density !== undefined ? `${p.density.toFixed(2)} of 3, ` : ''}{p.densityTerm.toLowerCase()})</span>
                  </dd>
                </>
              )}
              {pencil && p.browHex && (
                <>
                  <dt>Brow pencil</dt>
                  <dd>
                    <Swatch hex={pencil.hex} label="Suggested brow pencil" />
                    {pencil.name} <span class="muted small">{pencil.hex} · your brows now: {p.browHex}</span>
                  </dd>
                </>
              )}
              {p.skinHex && (
                <>
                  <dt>Skin tone</dt>
                  <dd>
                    <Swatch hex={p.skinHex} label="Skin tone" />
                    <span class="muted small">{p.skinHex} · useful when choosing wig and scarf colours</span>
                  </dd>
                </>
              )}
            </dl>
            <p class="muted small" style={{ marginTop: '16px' }}>
              Measured {new Date(p.measuredAt).toLocaleDateString()} from your photos. Colours on screens vary: hold your own hair next to
              the wig in daylight to confirm.
            </p>
          </section>

          {data.portraitKey && (
            <section class="card stack">
              <h3>Pick your exact shade</h3>
              <p class="muted">The analysis gives a colour family. Wigs come in many shades within it, so tap your hair to record yours.</p>
              <HairShade photoKey={data.portraitKey} value={p.hairSampledHex} onPick={(hex) => void saveProfile({ ...p, hairSampledHex: hex })} />
            </section>
          )}

          <section class="grid grid-2">
            <div class="card">
              <h3>Ask about these early</h3>
              <ul class="muted">
                <li>A wig prescription: wigs may be partly covered by health insurance.</li>
                <li>Whether scalp cooling is an option for your treatment.</li>
              </ul>
              <p class="small">
                Source: <a href={SOURCES.hairLoss.url}>{SOURCES.hairLoss.label}</a>
              </p>
            </div>
            <div class="card">
              <h3>Next</h3>
              <p class="muted">Try wigs in your colour, a shorter cut, hats and brows on your own photo.</p>
              <div class="row">
                <a class="btn btn-primary" href="#/try">
                  Try options
                </a>
                <button class="btn btn-ghost" onClick={measure} disabled={running}>
                  Measure again
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
