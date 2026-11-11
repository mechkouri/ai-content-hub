'use client';

import type { User } from '@supabase/supabase-js';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch, MembershipWithOrg, Role } from './api';
import { isSupabaseConfigured, supabase } from './supabase';

interface AppState {
  loading: boolean;
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
  const [currentOrgId, setOrgId] = useState<string | null>(null);

  const loadMemberships = useCallback(async () => {
    try {
      const list = await apiFetch<MembershipWithOrg[]>('/organizations');
      setMemberships(list);
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
      setMemberships([]);
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
      if (data.session) await loadMemberships();
      if (active) setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session) {
        setMemberships([]);
        setOrgId(null);
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
