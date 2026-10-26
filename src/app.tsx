import { useEffect, useState } from 'preact/hooks';
import './app.css';
import { AppProvider, useApp } from './state';
import { Home } from './pages/Home';
import { Start } from './pages/Start';
import { Today } from './pages/Today';
import { Studio } from './pages/Studio';
import { Track } from './pages/Track';
import { Plan } from './pages/Plan';
import { Privacy } from './pages/Privacy';

const ROUTES = {
  '/': { title: 'Home', view: Home, nav: false },
  '/start': { title: 'Get started', view: Start, nav: false },
  '/today': { title: 'Your hair today', view: Today, nav: true },
  '/try': { title: 'Try options', view: Studio, nav: true },
  '/track': { title: 'Check-ins', view: Track, nav: true },
  '/plan': { title: 'My plan', view: Plan, nav: true },
  '/privacy': { title: 'Your data', view: Privacy, nav: false },
} as const;

type Path = keyof typeof ROUTES;

function currentPath(): Path {
  const p = location.hash.replace(/^#/, '') || '/';
  return (p in ROUTES ? p : '/') as Path;
}

function Shell() {
  const [path, setPath] = useState<Path>(currentPath);
  const { data, ready } = useApp();

  useEffect(() => {
    const onHash = () => {
      setPath(currentPath());
      window.scrollTo(0, 0);
      document.getElementById('main')?.focus();
    };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  const route = ROUTES[path];
  useEffect(() => {
    document.title = path === '/' ? 'Ahead: get ready for chemo hair loss' : `${route.title} · Ahead`;
  }, [path, route.title]);

  // Steps after the start page need consent and photos first.
  const needsSetup = ready && route.nav && (!data.consentAt || !data.portraitKey || !data.closeupKey || !data.hairlineKey);
  const View = needsSetup ? Start : route.view;

  return (
    <div class="shell">
      <a
        class="sr-only"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      <header class="topbar">
        <div class="topbar-inner">
          <a class="brand" href="#/">
            <img src="/icon.svg" alt="" width={30} height={30} />
            Ahead
          </a>
          <nav class="nav" aria-label="Main">
            {(Object.keys(ROUTES) as Path[])
              .filter((p) => ROUTES[p].nav)
              .map((p) => (
                <a key={p} href={`#${p}`} aria-current={p === path ? 'page' : undefined}>
                  {ROUTES[p].title}
                </a>
              ))}
          </nav>
        </div>
      </header>
      <main id="main" class="page" tabIndex={-1}>
        {ready ? <View /> : <p class="muted">Loading…</p>}
      </main>
      <footer class="footer">
        <div class="page">
          Ahead is not a medical device and does not give medical advice. Always talk to your care team about your treatment. ·{' '}
          <a href="#/privacy">Your data</a>
        </div>
      </footer>
    </div>
  );
}

export function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
