import React, { createContext, useContext, useEffect, useState } from "react";
import { storage } from "@/src/utils/storage";
import { api, setToken } from "@/src/api";

export type User = { id: string; username: string; name: string; role: "user" | "admin" };

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (name: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>(null as never);
const KEY = "auth_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const t = await storage.secureGet<string | null>(KEY, null);
      if (t) {
        setToken(t);
        try {
          setUser(await api<User>("/auth/me"));
        } catch {
          setToken(null);
          await storage.secureRemove(KEY);
        }
      }
      setLoading(false);
    })();
  }, []);

  const accept = async (res: { token: string; user: User }) => {
    setToken(res.token);
    await storage.secureSet(KEY, res.token);
    setUser(res.user);
  };

  const login = async (username: string, password: string) => {
    await accept(await api("/auth/login", { method: "POST", body: { username, password } }));
  };
  const signup = async (name: string, username: string, password: string) => {
    await accept(await api("/auth/signup", { method: "POST", body: { name, username, password } }));
  };
  const logout = async () => {
    setToken(null);
    await storage.secureRemove(KEY);
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, login, signup, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
