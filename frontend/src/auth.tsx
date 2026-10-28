import React, { createContext, useContext, useEffect, useState } from "react";
import { storage } from "@/src/utils/storage";
import { api, ApiError, setToken, startFileTokens, stopFileTokens } from "@/src/api";
import { registerForPush } from "@/src/push";

export type User = { id: string; username: string; name: string; role: "user" | "admin" };

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string, remember: boolean) => Promise<void>;
  signup: (name: string, username: string, password: string, remember: boolean) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>(null as never);
const KEY = "auth_token";
const USER_KEY = "auth_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Register the device for push on login and on every app open.
  useEffect(() => {
    if (user?.id) registerForPush(user.id);
  }, [user?.id]);
  useEffect(() => {
    (async () => {
      const t = await storage.secureGet<string | null>(KEY, null);
      if (t) {
        setToken(t);
        try {
          const me = await api<User>("/auth/me");
          await startFileTokens();
          setUser(me);
          await storage.setItem(USER_KEY, JSON.stringify(me));
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) {
            setToken(null);
            await storage.secureRemove(KEY);
            await storage.removeItem(USER_KEY);
          } else {
            // Offline or server hiccup: keep the session with the last known profile.
            const cached = await storage.getItem<string | null>(USER_KEY, null);
            if (cached) await startFileTokens(); // starts the refresh timer so photos recover once back online
            setUser(cached ? (JSON.parse(cached) as User) : null);
          }
        }
      }
      setLoading(false);
    })();
  }, []);

  const accept = async (res: { token: string; user: User }) => {
    setToken(res.token);
    await storage.secureSet(KEY, res.token);
    await storage.setItem(USER_KEY, JSON.stringify(res.user));
    await startFileTokens();
    setUser(res.user);
  };

  const login = async (username: string, password: string, remember: boolean) => {
    await accept(await api("/auth/login", { method: "POST", body: { username, password, remember } }));
  };
  const signup = async (name: string, username: string, password: string, remember: boolean) => {
    await accept(await api("/auth/signup", { method: "POST", body: { name, username, password, remember } }));
  };
  const logout = async () => {
    // Revoke the token on the server too, so a copied token stops working. Never block logout on network.
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    stopFileTokens();
    setToken(null);
    await storage.secureRemove(KEY);
    await storage.removeItem(USER_KEY);
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, login, signup, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
