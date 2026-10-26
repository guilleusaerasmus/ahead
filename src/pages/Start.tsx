import { useState } from 'preact/hooks';
import { useApp, useImage, type PhotoSlot } from '../state';
import { PhotoPicker, ErrorNote } from '../components';
import { prepareCloseUp, prepareHairline, preparePortrait } from '../lib/image';
import { friendlyError } from '../lib/errors';

export function Start() {
  const { data, setConsent, savePhoto } = useApp();
  const [adult, setAdult] = useState(Boolean(data.consentAt));
  const [agree, setAgree] = useState(Boolean(data.consentAt));
  const [busy, setBusy] = useState<PhotoSlot | null>(null);
  const [error, setError] = useState<string>();
  const portrait = useImage(data.portraitKey);
  const closeup = useImage(data.closeupKey);
  const hairline = useImage(data.hairlineKey);

  const pick = (slot: PhotoSlot) => async (file: File) => {
    setError(undefined);
    setBusy(slot);
    try {
      const photo = slot === 'portrait' ? await preparePortrait(file) : slot === 'closeup' ? await prepareCloseUp(file) : await prepareHairline(file);
      await savePhoto(slot, photo.blob);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  if (!data.consentAt) {
    return (
      <div class="stack" style={{ maxWidth: '680px' }}>
        <p class="eyebrow">Before we start</p>
        <h1>Your photos, your choice</h1>
        <p class="lede">Ahead needs two photos of you. Here is exactly what happens to them.</p>
        <ul>
          <li>
            Each photo is sent to the <strong>YouCam API</strong> (Perfect Corp) only to be analysed or to create a preview.
          </li>
          <li>As soon as a result is back, Ahead asks YouCam to delete that photo and the result from its servers.</li>
          <li>Your photos and results are saved only in this browser. You can delete everything at any time.</li>
          <li>Ahead does not diagnose or treat anything. For anything about your health, ask your care team.</li>
        </ul>
        <form
          class="card stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (adult && agree) void setConsent();
          }}
        >
          <label class="check">
            <input type="checkbox" checked={adult} onChange={(e) => setAdult((e.currentTarget as HTMLInputElement).checked)} />
            <span>I am 18 or older.</span>
          </label>
          <label class="check">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree((e.currentTarget as HTMLInputElement).checked)} />
            <span>I agree to my photos being processed by the YouCam API as described above, and I will only use photos of myself.</span>
          </label>
          <div>
            <button class="btn btn-primary" type="submit" disabled={!adult || !agree}>
              Continue
            </button>
          </div>
        </form>
      </div>
    );
  }

  const ready = Boolean(data.portraitKey && data.closeupKey && data.hairlineKey);
  return (
    <div class="stack">
      <p class="eyebrow">Step 1 of 3</p>
      <h1>Three photos</h1>
      <p class="lede">Daylight from a window works best. No hat, glasses off, hair as you usually wear it.</p>
      <ErrorNote message={error} />
      <div class="grid grid-2">
        <PhotoPicker
          label="Head and shoulders"
          hint={<>Hold the phone at eye level, about an arm’s length away. Both shoulders in the frame. Used for wigs, hats and brows.</>}
          preview={portrait}
          busy={busy !== null}
          onPick={pick('portrait')}
        />
        <PhotoPicker
          label="Close-up of your face"
          hint={<>Your face should fill most of the photo, looking straight ahead, eyes open, mouth closed. Used for colour and skin.</>}
          preview={closeup}
          busy={busy !== null}
          onPick={pick('closeup')}
        />
        <PhotoPicker
          label="Your hairline"
          hint={<>Face the camera, then tilt your head down about 45° so your parting and hairline show. Hair loose. Used to measure how full your hair is.</>}
          preview={hairline}
          busy={busy !== null}
          onPick={pick('hairline')}
        />
      </div>
      {busy && <p class="muted">Preparing photo…</p>}
      <div class="row">
        <a class={`btn btn-primary`} href="#/today" aria-disabled={!ready} onClick={(e) => !ready && e.preventDefault()}>
          Measure my hair
        </a>
        {!ready && <span class="muted small">Add all three photos to continue.</span>}
      </div>
    </div>
  );
}
