import { createContext } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import * as store from './lib/store';
import type { CheckIn, HairProfile } from './lib/guidance';

export type PhotoSlot = 'portrait' | 'closeup' | 'hairline';

export type LookKind = 'wig' | 'short' | 'color' | 'hat' | 'brows';

export interface Look {
  id: string;
  kind: LookKind;
  label: string;
  imageKey: string;
  at: string;
  favorite: boolean;
  /** Extra facts to print on the plan, e.g. a colour hex or brow pencil shade. */
  details?: Record<string, string>;
}

export interface AppData {
  consentAt?: string;
  portraitKey?: string;
  closeupKey?: string;
  /** Head tilted ~45° down so the hairline and parting show; used for hair density. */
  hairlineKey?: string;
  profile?: HairProfile;
  looks: Look[];
  checkins: CheckIn[];
  /** Set when the app shows the built-in demo persona instead of the visitor's own data. */
  demoNote?: string;
}

interface Ctx {
  data: AppData;
  ready: boolean;
  setConsent: () => Promise<void>;
  savePhoto: (slot: PhotoSlot, blob: Blob) => Promise<void>;
  saveProfile: (p: HairProfile) => Promise<void>;
  addLook: (look: Omit<Look, 'id' | 'at' | 'favorite' | 'imageKey'>, image: Blob) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  removeLook: (id: string) => Promise<void>;
  addCheckIn: (c: CheckIn) => Promise<void>;
  wipe: () => Promise<void>;
  loadDemo: () => Promise<void>;
}

const AppContext = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp outside provider');
  return ctx;
}

/** Loads a stored image as an object URL and revokes it when the component unmounts. */
export function useImage(key?: string): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!key) return setUrl(undefined);
    let objectUrl: string | undefined;
    let alive = true;
    store.get<Blob>('images', key).then((blob) => {
      if (!alive || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key]);
  return url;
}

interface DemoFile {
  note: string;
  photos: Record<PhotoSlot, string>;
  profile: HairProfile;
  checkins: CheckIn[];
  looks: Array<{ kind: LookKind; label: string; image: string; favorite: boolean; details?: Record<string, string> }>;
}

export function AppProvider({ children }: { children: ComponentChildren }) {
  const [data, setData] = useState<AppData>({ looks: [], checkins: [] });
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
      const [consentAt, portraitKey, closeupKey, hairlineKey, profile, looks, checkins, demoNote] = await Promise.all([
        store.get<string>('kv', 'consentAt'),
        store.get<string>('kv', 'portraitKey'),
        store.get<string>('kv', 'closeupKey'),
        store.get<string>('kv', 'hairlineKey'),
        store.get<HairProfile>('kv', 'profile'),
        store.get<Look[]>('kv', 'looks'),
        store.all<CheckIn>('checkins'),
        store.get<string>('kv', 'demoNote'),
      ]);
      setData({ consentAt, portraitKey, closeupKey, hairlineKey, profile, looks: looks ?? [], checkins: checkins.sort((a, b) => a.at.localeCompare(b.at)), demoNote });
  }, []);

  useEffect(() => {
    load().finally(() => setReady(true));
  }, [load]);

  const setConsent = useCallback(async () => {
    const at = new Date().toISOString();
    await store.put('kv', 'consentAt', at);
    setData((d) => ({ ...d, consentAt: at }));
  }, []);

  const savePhoto = useCallback(async (slot: PhotoSlot, blob: Blob) => {
    const key = `${slot}-${store.newId()}`;
    await store.put('images', key, blob);
    const kvKey = `${slot}Key` as const;
    const previous = await store.get<string>('kv', kvKey);
    await store.put('kv', kvKey, key);
    if (previous) await store.del('images', previous);
    setData((d) => ({ ...d, [kvKey]: key }));
  }, []);

  const saveProfile = useCallback(async (p: HairProfile) => {
    await store.put('kv', 'profile', p);
    setData((d) => ({ ...d, profile: p }));
  }, []);

  const persistLooks = async (looks: Look[]) => {
    await store.put('kv', 'looks', looks);
    setData((d) => ({ ...d, looks }));
  };

  const addLook = useCallback(
    async (look: Omit<Look, 'id' | 'at' | 'favorite' | 'imageKey'>, image: Blob) => {
      const id = store.newId();
      const imageKey = `look-${id}`;
      await store.put('images', imageKey, image);
      const current = (await store.get<Look[]>('kv', 'looks')) ?? [];
      await persistLooks([{ ...look, id, imageKey, at: new Date().toISOString(), favorite: false }, ...current]);
    },
    [],
  );

  const toggleFavorite = useCallback(async (id: string) => {
    const current = (await store.get<Look[]>('kv', 'looks')) ?? [];
    await persistLooks(current.map((l) => (l.id === id ? { ...l, favorite: !l.favorite } : l)));
  }, []);

  const removeLook = useCallback(async (id: string) => {
    const current = (await store.get<Look[]>('kv', 'looks')) ?? [];
    const look = current.find((l) => l.id === id);
    if (look) await store.del('images', look.imageKey);
    await persistLooks(current.filter((l) => l.id !== id));
  }, []);

  const addCheckIn = useCallback(async (c: CheckIn) => {
    await store.put('checkins', c.id, c);
    setData((d) => ({ ...d, checkins: [...d.checkins, c].sort((a, b) => a.at.localeCompare(b.at)) }));
  }, []);

  const wipe = useCallback(async () => {
    await store.wipeAll();
    setData({ looks: [], checkins: [] });
  }, []);

  /**
   * Replaces whatever is on this device with the demo persona: real YouCam results computed on
   * AI-generated photos, shipped as static files, so trying the app costs no API units.
   */
  const loadDemo = useCallback(async () => {
    const res = await fetch('/demo/demo.json');
    if (!res.ok) throw new Error('demo_missing');
    const demo = (await res.json()) as DemoFile;
    const image = async (name: string) => {
      const r = await fetch(`/demo/${name}`);
      if (!r.ok) throw new Error('demo_image_missing');
      return r.blob();
    };
    await store.wipeAll();
    for (const [slot, name] of Object.entries(demo.photos)) {
      const key = `${slot}-demo`;
      await store.put('images', key, await image(name));
      await store.put('kv', `${slot}Key`, key);
    }
    const looks: Look[] = [];
    for (const [i, l] of demo.looks.entries()) {
      const imageKey = `look-demo-${i}`;
      await store.put('images', imageKey, await image(l.image));
      looks.push({ id: `demo-${i}`, kind: l.kind, label: l.label, imageKey, at: demo.profile.measuredAt, favorite: l.favorite, details: l.details });
    }
    for (const c of demo.checkins) await store.put('checkins', c.id, { id: c.id, at: c.at, density: c.density, densityTerm: c.densityTerm, skin: c.skin });
    await Promise.all([
      store.put('kv', 'looks', looks),
      store.put('kv', 'profile', demo.profile),
      store.put('kv', 'consentAt', new Date().toISOString()),
      store.put('kv', 'demoNote', demo.note),
    ]);
    await load();
  }, [load]);

  const value = useMemo(
    () => ({ data, ready, setConsent, savePhoto, saveProfile, addLook, toggleFavorite, removeLook, addCheckIn, wipe, loadDemo }),
    [data, ready, setConsent, savePhoto, saveProfile, addLook, toggleFavorite, removeLook, addCheckIn, wipe, loadDemo],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
