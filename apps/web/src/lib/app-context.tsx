'use client';

import type { User } from '@supabase/supabase-js';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { apiFetch, MembershipWithOrg, Role } from './api';
import { isSupabaseConfigured, supabase } from './supabase';

/** Whether the list of the user's organizations has been fetched. An empty list only means "new user" once it is ready. */
export type MembershipsStatus = 'idle' | 'loading' | 'ready' | 'error';

interface AppState {
  loading: boolean;
  membershipsStatus: MembershipsStatus;
  user: User | null;
  memberships: MembershipWithOrg[];
  currentOrgId: string | null;
  currentRole: Role | null;
  setCurrentOrg: (id: string) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);
const ORG_KEY = 'aich.currentOrg';

export function AppProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<MembershipWithOrg[]>([]);
  const [status, setStatus] = useState<MembershipsStatus>('idle');
  const loadedFor = useRef<string | null>(null);
  const [currentOrgId, setOrgId] = useState<string | null>(null);

  const loadMemberships = useCallback(async () => {
    setStatus((s) => (s === 'ready' ? s : 'loading'));
    try {
      const list = await apiFetch<MembershipWithOrg[]>('/organizations');
      setMemberships(list);
      setStatus('ready');
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(ORG_KEY);
      } catch {}
      setOrgId((cur) => {
        const wanted = cur ?? saved;
        return list.some((m) => m.organizationId === wanted)
          ? wanted
          : (list[0]?.organizationId ?? null);
      });
    } catch {
      // A failed request is not "no organizations": keep what we had and let the app offer a retry,
      // instead of sending someone who already has an organization to create a new one.
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    const sb = supabase();
    let active = true;
    sb.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      if (data.session) {
        loadedFor.current = data.session.user.id;
        await loadMemberships();
      }
      if (active) setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session) {
        loadedFor.current = null;
        setMemberships([]);
        setOrgId(null);
        setStatus('idle');
      } else if (loadedFor.current !== session.user.id) {
        // Just signed in: fetch the organizations before anyone decides this user has none.
        loadedFor.current = session.user.id;
        setStatus('loading');
        void loadMemberships();
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadMemberships]);

  const setCurrentOrg = (id: string) => {
    setOrgId(id);
    try {
      localStorage.setItem(ORG_KEY, id);
    } catch {}
  };

  const value: AppState = {
    loading,
    membershipsStatus: status,
    user,
    memberships,
    currentOrgId,
    currentRole: memberships.find((m) => m.organizationId === currentOrgId)?.role ?? null,
    setCurrentOrg,
    refresh: loadMemberships,
    signOut: async () => {
      await supabase().auth.signOut();
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
