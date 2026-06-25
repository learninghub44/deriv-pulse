import { useCallback, useEffect, useRef, useState } from "react";
import {
  generatePKCE,
  buildDerivAuthURL,
  exchangeCodeForToken,
  fetchDerivAccounts,
  fetchApiToken,
  type DerivAccountRaw,
} from "./use-deriv-ticks";

export interface DerivAccount {
  account_id: string;
  balance: number;
  currency: string;
  account_type: "demo" | "real";
  status: string;
  api_token?: string;  // WS-compatible Deriv API token (short, e.g. "a1-xxxx")
}

export interface DerivAuthState {
  accessToken: string | null;       // OAuth2 Bearer — for REST calls only
  accounts: DerivAccount[];
  activeAccount: DerivAccount | null;
  activeApiToken: string | null;    // WS-compatible token for legacy WS authorize
  loading: boolean;
  error: string | null;
}

const CLIENT_ID = import.meta.env.VITE_DERIV_CLIENT_ID as string | undefined;
const APP_ID    = import.meta.env.VITE_DERIV_APP_ID    as string | undefined;
const REDIRECT  = typeof window !== "undefined"
  ? `${window.location.origin}/callback`
  : "http://localhost:3000/callback";

const STORAGE_KEY = "deriv_pulse_auth_v3";

function persist(d: { token: string; accounts: DerivAccount[]; activeAccountId: string }) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch { /* noop */ }
}
function restore(): { token: string; accounts: DerivAccount[]; activeAccountId: string } | null {
  try { const r = sessionStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null; }
  catch { return null; }
}

function toAccount(r: DerivAccountRaw): DerivAccount {
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
    accessToken: null, accounts: [], activeAccount: null,
    activeApiToken: null, loading: false, error: null,
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
      accessToken: token, accounts, activeAccount: active,
      activeApiToken: active?.api_token ?? null,
      loading: false, error: null,
    });
  }, []);

  /* ── Login ── */
  const login = useCallback(async (signup = false) => {
    if (!CLIENT_ID) {
      setState(prev => ({ ...prev, error: "Set VITE_DERIV_CLIENT_ID in .env" }));
      return;
    }
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const { codeVerifier, codeChallenge, state: oauthState } = await generatePKCE();
      sessionStorage.setItem("pkce_cv", codeVerifier);
      sessionStorage.setItem("oauth_state", oauthState);
      window.location.href = buildDerivAuthURL({
        clientId: CLIENT_ID, redirectUri: REDIRECT,
        codeChallenge, state: oauthState, signup,
      });
    } catch (e) {
      setState(prev => ({ ...prev, loading: false, error: String(e) }));
    }
  }, []);

  /* ── OAuth callback ── */
  const handleCallback = useCallback(async (code: string, returnedState: string) => {
    if (!CLIENT_ID) return;
    if (returnedState !== sessionStorage.getItem("oauth_state")) {
      setState(prev => ({ ...prev, error: "OAuth state mismatch" })); return;
    }
    const codeVerifier = sessionStorage.getItem("pkce_cv");
    if (!codeVerifier) {
      setState(prev => ({ ...prev, error: "PKCE verifier missing" })); return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      // 1. Exchange code for Bearer token
      const { access_token } = await exchangeCodeForToken({
        clientId: CLIENT_ID, code, codeVerifier, redirectUri: REDIRECT,
      });

      // 2. Fetch account list
      const rawAccounts = await fetchDerivAccounts(access_token, APP_ID);
      const accounts: DerivAccount[] = rawAccounts.map(toAccount);

      // 3. Prefer demo account for safety
      const active = accounts.find(a => a.account_type === "demo") ?? accounts[0] ?? null;

      // 4. Fetch WS-compatible API token for the active account
      let apiToken: string | null = active?.api_token ?? null;
      if (!apiToken && active) {
        try {
          apiToken = await fetchApiToken(active.account_id, access_token, APP_ID);
          // Store it on the account object
          const idx = accounts.findIndex(a => a.account_id === active.account_id);
          if (idx >= 0) accounts[idx] = { ...accounts[idx], api_token: apiToken };
        } catch (e) {
          console.warn("[DerivOAuth] fetchApiToken failed:", e);
          // Non-fatal — user will see auth error in trading panel
        }
      }

      persist({ token: access_token, accounts, activeAccountId: active?.account_id ?? "" });
      sessionStorage.removeItem("pkce_cv");
      sessionStorage.removeItem("oauth_state");

      setState({
        accessToken: access_token, accounts, activeAccount: active,
        activeApiToken: apiToken,
        loading: false, error: null,
      });
    } catch (e) {
      setState(prev => ({ ...prev, loading: false, error: String(e) }));
    }
  }, []);

  /* ── Switch account ── */
  const switchAccount = useCallback(async (accountId: string) => {
    setState(prev => {
      const account = prev.accounts.find(a => a.account_id === accountId);
      if (!account) return prev;
      const saved = restore();
      if (saved) persist({ ...saved, activeAccountId: accountId });
      // If we already have an api_token for this account, use it immediately
      if (account.api_token) {
        return { ...prev, activeAccount: account, activeApiToken: account.api_token };
      }
      // Otherwise fetch it async (handled below)
      return { ...prev, activeAccount: account, activeApiToken: null, loading: true };
    });

    // Async fetch for accounts without a cached token
    setState(prev => {
      const account = prev.accounts.find(a => a.account_id === accountId);
      if (!account || account.api_token) return prev;
      // Fire async fetch
      if (prev.accessToken) {
        fetchApiToken(accountId, prev.accessToken, APP_ID)
          .then(token => {
            setState(s => ({
              ...s,
              activeApiToken: token,
              loading: false,
              accounts: s.accounts.map(a => a.account_id === accountId ? { ...a, api_token: token } : a),
            }));
          })
          .catch(() => setState(s => ({ ...s, loading: false })));
      }
      return prev;
    });
  }, []);

  /* ── Logout ── */
  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setState({ accessToken: null, accounts: [], activeAccount: null, activeApiToken: null, loading: false, error: null });
  }, []);

  return {
    ...state,
    isAuthenticated: !!state.accessToken,
    hasClientId: !!CLIENT_ID,
    // Backwards compat sentinel — non-null means "we have a token, open trading panel"
    authenticatedWsUrl: state.activeApiToken ? "ready" : null,
    login, logout, handleCallback, switchAccount,
  };
}
