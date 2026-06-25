import { useCallback, useEffect, useRef, useState } from "react";

export type Tick = { quote: number; epoch: number; pip_size: number };
export type Status = "idle" | "connecting" | "open" | "closed" | "error" | "reconnecting";

/* ─── API constants ──────────────────────────────────────────────────────── */
export const LEGACY_WS     = (appId: string) => `wss://ws.derivws.com/websockets/v3?app_id=${appId}`;
export const DEFAULT_APP_ID = "1089";
const REST_BASE             = "https://api.derivws.com";

const BUFFER         = 1000;
const PING_INTERVAL  = 25_000;
const MAX_RECONNECTS = 8;

function backoff(attempt: number): number {
  return Math.min(30_000, 500 * Math.pow(2, attempt) + Math.random() * 300);
}

/* ─── OAuth PKCE helpers ─────────────────────────────────────────────────── */
export async function generatePKCE(): Promise<{ codeVerifier: string; codeChallenge: string; state: string }> {
  const array = crypto.getRandomValues(new Uint8Array(64));
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const codeVerifier = Array.from(array).map((v) => chars[v % chars.length]).join("");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const stateArr = crypto.getRandomValues(new Uint8Array(16));
  const state = Array.from(stateArr).map((b) => b.toString(16).padStart(2, "0")).join("");
  return { codeVerifier, codeChallenge, state };
}

export function buildDerivAuthURL(opts: {
  clientId: string;
  redirectUri: string;
  scope?: string;
  codeChallenge: string;
  state: string;
  signup?: boolean;
}): string {
  const base = "https://auth.deriv.com/oauth2/auth";
  const params = new URLSearchParams({
    response_type: "code",
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    scope: opts.scope ?? "trade",
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
    ...(opts.signup ? { prompt: "registration" } : {}),
  });
  return `${base}?${params.toString()}`;
}

