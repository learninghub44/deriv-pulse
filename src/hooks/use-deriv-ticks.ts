import { useCallback, useEffect, useRef, useState } from "react";

export type Tick = { quote: number; epoch: number; pip_size: number };
export type Status = "idle" | "connecting" | "open" | "closed" | "error" | "reconnecting";

/* ─── API constants ──────────────────────────────────────────────────────── */
const PUBLIC_WS_URL  = "wss://api.derivws.com/trading/v1/options/ws/public";
const LEGACY_WS_URL  = `wss://ws.derivws.com/websockets/v3?app_id=1089`;  // fallback for public data
const REST_BASE      = "https://api.derivws.com";
const BUFFER         = 1000;
const PING_INTERVAL  = 25_000;
const MAX_RECONNECTS = 8;

/* ─── Reconnect backoff ──────────────────────────────────────────────────── */
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
  scope?: "trade" | "admin";
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
  const { data } = await res.json();
  return data.url as string;
}

/* ─── REST: list accounts ────────────────────────────────────────────────── */
export async function fetchDerivAccounts(accessToken: string, appId?: string) {
  const res = await fetch(`${REST_BASE}/trading/v1/options/accounts`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(appId ? { "Deriv-App-ID": appId } : {}),
    },
  });
  if (!res.ok) throw new Error(`Accounts fetch failed: ${res.status}`);
  const { data } = await res.json();
  return data as Array<{ account_id: string; balance: number; currency: string; account_type: string; status: string }>;
}

/* ─── Active symbols (new API field names) ───────────────────────────────── */
export async function fetchActiveSymbols(): Promise<
  Array<{ symbol: string; display_name: string; market: string; submarket: string; pip: number }>
> {
  return new Promise((resolve, reject) => {
    // Try new public endpoint first, fall back to legacy
    let ws: WebSocket;
    let resolved = false;

    const tryConnect = (url: string) => {
      ws = new WebSocket(url);
      const timeout = setTimeout(() => {
        ws.close();
        if (!resolved && url === PUBLIC_WS_URL) {
          // Try legacy
          tryConnect(LEGACY_WS_URL);
        } else if (!resolved) {
          reject(new Error("timeout"));
        }
      }, 8000);

      ws.onopen = () => {
        ws.send(JSON.stringify({ active_symbols: "brief", product_type: "basic" }));
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string);
          // Support both new API (underlying_symbol) and legacy (symbol)
          const syms = msg.active_symbols as Record<string, unknown>[] | undefined;
          if (syms) {
            clearTimeout(timeout);
            resolved = true;
            resolve(
              syms.map((s) => ({
                symbol: String(s.underlying_symbol ?? s.symbol),
                display_name: String(s.underlying_symbol_name ?? s.display_name),
                market: String(s.market),
                submarket: String(s.submarket),
                pip: Number(s.pip_size ?? s.pip) || 0.01,
              }))
            );
            ws.close();
          }
        } catch (e) {
          reject(e);
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        if (!resolved && url === PUBLIC_WS_URL) {
          tryConnect(LEGACY_WS_URL);
        } else if (!resolved) {
          reject(new Error("ws error"));
        }
      };
    };

    tryConnect(PUBLIC_WS_URL);
  });
}

/* ─── Main tick hook ─────────────────────────────────────────────────────── */
export function useDerivTicks(symbol: string, wsUrl?: string) {
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const wsRef     = useRef<WebSocket | null>(null);
  const subIdRef  = useRef<string | null>(null);
  const pingRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempt   = useRef(0);
  const dead      = useRef(false);

  const connect = useCallback(() => {
    if (dead.current) return;

    // Choose URL: authenticated > new public > legacy public
    const url = wsUrl ?? PUBLIC_WS_URL;

    setStatus(attempt.current === 0 ? "connecting" : "reconnecting");
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      attempt.current = 0;
      setStatus("open");

      // Subscribe to history + live ticks
      ws.send(JSON.stringify({
        ticks_history: symbol,
        adjust_start_time: 1,
        count: BUFFER,
        end: "latest",
        start: 1,
        style: "ticks",
        subscribe: 1,
      }));

      // Keepalive ping
      if (pingRef.current) clearInterval(pingRef.current);
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ ping: 1 }));
        }
      }, PING_INTERVAL);
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as Record<string, unknown>;
        if (msg.error) {
          console.error("[DerivWS] Error:", (msg.error as Record<string, unknown>).message);
          return;
        }
        if (msg.msg_type === "ping") return; // pong handled

        if (msg.msg_type === "history" && msg.history) {
          const pip = (msg.pip_size as number) ?? 2;
          const h   = msg.history as { prices: number[]; times: number[] };
          const hist: Tick[] = h.prices.map((p, i) => ({
            quote: Number(p),
            epoch: Number(h.times[i]),
            pip_size: pip,
          }));
          const sub = msg.subscription as { id?: string } | undefined;
          if (sub?.id) subIdRef.current = sub.id;
          setTicks(hist.slice(-BUFFER));
        } else if (msg.msg_type === "tick" && msg.tick) {
          const t = msg.tick as { quote: number; epoch: number; pip_size?: number };
          const tick: Tick = {
            quote: Number(t.quote),
            epoch: Number(t.epoch),
            pip_size: t.pip_size ?? 2,
          };
          const sub = msg.subscription as { id?: string } | undefined;
          if (sub?.id) subIdRef.current = sub.id;
          setTicks((prev) => {
            const next = prev.length >= BUFFER ? prev.slice(1) : [...prev];
            next.push(tick);
            return next;
          });
        }
      } catch (e) {
        console.error("[DerivWS] Parse error:", e);
      }
    };

    ws.onerror = () => {
      if (pingRef.current) clearInterval(pingRef.current);
      setStatus("error");
    };

    ws.onclose = () => {
      if (pingRef.current) clearInterval(pingRef.current);
      if (dead.current) { setStatus("closed"); return; }
      if (attempt.current < MAX_RECONNECTS) {
        setStatus("reconnecting");
        const delay = backoff(attempt.current++);
        reconnRef.current = setTimeout(connect, delay);
      } else {
        setStatus("error");
      }
    };
  }, [symbol, wsUrl]);

  useEffect(() => {
    dead.current = false;
    attempt.current = 0;
    setTicks([]);
    connect();

    return () => {
      dead.current = true;
      if (pingRef.current)  clearInterval(pingRef.current);
      if (reconnRef.current) clearTimeout(reconnRef.current);
      const ws = wsRef.current;
      if (ws) {
        if (subIdRef.current && ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ forget: subIdRef.current })); } catch { /* noop */ }
        }
        ws.close();
      }
    };
  }, [connect]);

  return { ticks, status };
}

/* ─── Utility ────────────────────────────────────────────────────────────── */
export function lastDigit(quote: number, pipSize: number): number {
  const s = quote.toFixed(pipSize);
  return Number(s[s.length - 1]);
}
