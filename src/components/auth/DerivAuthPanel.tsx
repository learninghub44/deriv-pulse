import { useDerivOAuth } from "@/hooks/use-deriv-oauth";

interface DerivAuthPanelProps {
  onConnected?: () => void;
}

export function DerivAuthPanel({ onConnected }: DerivAuthPanelProps) {
  const { isAuthenticated, hasClientId, accounts, activeAccount, loading, error, login, logout, switchAccount } = useDerivOAuth();

  if (!hasClientId) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-[10px] font-mono space-y-2">
        <div className="text-amber-300 uppercase tracking-widest text-[9px]">Deriv Trading — Setup Required</div>
        <p className="text-muted-foreground leading-relaxed">
          Add your Deriv OAuth2 client ID to enable live trading:
        </p>
        <pre className="bg-secondary/60 rounded p-2 text-[9px] text-foreground/80 overflow-x-auto">
{`# .env
VITE_DERIV_CLIENT_ID=your_client_id
VITE_DERIV_APP_ID=your_app_id   # optional`}
        </pre>
        <p className="text-muted-foreground/70 text-[9px]">
          Register at <span className="text-foreground underline">developers.deriv.com</span> to get your client ID.
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col gap-3">
        <div className="text-[9px] font-mono text-muted-foreground leading-relaxed">
          Connect your Deriv account to enable live balance tracking, contract pricing, and one-click trading.
        </div>

        {error && (
          <div className="text-[9px] font-mono text-red-300 bg-red-500/10 border border-red-500/20 rounded p-2">
            ✕ {error}
          </div>
        )}

        <button
          onClick={() => { login(false); }}
          disabled={loading}
          className="w-full py-2.5 rounded border border-primary/60 text-primary bg-primary/10 text-[10px] font-mono uppercase tracking-widest hover:bg-primary/20 disabled:opacity-40 transition-all"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="size-2 rounded-full bg-primary animate-ping" />
              Redirecting…
            </span>
          ) : "Login with Deriv"}
        </button>

        <button
          onClick={() => { login(true); }}
          disabled={loading}
          className="w-full py-2 rounded border border-border text-muted-foreground text-[9px] font-mono uppercase tracking-widest hover:text-foreground hover:border-border/80 disabled:opacity-40 transition-all"
        >
          Create Deriv Account
        </button>

        <div className="text-[8px] font-mono text-muted-foreground/50 text-center leading-relaxed">
          Uses OAuth 2.0 with PKCE · Your credentials never touch this app
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Connected state */}
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-bull shadow-[0_0_6px_rgba(74,222,128,0.6)]" />
        <span className="text-[9px] font-mono text-bull uppercase tracking-widest">Deriv Connected</span>
        <button onClick={logout} className="ml-auto text-[8px] font-mono text-muted-foreground hover:text-bear uppercase tracking-widest transition-colors">
          Disconnect
        </button>
      </div>

      {/* Account list */}
      {accounts.length > 0 && (
        <div className="space-y-1">
          <div className="text-[8px] uppercase tracking-widest text-muted-foreground">Accounts</div>
          {accounts.map((acc) => (
            <button
              key={acc.account_id}
              onClick={() => switchAccount(acc.account_id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded border text-[10px] font-mono transition-all ${
                activeAccount?.account_id === acc.account_id
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-[8px] px-1.5 py-0.5 rounded ${acc.account_type === "demo" ? "bg-amber-500/15 text-amber-300" : "bg-red-500/15 text-red-300"}`}>
                  {acc.account_type.toUpperCase()}
                </span>
                <span>{acc.account_id}</span>
              </div>
              <span className="tabular-nums">{acc.currency} {acc.balance.toFixed(2)}</span>
            </button>
          ))}
        </div>
      )}

      {activeAccount && (
        <div className="text-[8px] font-mono text-muted-foreground/60 text-center">
          Click an account above to generate an authenticated WebSocket connection
        </div>
      )}
    </div>
  );
}
