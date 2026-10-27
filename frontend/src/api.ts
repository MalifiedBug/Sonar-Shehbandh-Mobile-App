import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { useFocusEffect } from "expo-router";

export const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL;

let token: string | null = null;
export const setToken = (t: string | null) => {
  token = t;
};
export const getToken = () => token;

export class ApiError extends Error {
  status: number;
  constructor(msg: string, status: number) {
    super(msg);
    this.status = status;
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${BACKEND}/api${path}`, {
    method: opts.method ?? "GET",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let js: any = null;
  try {
    js = text ? JSON.parse(text) : null;
  } catch {
    js = null;
  }
  if (!res.ok) {
    const d = js?.detail;
    const msg = typeof d === "string" ? d : Array.isArray(d) ? d.map((x: any) => x.msg).join(", ") : `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return js as T;
}

export function fileSource(path: string) {
  // Web can't send headers for <img>, so it uses a short-lived photo-only token, never the login token.
  if (Platform.OS === "web") return { uri: `${BACKEND}/api/files/${path}?token=${fileToken ?? ""}` };
  return { uri: `${BACKEND}/api/files/${path}`, headers: { Authorization: `Bearer ${token}` } };
}

let fileToken: string | null = null;
let fileTimer: ReturnType<typeof setInterval> | null = null;

// Web only: fetch the photo token now and refresh it before it expires (valid 60 min).
export async function startFileTokens() {
  stopFileTokens();
  if (Platform.OS !== "web") return;
  const refresh = async () => {
    try {
      fileToken = (await api<{ token: string }>("/auth/file-token")).token;
    } catch {
      fileToken = null;
    }
  };
  await refresh();
  fileTimer = setInterval(refresh, 45 * 60 * 1000);
}

export function stopFileTokens() {
  if (fileTimer) clearInterval(fileTimer);
  fileTimer = null;
  fileToken = null;
}

// Loads data whenever the screen gains focus; reload() for pull-to-refresh.
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  const depKey = JSON.stringify(deps);

  const reqId = useRef(0);

  const run = useCallback(async (isRefresh = false) => {
    const id = ++reqId.current;
    if (isRefresh) setRefreshing(true);
    try {
      setError(null);
      const result = await fnRef.current();
      // Ignore responses from older requests (e.g. a filter changed meanwhile).
      if (id === reqId.current) setData(result);
    } catch (e: any) {
      if (id === reqId.current) setError(e?.message ?? "Something went wrong");
    } finally {
      if (id === reqId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      run();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [run, depKey]),
  );

  return { data, setData, loading, refreshing, error, reload: () => run(true) };
}