export async function exchangeCodeForToken(opts: {
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<{ access_token: string; expires_in: number; token_type: string }> {
  const res = await fetch("https://auth.deriv.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: opts.clientId,
      code: opts.code,
      code_verifier: opts.codeVerifier,
      redirect_uri: opts.redirectUri,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  return res.json();
}

/* ─── REST: list accounts ─────────────────────────────────────────────────── */
export interface DerivAccountRaw {
  account_id: string;
  balance: number;
  currency: string;
  account_type: string;
  status: string;
  api_token?: string;
  token?: string;
}

export async function fetchDerivAccounts(accessToken: string, appId?: string): Promise<DerivAccountRaw[]> {
  const res = await fetch(`${REST_BASE}/trading/v1/options/accounts`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(appId ? { "Deriv-App-ID": appId } : {}),
    },
  });
  if (!res.ok) throw new Error(`Accounts fetch failed: ${res.status}`);
  const json = await res.json();
  // Response may be { data: [...] } or directly [...]
  return (json.data ?? json) as DerivAccountRaw[];
}

/* ─── Get Deriv API token for an account via legacy WS authorize flow ──────
 *
 * The Deriv legacy WebSocket (ws.derivws.com) accepts the OAuth access_token
 * in the `authorize` call via a special REST endpoint that exchanges it for
 * a WS-compatible session. But the simplest reliable method is:
 *
 * POST /trading/v1/options/accounts/{id}/token
 * → returns { data: { token: "a1-xxxx" } }  (short-lived API token)
 *
 * This token works with {authorize: token} on the legacy WS.
 * ─────────────────────────────────────────────────────────────────────────── */
export async function fetchApiToken(accountId: string, accessToken: string, appId?: string): Promise<string> {
  // Try dedicated token endpoint first
  const res = await fetch(`${REST_BASE}/trading/v1/options/accounts/${accountId}/token`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(appId ? { "Deriv-App-ID": appId } : {}),
    },
  });
  if (res.ok) {
    const json = await res.json();
    const token = json.data?.token ?? json.data?.api_token ?? json.token ?? json.api_token;
    if (token) return token as string;
  }

  // Fallback: try OTP endpoint — some Deriv setups return a token in the URL
  const otpRes = await fetch(`${REST_BASE}/trading/v1/options/accounts/${accountId}/otp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(appId ? { "Deriv-App-ID": appId } : {}),
    },
  });
  if (otpRes.ok) {
    const json = await otpRes.json();
    // OTP URL format: wss://...?token=a1-xxxx  — extract token param if present
    const url: string = json.data?.url ?? json.url ?? "";
    const tokenMatch = url.match(/[?&]token=([^&]+)/);
    if (tokenMatch) return tokenMatch[1];
    // Some responses include it directly
    const direct = json.data?.api_token ?? json.data?.token ?? json.api_token ?? json.token;
    if (direct) return direct as string;
  }

  throw new Error("Could not obtain Deriv API token — check app permissions");
}

/* ─── Build legacy WS URL ────────────────────────────────────────────────── */
export function buildTradingWsUrl(appId?: string): string {
  return LEGACY_WS(appId ?? DEFAULT_APP_ID);
}

/* ─── Active symbols ─────────────────────────────────────────────────────── */
export async function fetchActiveSymbols(): Promise<
  Array<{ symbol: string; display_name: string; market: string; submarket: string; pip: number }>
> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const tryUrl = (url: string) => {
      const ws = new WebSocket(url);
      const t = setTimeout(() => { ws.close(); if (!resolved) reject(new Error("timeout")); }, 8000);
      ws.onopen = () => ws.send(JSON.stringify({ active_symbols: "brief", product_type: "basic" }));
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data as string);
          if (data.msg_type === "active_symbols") {
            clearTimeout(t); resolved = true; ws.close();
            resolve((data.active_symbols as Array<Record<string, unknown>>).map(s => ({
              symbol: String(s.underlying_symbol ?? s.symbol ?? ""),
              display_name: String(s.underlying_symbol_name ?? s.display_name ?? ""),
              market: String(s.market ?? ""),
              submarket: String(s.submarket ?? ""),
              pip: Number(s.pip ?? 0.01),
            })));
          }
        } catch { /* ignore */ }
      };
      ws.onerror = () => clearTimeout(t);
    };
    tryUrl(LEGACY_WS(DEFAULT_APP_ID));
  });
}

/* ─── Utility ────────────────────────────────────────────────────────────── */
export function lastDigit(quote: number, pipSize: number): number {
  const decimals = Math.round(-Math.log10(pipSize));
  const str = quote.toFixed(decimals);
  return Number(str[str.length - 1]);
}

/* ─── Hook ───────────────────────────────────────────────────────────────── */
export function useDerivTicks(symbol: string) {
  const [ticks, setTicks]   = useState<Tick[]>([]);
  const [status, setStatus] = useState<Status>("idle");

  const wsRef        = useRef<WebSocket | null>(null);
  const reconnectRef = useRef(0);
  const pingRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef   = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    setStatus("connecting");
    const ws = new WebSocket(LEGACY_WS(DEFAULT_APP_ID));
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return; }
      setStatus("open");
      reconnectRef.current = 0;
      ws.send(JSON.stringify({ ticks_history: symbol, adjust_start_time: 1, count: BUFFER, end: "latest", style: "ticks", subscribe: 1 }));
      if (pingRef.current) clearInterval(pingRef.current);
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ ping: 1 }));
      }, PING_INTERVAL);
    };

    ws.onmessage = (ev) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(ev.data as string);
        const pip = data.pip_size ?? data.tick?.pip_size ?? 0.01;
        if (data.msg_type === "history") {
          const prices = (data.history?.prices as number[]) ?? [];
          const times  = (data.history?.times  as number[]) ?? [];
          setTicks(prices.map((q, i) => ({ quote: q, epoch: times[i] ?? 0, pip_size: pip })));
        }
        if (data.msg_type === "tick") {
          const t = data.tick as Record<string, unknown>;
          if (t) setTicks(prev => {
            const next = [...prev, { quote: Number(t.quote), epoch: Number(t.epoch), pip_size: pip }];
            return next.length > BUFFER ? next.slice(-BUFFER) : next;
          });
        }
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      if (pingRef.current) clearInterval(pingRef.current);
      if (!mountedRef.current) return;
      setStatus("reconnecting");
      const attempt = reconnectRef.current++;
      if (attempt < MAX_RECONNECTS) setTimeout(connect, backoff(attempt));
      else setStatus("error");
    };

    ws.onerror = () => setStatus("error");
  }, [symbol]);

  useEffect(() => {
    mountedRef.current = true;
    setTicks([]);
    reconnectRef.current = 0;
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    connect();
    return () => {
      mountedRef.current = false;
      if (pingRef.current) clearInterval(pingRef.current);
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    };
  }, [connect]);

  return { ticks, status };
}
