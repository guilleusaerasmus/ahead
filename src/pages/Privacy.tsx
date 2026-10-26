import { useState } from 'preact/hooks';
import { useApp } from '../state';

export function Privacy() {
  const { wipe, data } = useApp();
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const hasData = Boolean(data.consentAt || data.looks.length || data.checkins.length || data.profile);

  return (
    <div class="stack" style={{ maxWidth: '720px' }}>
      <p class="eyebrow">Your data</p>
      <h1>How Ahead handles your photos</h1>
      <div class="card stack">
        <div>
          <h3>What is sent, and to whom</h3>
          <p class="muted">
            When you measure, preview or check in, the photo goes to the YouCam API by Perfect Corp, which analyses it or creates the
            preview. Our server only passes the request along with our API key; it does not store your photos.
          </p>
        </div>
        <div>
          <h3>Deleted after use</h3>
          <p class="muted">
            As soon as each result is ready, Ahead asks YouCam to delete the task, which removes the uploaded photo and the generated output
            from their servers. Check-in photos are not kept anywhere; only the numbers are saved.
          </p>
        </div>
        <div>
          <h3>Stored only on this device</h3>
          <p class="muted">Your two photos, your previews and your check-ins are stored in this browser. Clearing it deletes them.</p>
        </div>
        <div>
          <h3>Who it is for</h3>
          <p class="muted">Adults (18+) using photos of themselves. Ahead does not diagnose or treat any condition.</p>
        </div>
      </div>

      <section class="card stack">
        <h2>Delete everything</h2>
        {done ? (
          <p role="status">Everything on this device has been deleted.</p>
        ) : !hasData ? (
          <p class="muted">There is nothing stored on this device.</p>
        ) : confirm ? (
          <div class="row">
            <span>This removes your photos, previews and check-ins from this device. It cannot be undone.</span>
            <button
              class="btn btn-primary"
              onClick={async () => {
                await wipe();
                setDone(true);
              }}
            >
              Yes, delete everything
            </button>
            <button class="btn btn-ghost" onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <div>
            <button class="btn btn-ghost" onClick={() => setConfirm(true)}>
              Delete all my data
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
