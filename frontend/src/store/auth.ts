import { create } from "zustand";
import { api, apiPost, apiGet, setAccessToken, setUnauthorizedHandler } from "../lib/api";
import { identifyUser } from "../lib/monitoring";
import type { AuthUser, MfaChallenge } from "../lib/types";

interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

type LoginResult = AuthResponse | MfaChallenge;
const isChallenge = (r: LoginResult): r is MfaChallenge => (r as MfaChallenge).mfaRequired === true;

interface AuthState {
  user: AuthUser | null;
  booting: boolean;
  busy: boolean;
  error: string | null;
  /** Resolves to a challenge when the account has 2FA on — the caller then
   * collects a code and calls completeMfa(). No session exists until then. */
  login: (email: string, password: string) => Promise<MfaChallenge | null>;
  completeMfa: (mfaToken: string, code: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
  refreshMe: () => Promise<void>;
  clearError: () => void;
}

let bootstrapPromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  booting: true,
  busy: false,
  error: null,

  clearError: () => set({ error: null }),

  login: async (email, password) => {
    set({ busy: true, error: null });
    try {
      const res = await apiPost<LoginResult>("/api/auth/login", { email, password });
      if (isChallenge(res)) {
        set({ busy: false });
        return res;
      }
      setAccessToken(res.accessToken);
      identifyUser(res.user.id);
      set({ user: res.user, busy: false });
      return null;
    } catch (e: any) {
      set({ busy: false, error: e?.message ?? "Не удалось войти" });
      throw e;
    }
  },

  completeMfa: async (mfaToken, code) => {
    set({ busy: true, error: null });
    try {
      const res = await apiPost<AuthResponse>("/api/auth/login/2fa", { mfaToken, code });
      setAccessToken(res.accessToken);
      identifyUser(res.user.id);
      set({ user: res.user, busy: false });
    } catch (e: any) {
      set({ busy: false, error: e?.message ?? "Не удалось подтвердить код" });
      throw e;
    }
  },

  register: async (email, password, name) => {
    set({ busy: true, error: null });
    try {
      const res = await apiPost<AuthResponse>("/api/auth/register", { email, password, name });
      setAccessToken(res.accessToken);
      identifyUser(res.user.id);
      set({ user: res.user, busy: false });
    } catch (e: any) {
      set({ busy: false, error: e?.message ?? "Не удалось зарегистрироваться" });
      throw e;
    }
  },

  logout: async () => {
    try {
      await apiPost("/api/auth/logout");
    } catch {
      /* best-effort */
    }
    setAccessToken(null);
    identifyUser(null);
    set({ user: null });
  },

  refreshMe: async () => {
    const me = await apiGet<AuthUser>("/api/auth/me");
    identifyUser(me.id);
    set({ user: me });
  },

  bootstrap: () => {
    // React 18 StrictMode (dev) mounts effects twice, which would otherwise fire
    // two concurrent refresh calls. The server treats a reused refresh token as a
    // replay and revokes the whole session, so this dedupes to a single in-flight
    // request no matter how many times bootstrap() is invoked.
    if (!bootstrapPromise) {
      bootstrapPromise = (async () => {
        setUnauthorizedHandler(() => {
          setAccessToken(null);
          identifyUser(null);
    set({ user: null });
        });
        try {
          const res = await api<AuthResponse>("/api/auth/refresh", { method: "POST", skipAuthRetry: true });
          setAccessToken(res.accessToken);
          identifyUser(res.user.id);
          set({ user: res.user, booting: false });
        } catch {
          setAccessToken(null);
          identifyUser(null);
          set({ user: null, booting: false });
        }
      })();
    }
    return bootstrapPromise;
  },
}));
