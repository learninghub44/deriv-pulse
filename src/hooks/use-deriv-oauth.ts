import { useCallback, useEffect, useRef, useState } from "react";
import {
  generatePKCE,
  buildDerivAuthURL,
  exchangeCodeForToken,
  fetchDerivAccounts,
  getAuthenticatedWsUrl,
} from "./use-deriv-ticks";

export interface DerivAccount {
  account_id: string;
  balance: number;
  currency: string;
  account_type: "demo" | "real";
  status: string;
}

export interface DerivAuthState {
  accessToken: string | null;
  accounts: DerivAccount[];
  activeAccount: DerivAccount | null;
  authenticatedWsUrl: string | null;
  loading: boolean;
  error: string | null;
}

const CLIENT_ID  = import.meta.env.VITE_DERIV_CLIENT_ID as string | undefined;
const APP_ID     = import.meta.env.VITE_DERIV_APP_ID    as string | undefined;
const REDIRECT   = typeof window !== "undefined"
  ? `${window.location.origin}/callback`
  : "http://localhost:3000/callback";

const STORAGE_KEY = "deriv_pulse_auth";

function persist(data: { token: string; accounts: DerivAccount[]; activeAccountId: string }) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* noop */ }
}
function restore(): { token: string; accounts: DerivAccount[]; activeAccountId: string } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function useDerivOAuth() {
  const [state, setState] = useState<DerivAuthState>({
    accessToken: null,
    accounts: [],
    activeAccount: null,
    authenticatedWsUrl: null,
    loading: false,
    error: null,
  });

  const otpCacheRef = useRef<Map<string, string>>(new Map()); // accountId → ws url

  /* ── Restore from session on mount ── */
  useEffect(() => {
    const saved = restore();
    if (!saved) return;

    setState((prev) => ({
      ...prev,
      accessToken: saved.token,
      accounts: saved.accounts,
      activeAccount: saved.accounts.find((a) => a.account_id === saved.activeAccountId) ?? saved.accounts[0] ?? null,
    }));
  }, []);

  /* ── Start OAuth login ── */
  const login = useCallback(async (signup = false) => {
    if (!CLIENT_ID) {
      setState((prev) => ({ ...prev, error: "Set VITE_DERIV_CLIENT_ID in .env to enable Deriv login" }));
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { codeVerifier, codeChallenge, state: oauthState } = await generatePKCE();
      sessionStorage.setItem("pkce_cv", codeVerifier);
      sessionStorage.setItem("oauth_state", oauthState);

      const url = buildDerivAuthURL({
        clientId: CLIENT_ID,
        redirectUri: REDIRECT,
        codeChallenge,
        state: oauthState,
        signup,
      });
      window.location.href = url;
    } catch (e) {
      setState((prev) => ({ ...prev, loading: false, error: String(e) }));
    }
  }, []);

  /* ── Handle OAuth callback (call from /callback route or on mount) ── */
  const handleCallback = useCallback(async (code: string, returnedState: string) => {
    if (!CLIENT_ID) return;
    const storedState    = sessionStorage.getItem("oauth_state");
    const codeVerifier   = sessionStorage.getItem("pkce_cv");

    if (returnedState !== storedState) {
      setState((prev) => ({ ...prev, error: "OAuth state mismatch — possible CSRF" }));
      return;
    }
    if (!codeVerifier) {
      setState((prev) => ({ ...prev, error: "PKCE code verifier missing" }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { access_token } = await exchangeCodeForToken({
        clientId: CLIENT_ID,
        code,
        codeVerifier,
        redirectUri: REDIRECT,
      });

      const accounts = (await fetchDerivAccounts(access_token, APP_ID)) as DerivAccount[];
      // Prefer demo account by default for safety
      const active = accounts.find((a) => a.account_type === "demo") ?? accounts[0] ?? null;

      persist({ token: access_token, accounts, activeAccountId: active?.account_id ?? "" });

      setState({
        accessToken: access_token,
        accounts,
        activeAccount: active,
        authenticatedWsUrl: null,
        loading: false,
        error: null,
      });

      sessionStorage.removeItem("pkce_cv");
      sessionStorage.removeItem("oauth_state");
    } catch (e) {
      setState((prev) => ({ ...prev, loading: false, error: String(e) }));
    }
  }, []);

  /* ── Switch active account & get fresh OTP WS URL ── */
  const switchAccount = useCallback(async (accountId: string) => {
    const { accessToken, accounts } = state;
    if (!accessToken) return;

    const account = accounts.find((a) => a.account_id === accountId);
    if (!account) return;

    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      // Check cache first (OTPs can be reused within a session for WS connections)
      let wsUrl = otpCacheRef.current.get(accountId);
      if (!wsUrl) {
        wsUrl = await getAuthenticatedWsUrl(accountId, accessToken, APP_ID);
        otpCacheRef.current.set(accountId, wsUrl);
      }

      const saved = restore();
      if (saved) persist({ ...saved, activeAccountId: accountId });

      setState((prev) => ({
        ...prev,
        activeAccount: account,
        authenticatedWsUrl: wsUrl!,
        loading: false,
      }));
    } catch (e) {
      setState((prev) => ({ ...prev, loading: false, error: String(e) }));
    }
  }, [state]);

  /* ── Refresh balance for active account ── */
  const refreshBalance = useCallback(async () => {
    const { accessToken, accounts, activeAccount } = state;
    if (!accessToken) return;
    try {
      const fresh = (await fetchDerivAccounts(accessToken, APP_ID)) as DerivAccount[];
      setState((prev) => ({
        ...prev,
        accounts: fresh,
        activeAccount: fresh.find((a) => a.account_id === activeAccount?.account_id) ?? prev.activeAccount,
      }));
      const saved = restore();
      if (saved) persist({ ...saved, accounts: fresh });
    } catch { /* silent */ }
  }, [state]);

  /* ── Logout ── */
  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    otpCacheRef.current.clear();
    setState({
      accessToken: null,
      accounts: [],
      activeAccount: null,
      authenticatedWsUrl: null,
      loading: false,
      error: null,
    });
  }, []);

  const isAuthenticated = !!state.accessToken;
  const hasClientId     = !!CLIENT_ID;

  return {
    ...state,
    isAuthenticated,
    hasClientId,
    login,
    logout,
    handleCallback,
    switchAccount,
    refreshBalance,
  };
}
