import { useEffect, useRef, useState } from "react";

export type Tick = { quote: number; epoch: number; pip_size: number };
export type Status = "idle" | "connecting" | "open" | "closed" | "error";

const APP_ID = 1089;
const URL = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;
const BUFFER = 1000;

export function useDerivTicks(symbol: string) {
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const wsRef = useRef<WebSocket | null>(null);
  const subIdRef = useRef<string | null>(null);

  useEffect(() => {
    setTicks([]);
    setStatus("connecting");
    const ws = new WebSocket(URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("open");
      // Fetch recent history + subscribe to live ticks
      ws.send(
        JSON.stringify({
          ticks_history: symbol,
          adjust_start_time: 1,
          count: BUFFER,
          end: "latest",
          start: 1,
          style: "ticks",
          subscribe: 1,
        }),
      );
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.error) {
          console.error("Deriv error", msg.error);
          return;
        }
        if (msg.msg_type === "history" && msg.history) {
          const pip = msg.pip_size ?? 2;
          const prices: number[] = msg.history.prices;
          const times: number[] = msg.history.times;
          const hist: Tick[] = prices.map((p, i) => ({
            quote: Number(p),
            epoch: Number(times[i]),
            pip_size: pip,
          }));
          if (msg.subscription?.id) subIdRef.current = msg.subscription.id;
          setTicks(hist.slice(-BUFFER));
        } else if (msg.msg_type === "tick" && msg.tick) {
          const t: Tick = {
            quote: Number(msg.tick.quote),
            epoch: Number(msg.tick.epoch),
            pip_size: msg.tick.pip_size ?? 2,
          };
          if (msg.subscription?.id) subIdRef.current = msg.subscription.id;
          setTicks((prev) => {
            const next = prev.length >= BUFFER ? prev.slice(1) : prev.slice();
            next.push(t);
            return next;
          });
        }
      } catch (e) {
        console.error(e);
      }
    };

    ws.onerror = () => setStatus("error");
    ws.onclose = () => setStatus("closed");

    return () => {
      if (subIdRef.current && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ forget: subIdRef.current }));
        } catch {}
      }
      ws.close();
    };
  }, [symbol]);

  return { ticks, status };
}

export function lastDigit(quote: number, pipSize: number): number {
  const s = quote.toFixed(pipSize);
  return Number(s[s.length - 1]);
}

/** Singleton WS for fetching active symbols (one-off). */
export async function fetchActiveSymbols(): Promise<
  Array<{ symbol: string; display_name: string; market: string; submarket: string; pip: number }>
> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("timeout"));
    }, 8000);
    ws.onopen = () =>
      ws.send(JSON.stringify({ active_symbols: "brief", product_type: "basic" }));
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.active_symbols) {
          clearTimeout(timeout);
          resolve(
            msg.active_symbols.map((s: Record<string, unknown>) => ({
              symbol: String(s.symbol),
              display_name: String(s.display_name),
              market: String(s.market),
              submarket: String(s.submarket),
              pip: Number(s.pip) || 0.01,
            })),
          );
          ws.close();
        }
      } catch (e) {
        reject(e);
      }
    };
    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("ws error"));
    };
  });
}