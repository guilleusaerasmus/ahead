import { useApp } from '../state';
import { SOURCES } from '../lib/guidance';

export function Home() {
  const { data } = useApp();
  const started = Boolean(data.consentAt && data.portraitKey && data.closeupKey && data.hairlineKey);
  return (
    <div class="stack">
      <section>
        <p class="eyebrow">For people starting chemotherapy</p>
        <h1>Lose your hair on your own terms.</h1>
        <p class="lede">
          Hair loss usually starts two to three weeks after the first chemo cycle. Ahead uses that time: it measures your hair today so a
          wig can look like <em>you</em>, lets you try wigs, a shorter cut, hats and brows on your own photo, and follows your hair and
          skin week by week.
        </p>
        <div class="row">
          <a class="btn btn-primary" href={started ? '#/today' : '#/start'}>
            {started ? 'Continue' : 'Get started'}
          </a>
          <a class="btn btn-ghost" href="#/privacy">
            How your photos are handled
          </a>
        </div>
        <p class="muted small" style={{ marginTop: '12px' }}>
          Timing from the <a href={SOURCES.hairLoss.url}>{SOURCES.hairLoss.label}</a>.
        </p>
      </section>

      <section class="grid grid-3" aria-label="What Ahead does">
        <article class="card">
          <p class="eyebrow">1 · Before</p>
          <h3>Your hair, on a card</h3>
          <p class="muted">
            Colour, length and density measured from two photos, translated into what a wig fitter asks for: shade, length and cap
            density. Plus the brow pencil shade that matches you.
          </p>
        </article>
        <article class="card">
          <p class="eyebrow">2 · Decide</p>
          <h3>See it before you choose</h3>
          <p class="muted">
            Try wigs in your own colour, the short cut many people choose before shedding starts, a new colour, soft hats and fuller
            brows, all on your photo. Keep the ones you like.
          </p>
        </article>
        <article class="card">
          <p class="eyebrow">3 · During</p>
          <h3>A weekly check-in</h3>
          <p class="muted">
            A quick photo tracks hair density and skin hydration, redness, smoothness and radiance, with gentle care tips from cancer
            charities and a clear nudge to tell your care team when something needs attention.
          </p>
        </article>
      </section>

      <section class="note">
        <strong>What Ahead is not.</strong> It does not diagnose anything, does not recommend treatments and is not a substitute for your
        oncology team. Photos are sent to the YouCam API only to be analysed, and we ask YouCam to delete them as soon as each result is
        back. Your results stay on this device.
      </section>
    </div>
  );
}
