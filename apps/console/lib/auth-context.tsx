"use client";

// Auth storage tradeoff (see apps/console/README.md for the full note): the JWT is kept in
// localStorage rather than an httpOnly cookie. The API contract (docs/API_CONTRACT.md) is a
// stateless `Authorization: Bearer <jwt>` scheme served from a different origin
// (localhost:3001) than the console (localhost:3000) with no cookie/session support
// documented, so an httpOnly cookie set by the console couldn't be attached to those
// cross-origin API calls without additional proxying that isn't part of the contract.
// localStorage is simpler and matches the contract as given; the real tradeoff is XSS
// exposure, which a production build should close by putting a same-origin BFF route in
// front of the API and switching this file to httpOnly cookies.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "./api-client";
import type { AuthUser, LoginResponse } from "./types";

const TOKEN_KEY = "gbt_console_token";
const USER_KEY = "gbt_console_user";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const storedToken = window.localStorage.getItem(TOKEN_KEY);
      const storedUser = window.localStorage.getItem(USER_KEY);
      // Deliberate one-time hydration from localStorage, which only exists client-side —
      // a lazy useState initializer would run during SSR too and mismatch on hydrate, so
      // this has to be an effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (storedToken) setToken(storedToken);
      if (storedUser) setUser(JSON.parse(storedUser));
    } catch {
      // localStorage unavailable (private mode, etc) — treat as logged out
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiFetch<LoginResponse>("/auth/login", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ email, password }),
    });
    setToken(res.accessToken);
    setUser(res.user);
    try {
      window.localStorage.setItem(TOKEN_KEY, res.accessToken);
      window.localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    } catch {
      // ignore storage failures — session still works for this page load
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    try {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(USER_KEY);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, login, logout }),
    [user, token, loading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { ApiError };
