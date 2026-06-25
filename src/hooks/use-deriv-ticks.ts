import { useCallback, useEffect, useRef, useState } from "react";

export type Tick = { quote: number; epoch: number; pip_size: number };
export type Status = "idle" | "connecting" | "open" | "closed" | "error" | "reconnecting";

/* ─── API constants ──────────────────────────────────────────────────────── */
// Public tick stream — legacy WS (new public endpoint is unreliable for proposals)
export const LEGACY_WS  = (appId: string) => `wss://ws.derivws.com/websockets/v3?app_id=${appId}`;
export const DEFAULT_APP_ID = "1089";  // public read-only app_id for tick data
const REST_BASE = "https://api.derivws.com";

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
    scope: opts.scope ?? "trade read",
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

/* ─── REST: get OTP WebSocket URL ───────────────────────────────────────── */
export async function getAuthenticatedWsUrl(accountId: string, accessToken: string, appId?: string): Promise<string> {
  const res = await fetch(`${REST_BASE}/trading/v1/options/accounts/${accountId}/otp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(appId ? { "Deriv-App-ID": appId } : {}),
    },
  });
  if (!res.ok) throw new Error(`OTP request failed: ${res.status}`);
  const json = await res.json();
  // New API returns { data: { url: "wss://..." } } or { url: "wss://..." }
  return (json.data?.url ?? json.url) as string;
}

/* ─── REST: list accounts — also extracts api_token per account ──────────── */
export interface DerivAccountRaw {
  account_id: string;
  balance: number;
  currency: string;
  account_type: string;
  status: string;
  api_token?: string;   // returned by some Deriv OAuth flows
  token?: string;        // alternate field name
}

export async function fetchDerivAccounts(accessToken: string, appId?: string): Promise<DerivAccountRaw[]> {
  const res = await fetch(`${REST_BASE}/trading/v1/options/accounts`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(appId ? { "Deriv-App-ID": appId } : {}),
    },
  });
  if (!res.ok) throw new Error(`Accounts fetch failed: ${res.status}`);
  const { data } = await res.json();
  return data as DerivAccountRaw[];
}

/* ─── Build legacy WS URL for trading (pre-authenticated via authorize msg) ─ */
export function buildTradingWsUrl(appId?: string): string {
  return LEGACY_WS(appId ?? DEFAULT_APP_ID);
}

/* ─── Active symbols ─────────────────────────────────────────────────────── */
export async function fetchActiveSymbols(): Promise<
  Array<{ symbol: string; display_name: string; market: string; submarket: string; pip: number }>
> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    let resolved = false;

    const tryConnect = (url: string, appId: string) => {
      ws = new WebSocket(url);
      const timeout = setTimeout(() => {
        ws.close();
        if (!resolved && appId === DEFAULT_APP_ID) {
          tryConnect(LEGACY_WS("36544"), "36544");
        } else if (!resolved) {
          reject(new Error("timeout"));
        }
      }, 8000);

      ws.onopen = () => {
        ws.send(JSON.stringify({ active_symbols: "brief", product_type: "basic" }));
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data as string);
          if (data.msg_type === "active_symbols") {
            clearTimeout(timeout);
            resolved = true;
            ws.close();
            const raw = data.active_symbols as Array<Record<string, unknown>>;
            resolve(
              raw.map((s) => ({
                symbol: String(s.underlying_symbol ?? s.symbol ?? ""),
                display_name: String(s.underlying_symbol_name ?? s.display_name ?? ""),
                market: String(s.market ?? ""),
                submarket: String(s.submarket ?? ""),
                pip: Number(s.pip ?? 0.01),
              }))
            );
          }
        } catch { /* ignore parse errors */ }
      };
      ws.onerror = () => { clearTimeout(timeout); };
    };

    tryConnect(LEGACY_WS(DEFAULT_APP_ID), DEFAULT_APP_ID);
  });
}

/* ─── Hook ───────────────────────────────────────────────────────────────── */
export function useDerivTicks(symbol: string, tradingWsUrl?: string | null) {
  const [ticks, setTicks]   = useState<Tick[]>([]);
  const [status, setStatus] = useState<Status>("idle");

  const wsRef        = useRef<WebSocket | null>(null);
  const reconnectRef = useRef(0);
  const pingRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const subRef       = useRef<string | null>(null);
  const mountedRef   = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    // Use legacy WS for public tick data — reliable and well-tested
    const url = LEGACY_WS(DEFAULT_APP_ID);
    setStatus("connecting");
    const ws = new WebSocket(url);
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
          const hist: Tick[] = prices.map((q, i) => ({ quote: q, epoch: times[i] ?? 0, pip_size: pip }));
          setTicks(hist);
          subRef.current = data.subscription?.id ?? null;
        }
        if (data.msg_type === "tick") {
          const t = data.tick as Record<string, unknown>;
          if (t) {
            setTicks(prev => {
              const next = [...prev, { quote: Number(t.quote), epoch: Number(t.epoch), pip_size: pip }];
              return next.length > BUFFER ? next.slice(-BUFFER) : next;
            });
          }
        }
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      if (pingRef.current) clearInterval(pingRef.current);
      if (!mountedRef.current) return;
      setStatus("reconnecting");
      const attempt = reconnectRef.current++;
      if (attempt < MAX_RECONNECTS) {
        setTimeout(connect, backoff(attempt));
      } else {
        setStatus("error");
      }
    };

    ws.onerror = () => { setStatus("error"); };
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

/* ─── Utility: extract last digit from a tick quote ─────────────────────── */
export function lastDigit(quote: number, pipSize: number): number {
  const decimals = Math.round(-Math.log10(pipSize));
  const str = quote.toFixed(decimals);
  return Number(str[str.length - 1]);
}
