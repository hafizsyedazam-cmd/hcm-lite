"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut as fbSignOut } from "firebase/auth";
import { auth } from "@/lib/client/firebase";
import { api } from "@/lib/client/api";
import type { Me } from "@/lib/shared/types";

interface AuthState {
  me: Me | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  me: null,
  loading: true,
  error: null,
  refresh: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    if (!auth.currentUser) {
      setMe(null);
      return;
    }
    try {
      setMe(await api<Me>("/me"));
      setError(null);
    } catch (e) {
      // Deactivated or unknown accounts are signed out straight away.
      setMe(null);
      setError((e as Error).message);
      await fbSignOut(auth);
    }
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, async () => {
      setLoading(true);
      await loadMe();
      setLoading(false);
    });
  }, [loadMe]);

  const signOut = useCallback(async () => {
    await fbSignOut(auth);
    setMe(null);
  }, []);

  return <AuthContext.Provider value={{ me, loading, error, refresh: loadMe, signOut }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
