import { useState } from 'preact/hooks';
import { useApp } from '../state';
import { ErrorNote, PhotoPicker, Progress, useBlobUrl, type StepState } from '../components';
import { analyze, readDensity, readSkin } from '../lib/run';
import { friendlyError } from '../lib/errors';
import { prepareCloseUp, prepareHairline } from '../lib/image';
import * as store from '../lib/store';
import { CARE_TIPS, CONCERN_LABEL, MEANINGFUL_CHANGE, SOURCES, skinTrends, type CheckIn, type SkinConcern } from '../lib/guidance';

export function Track() {
  const { data, addCheckIn } = useApp();
  const [hairline, setHairline] = useState<Blob>();
  const [closeup, setCloseup] = useState<Blob>();
  const [steps, setSteps] = useState<{ skin: StepState; density: StepState }>({ skin: 'idle', density: 'idle' });
  const [error, setError] = useState<string>();
  const running = steps.skin === 'run' || steps.density === 'run';
  const hairlineUrl = useBlobUrl(hairline);
  const closeupUrl = useBlobUrl(closeup);

  const prepare = (kind: 'hairline' | 'closeup') => async (file: File) => {
    setError(undefined);
    try {
      const p = kind === 'hairline' ? await prepareHairline(file) : await prepareCloseUp(file);
      if (kind === 'hairline') setHairline(p.blob);
      else setCloseup(p.blob);
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const checkIn = async () => {
    if (!hairline && !closeup) return;
    setError(undefined);
    const entry: CheckIn = { id: store.newId(), at: new Date().toISOString() };
    const errors: string[] = [];
    // Check-in photos are only kept long enough to analyse them.
    const tmp: string[] = [];
    const stash = async (blob: Blob) => {
      const key = `tmp-${store.newId()}`;
      await store.put('images', key, blob);
      tmp.push(key);
      return key;
    };
    setSteps({ skin: closeup ? 'run' : 'idle', density: hairline ? 'run' : 'idle' });
    const jobs: Array<Promise<void>> = [];
    if (closeup) {
      const key = await stash(closeup);
      jobs.push(
        analyze('skin', key).then(
          ({ results }) => {
            entry.skin = readSkin(results);
            setSteps((s) => ({ ...s, skin: 'ok' }));
          },
          (e) => {
            errors.push(friendlyError(e));
            setSteps((s) => ({ ...s, skin: 'err' }));
          },
        ),
      );
    }
    if (hairline) {
      const key = await stash(hairline);
      jobs.push(
        analyze('hair-density', key).then(
          ({ results }) => {
            const d = readDensity(results);
            entry.density = d.density;
            entry.densityTerm = d.term;
            setSteps((s) => ({ ...s, density: 'ok' }));
          },
          (e) => {
            errors.push(friendlyError(e, 'hair-density'));
            setSteps((s) => ({ ...s, density: 'err' }));
          },
        ),
      );
    }
    await Promise.all(jobs);
    await Promise.all(tmp.map((k) => store.del('images', k)));
    if (errors.length) setError([...new Set(errors)].join(' '));
    if (entry.skin || entry.density !== undefined) {
      await addCheckIn(entry);
      setHairline(undefined);
      setCloseup(undefined);
    }
  };

  const trends = skinTrends(data.checkins);
  const worst = [...trends].sort((a, b) => a.change - b.change).find((t) => t.change <= -MEANINGFUL_CHANGE);
  const densityPoints = data.checkins.filter((c) => c.density !== undefined);

  return (
    <div class="stack">
      <p class="eyebrow">During treatment</p>
      <h1>Weekly check-in</h1>
      <p class="lede">Same place, same light, once a week. Ahead follows your hair density and how your skin is doing.</p>

      <div class="grid grid-2">
        <PhotoPicker label="Your hairline" hint="Tilt your head down about 45° so your parting shows. For hair density." preview={hairlineUrl} busy={running} onPick={prepare('hairline')} />
        <PhotoPicker label="Close-up of your face" hint="For hydration, redness, smoothness and radiance." preview={closeupUrl} busy={running} onPick={prepare('closeup')} />
      </div>
      <div class="card stack">
        <Progress
          steps={[
            { label: 'Hair density', state: steps.density },
            { label: 'Skin', state: steps.skin },
          ]}
        />
        <button class="btn btn-primary" onClick={checkIn} disabled={running || (!hairline && !closeup)}>
          {running ? 'Analysing…' : 'Save this week’s check-in'}
        </button>
        <p class="muted small">Check-in photos are analysed and then deleted, here and on YouCam. Only the numbers are kept.</p>
      </div>
      <ErrorNote message={error} />

      <section class="card stack">
        <h2>Hair density over time</h2>
        {densityPoints.length < 2 ? (
          <p class="muted">Your first reading is your baseline. After the next check-in you will see the trend here.</p>
        ) : (
          <>
            <LineChart points={densityPoints.map((c) => ({ at: c.at, value: c.density! }))} max={3} label="Hair density (0–3)" />
            <p class="muted">
              Many people choose to cut their hair short or shave it once shedding starts; it is often less uncomfortable. You can preview
              a short cut in <a href="#/try">Try options</a>. Source: <a href={SOURCES.hairLoss.url}>{SOURCES.hairLoss.label}</a>.
            </p>
          </>
        )}
      </section>

      <section class="card stack">
        <h2>Skin</h2>
        {trends.length === 0 ? (
          <p class="muted">Add a close-up in two check-ins to see how your skin is changing.</p>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <caption class="sr-only">Skin scores, first and latest check-in</caption>
              <thead>
                <tr class="muted small" style={{ textAlign: 'left' }}>
                  <th>Area</th>
                  <th>First</th>
                  <th>Latest</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {trends.map((t) => (
                  <tr key={t.concern} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ padding: '8px 0' }}>{CONCERN_LABEL[t.concern]}</td>
                    <td>{t.first}</td>
                    <td>{t.last}</td>
                    <td>
                      {t.change > 0 ? '+' : ''}
                      {t.change.toFixed(1)}{' '}
                      <span class="muted small">
                        {Math.abs(t.change) < MEANINGFUL_CHANGE ? '· within normal photo variation' : t.change < 0 ? '· noticeably lower' : '· noticeably higher'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p class="muted small">
              Scores are YouCam’s raw scores (1–100, higher looks healthier). The same face photographed in different light or framing moves
              by up to about 3 points, so we only call a change noticeable when it is larger than {MEANINGFUL_CHANGE} points.
            </p>
            {worst && <CareTips concern={worst.concern} />}
          </>
        )}
        <div class="note">
          <strong>Tell your care team</strong> if itching keeps you from sleeping for more than 2 days, if you have bruises that do not go away
          within a week, or any new or worsening rash, or open, bleeding or blistered skin. Source:{' '}
          <a href={SOURCES.skin.url}>{SOURCES.skin.label}</a>.
        </div>
      </section>
    </div>
  );
}

function CareTips({ concern }: { concern: SkinConcern }) {
  const t = CARE_TIPS[concern];
  return (
    <div>
      <h3>Gentle care for {CONCERN_LABEL[concern].toLowerCase()}</h3>
      <ul>
        {t.tips.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
      <p class="small muted">
        Source: <a href={t.source.url}>{t.source.label}</a>. Ask your care team before trying new products.
      </p>
    </div>
  );
}

function LineChart({ points, max, label }: { points: Array<{ at: string; value: number }>; max: number; label: string }) {
  const w = 600;
  const h = 200;
  const pad = 32;
  const t0 = new Date(points[0].at).getTime();
  const t1 = Math.max(new Date(points[points.length - 1].at).getTime(), t0 + 1);
  const x = (at: string) => pad + ((new Date(at).getTime() - t0) / (t1 - t0)) * (w - 2 * pad);
  const y = (v: number) => h - pad - (v / max) * (h - 2 * pad);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.at).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  return (
    <svg class="chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label}: ${points.map((p) => `${new Date(p.at).toLocaleDateString()} ${p.value}`).join(', ')}`}>
      <line class="axis" x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} />
      <line class="axis" x1={pad} y1={pad} x2={pad} y2={h - pad} />
      <text x={4} y={pad + 4}>
        {max}
      </text>
      <text x={4} y={h - pad + 4}>
        0
      </text>
      <path d={d} fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round" />
      {points.map((p) => (
        <circle key={p.at} cx={x(p.at)} cy={y(p.value)} r="5" fill="var(--accent)" />
      ))}
      <text x={pad} y={h - 8}>
        {new Date(points[0].at).toLocaleDateString()}
      </text>
      <text x={w - pad} y={h - 8} text-anchor="end">
        {new Date(points[points.length - 1].at).toLocaleDateString()}
      </text>
    </svg>
  );
}
