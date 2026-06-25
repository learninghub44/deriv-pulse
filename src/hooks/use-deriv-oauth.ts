import { useCallback, useEffect, useRef, useState } from "react";
import {
  generatePKCE,
  buildDerivAuthURL,
  exchangeCodeForToken,
  fetchDerivAccounts,
  type DerivAccountRaw,
} from "./use-deriv-ticks";

export interface DerivAccount {
  account_id: string;
  balance: number;
  currency: string;
  account_type: "demo" | "real";
  status: string;
  api_token?: string;  // Deriv API token — used for legacy WS authorize
}

export interface DerivAuthState {
  accessToken: string | null;         // OAuth2 Bearer token (REST API calls)
  accounts: DerivAccount[];
  activeAccount: DerivAccount | null;
  activeApiToken: string | null;      // Deriv API token for the active account (WS authorize)
  loading: boolean;
  error: string | null;
}

const CLIENT_ID = import.meta.env.VITE_DERIV_CLIENT_ID as string | undefined;
const APP_ID    = import.meta.env.VITE_DERIV_APP_ID    as string | undefined;
const REDIRECT  = typeof window !== "undefined"
  ? `${window.location.origin}/callback`
  : "http://localhost:3000/callback";

const STORAGE_KEY = "deriv_pulse_auth_v2";

function persist(data: { token: string; accounts: DerivAccount[]; activeAccountId: string }) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* noop */ }
}
function restore(): { token: string; accounts: DerivAccount[]; activeAccountId: string } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function rawToDerivAccount(r: DerivAccountRaw): DerivAccount {
  return {
    account_id: r.account_id,
    balance: r.balance,
    currency: r.currency,
    account_type: (r.account_type?.includes("virtual") || r.account_type === "demo") ? "demo" : "real",
    status: r.status,
    api_token: r.api_token ?? r.token,
  };
}

export function useDerivOAuth() {
  const [state, setState] = useState<DerivAuthState>({
    accessToken: null,
    accounts: [],
    activeAccount: null,
    activeApiToken: null,
    loading: false,
    error: null,
  });

  const initRef = useRef(false);

  /* ── Restore session on mount ── */
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const saved = restore();
    if (!saved) return;
    const { token, accounts, activeAccountId } = saved;
    const active = accounts.find(a => a.account_id === activeAccountId) ?? accounts[0] ?? null;
    setState({
      accessToken: token,
      accounts,
      activeAccount: active,
      activeApiToken: active?.api_token ?? null,
      loading: false,
      error: null,
    });
  }, []);

  /* ── Login ── */
  const login = useCallback(async (signup = false) => {
    if (!CLIENT_ID) {
      setState(prev => ({ ...prev, error: "Set VITE_DERIV_CLIENT_ID in .env to enable Deriv login" }));
      return;
    }
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const { codeVerifier, codeChallenge, state: oauthState } = await generatePKCE();
      sessionStorage.setItem("pkce_cv", codeVerifier);
      sessionStorage.setItem("oauth_state", oauthState);
      const url = buildDerivAuthURL({ clientId: CLIENT_ID, redirectUri: REDIRECT, codeChallenge, state: oauthState, signup });
      window.location.href = url;
    } catch (e) {
      setState(prev => ({ ...prev, loading: false, error: String(e) }));
    }
  }, []);

  /* ── OAuth callback ── */
  const handleCallback = useCallback(async (code: string, returnedState: string) => {
    if (!CLIENT_ID) return;
    const storedState  = sessionStorage.getItem("oauth_state");
    const codeVerifier = sessionStorage.getItem("pkce_cv");
    if (returnedState !== storedState) {
      setState(prev => ({ ...prev, error: "OAuth state mismatch — possible CSRF" }));
      return;
    }
    if (!codeVerifier) {
      setState(prev => ({ ...prev, error: "PKCE code verifier missing" }));
      return;
    }
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const { access_token } = await exchangeCodeForToken({ clientId: CLIENT_ID, code, codeVerifier, redirectUri: REDIRECT });
      const rawAccounts = await fetchDerivAccounts(access_token, APP_ID);
      const accounts: DerivAccount[] = rawAccounts.map(rawToDerivAccount);

      // Prefer demo for safety
      const active = accounts.find(a => a.account_type === "demo") ?? accounts[0] ?? null;
      persist({ token: access_token, accounts, activeAccountId: active?.account_id ?? "" });

      setState({
        accessToken: access_token,
        accounts,
        activeAccount: active,
        activeApiToken: active?.api_token ?? null,
        loading: false,
        error: null,
      });

      sessionStorage.removeItem("pkce_cv");
      sessionStorage.removeItem("oauth_state");
    } catch (e) {
      setState(prev => ({ ...prev, loading: false, error: String(e) }));
    }
  }, []);

  /* ── Switch account ── */
  const switchAccount = useCallback((accountId: string) => {
    setState(prev => {
      const account = prev.accounts.find(a => a.account_id === accountId);
      if (!account) return prev;
      const saved = restore();
      if (saved) persist({ ...saved, activeAccountId: accountId });
      return { ...prev, activeAccount: account, activeApiToken: account.api_token ?? null };
    });
  }, []);

  /* ── Refresh balances ── */
  const refreshBalance = useCallback(async () => {
    const { accessToken, activeAccount } = state;
    if (!accessToken) return;
    try {
      const raw = await fetchDerivAccounts(accessToken, APP_ID);
      const accounts: DerivAccount[] = raw.map(rawToDerivAccount);
      setState(prev => ({
        ...prev,
        accounts,
        activeAccount: accounts.find(a => a.account_id === activeAccount?.account_id) ?? prev.activeAccount,
      }));
      const saved = restore();
      if (saved) persist({ ...saved, accounts });
    } catch { /* silent */ }
  }, [state]);

  /* ── Logout ── */
  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setState({ accessToken: null, accounts: [], activeAccount: null, activeApiToken: null, loading: false, error: null });
  }, []);

  return {
    ...state,
    isAuthenticated: !!state.accessToken,
    hasClientId: !!CLIENT_ID,
    login,
    logout,
    handleCallback,
    switchAccount,
    refreshBalance,
    // Backwards compat — callers that used authenticatedWsUrl
    authenticatedWsUrl: state.activeApiToken ? "legacy_ws_with_token" : null,
  };
}
