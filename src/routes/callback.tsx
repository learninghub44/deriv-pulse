import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useDerivOAuth } from "@/hooks/use-deriv-oauth";

export const Route = createFileRoute("/callback")({
  component: CallbackPage,
});

function CallbackPage() {
  const navigate = useNavigate();
  const { handleCallback } = useDerivOAuth();
  const [status, setStatus] = useState<"processing" | "error">("processing");
  const [errorMsg, setErrorMsg] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(window.location.search);
    const code  = params.get("code");
    const state = params.get("state");
    const error = params.get("error");

    if (error) {
      setStatus("error");
      setErrorMsg(params.get("error_description") ?? error);
      return;
    }

    if (!code || !state) {
      setStatus("error");
      setErrorMsg("Missing code or state parameter from Deriv.");
      return;
    }

    handleCallback(code, state)
      .then(() => navigate({ to: "/" }))
      .catch((e) => {
        setStatus("error");
        setErrorMsg(String(e));
      });
  }, [handleCallback, navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center max-w-sm px-6">
        {status === "processing" ? (
          <>
            <div className="size-3 rounded-full bg-primary animate-ping" />
            <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
              Connecting your Deriv account…
            </div>
          </>
        ) : (
          <>
            <div className="text-2xl">✕</div>
            <div className="text-[11px] font-mono uppercase tracking-widest text-red-300">
              Authentication Failed
            </div>
            <div className="text-[10px] font-mono text-muted-foreground leading-relaxed">
              {errorMsg}
            </div>
            <button
              onClick={() => navigate({ to: "/" })}
              className="mt-2 px-4 py-2 rounded border border-border text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
            >
              Back to Terminal
            </button>
          </>
        )}
      </div>
    </div>
  );
}
