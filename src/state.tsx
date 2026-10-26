import { createContext } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import * as store from './lib/store';
import type { CheckIn, HairProfile } from './lib/guidance';

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
  profile?: HairProfile;
  looks: Look[];
  checkins: CheckIn[];
}

interface Ctx {
  data: AppData;
  ready: boolean;
  setConsent: () => Promise<void>;
  savePhoto: (slot: 'portrait' | 'closeup', blob: Blob) => Promise<void>;
  saveProfile: (p: HairProfile) => Promise<void>;
  addLook: (look: Omit<Look, 'id' | 'at' | 'favorite' | 'imageKey'>, image: Blob) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  removeLook: (id: string) => Promise<void>;
  addCheckIn: (c: CheckIn) => Promise<void>;
  wipe: () => Promise<void>;
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

export function AppProvider({ children }: { children: ComponentChildren }) {
  const [data, setData] = useState<AppData>({ looks: [], checkins: [] });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const [consentAt, portraitKey, closeupKey, profile, looks, checkins] = await Promise.all([
        store.get<string>('kv', 'consentAt'),
        store.get<string>('kv', 'portraitKey'),
        store.get<string>('kv', 'closeupKey'),
        store.get<HairProfile>('kv', 'profile'),
        store.get<Look[]>('kv', 'looks'),
        store.all<CheckIn>('checkins'),
      ]);
      setData({ consentAt, portraitKey, closeupKey, profile, looks: looks ?? [], checkins: checkins.sort((a, b) => a.at.localeCompare(b.at)) });
      setReady(true);
    })().catch(() => setReady(true));
  }, []);

  const setConsent = useCallback(async () => {
    const at = new Date().toISOString();
    await store.put('kv', 'consentAt', at);
    setData((d) => ({ ...d, consentAt: at }));
  }, []);

  const savePhoto = useCallback(async (slot: 'portrait' | 'closeup', blob: Blob) => {
    const key = `${slot}-${store.newId()}`;
    await store.put('images', key, blob);
    const kvKey = slot === 'portrait' ? 'portraitKey' : 'closeupKey';
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

  const value = useMemo(
    () => ({ data, ready, setConsent, savePhoto, saveProfile, addLook, toggleFavorite, removeLook, addCheckIn, wipe }),
    [data, ready, setConsent, savePhoto, saveProfile, addLook, toggleFavorite, removeLook, addCheckIn, wipe],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
