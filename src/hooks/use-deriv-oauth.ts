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

const CLIENT_ID = import.meta.env.VITE_DERIV_CLIENT_ID as string | undefined;
const APP_ID    = import.meta.env.VITE_DERIV_APP_ID    as string | undefined;
const REDIRECT  = typeof window !== "undefined"
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

  const otpCacheRef = useRef<Map<string, string>>(new Map());
  const initRef     = useRef(false);

  /* ── Internal: fetch OTP WS URL for an account ── */
  const fetchWsUrl = useCallback(async (accountId: string, accessToken: string): Promise<string> => {
    let wsUrl = otpCacheRef.current.get(accountId);
    if (!wsUrl) {
      wsUrl = await getAuthenticatedWsUrl(accountId, accessToken, APP_ID);
      otpCacheRef.current.set(accountId, wsUrl);
    }
    return wsUrl;
  }, []);

  /* ── Auto-initialize: restore session + auto-fetch WS URL ── */
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const saved = restore();
    if (!saved) return;

    const { token, accounts, activeAccountId } = saved;
    const active = accounts.find(a => a.account_id === activeAccountId) ?? accounts[0] ?? null;

    // Restore state immediately (no WS URL yet)
    setState(prev => ({ ...prev, accessToken: token, accounts, activeAccount: active, loading: true }));

    // Auto-fetch WS URL for the active account
    if (active) {
      fetchWsUrl(active.account_id, token)
        .then(wsUrl => {
          setState(prev => ({ ...prev, authenticatedWsUrl: wsUrl, loading: false }));
        })
        .catch(e => {
          // OTP failed — still set state, just without wsUrl
          setState(prev => ({ ...prev, loading: false, error: `Auto-connect failed: ${e}` }));
        });
    } else {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [fetchWsUrl]);

  /* ── Start OAuth login ── */
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

  /* ── Handle OAuth callback ── */
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
      const accounts = (await fetchDerivAccounts(access_token, APP_ID)) as DerivAccount[];
      // Prefer demo account for safety
      const active = accounts.find(a => a.account_type === "demo") ?? accounts[0] ?? null;

      persist({ token: access_token, accounts, activeAccountId: active?.account_id ?? "" });

      // Immediately fetch WS URL for active account
      let wsUrl: string | null = null;
      if (active) {
        try { wsUrl = await fetchWsUrl(active.account_id, access_token); } catch { /* set below */ }
      }

      setState({
        accessToken: access_token,
        accounts,
        activeAccount: active,
        authenticatedWsUrl: wsUrl,
        loading: false,
        error: null,
      });

      sessionStorage.removeItem("pkce_cv");
      sessionStorage.removeItem("oauth_state");
    } catch (e) {
      setState(prev => ({ ...prev, loading: false, error: String(e) }));
    }
  }, [fetchWsUrl]);

  /* ── Switch account ── */
  const switchAccount = useCallback(async (accountId: string) => {
    const { accessToken, accounts } = state;
    if (!accessToken) return;
    const account = accounts.find(a => a.account_id === accountId);
    if (!account) return;

    setState(prev => ({ ...prev, loading: true, error: null, authenticatedWsUrl: null }));
    try {
      const wsUrl = await fetchWsUrl(accountId, accessToken);
      const saved = restore();
      if (saved) persist({ ...saved, activeAccountId: accountId });
      setState(prev => ({ ...prev, activeAccount: account, authenticatedWsUrl: wsUrl, loading: false }));
    } catch (e) {
      setState(prev => ({ ...prev, loading: false, error: String(e) }));
    }
  }, [state, fetchWsUrl]);

  /* ── Refresh balances ── */
  const refreshBalance = useCallback(async () => {
    const { accessToken, activeAccount } = state;
    if (!accessToken) return;
    try {
      const fresh = (await fetchDerivAccounts(accessToken, APP_ID)) as DerivAccount[];
      setState(prev => ({
        ...prev,
        accounts: fresh,
        activeAccount: fresh.find(a => a.account_id === activeAccount?.account_id) ?? prev.activeAccount,
      }));
      const saved = restore();
      if (saved) persist({ ...saved, accounts: fresh });
    } catch { /* silent */ }
  }, [state]);

  /* ── Logout ── */
  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    otpCacheRef.current.clear();
    setState({ accessToken: null, accounts: [], activeAccount: null, authenticatedWsUrl: null, loading: false, error: null });
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
  };
}
