"use client";

import { useState } from "react";
import { tingle } from "@/lib/tingle";
import { Spidey } from "./Spidey";

export function DemoButton({
  size = "quiet",
}: {
  size?: "quiet" | "lg";
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function enter() {
    setPending(true);
    setError("");
    try {
      await tingle("/auth/demo", { method: "POST", body: "{}" });
      window.location.href = "/tingle";
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPending(false);
    }
  }

  const label = pending ? "Opening…" : "Try demo";

  if (size === "lg") {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <button
          type="button"
          disabled={pending}
          onClick={() => void enter()}
          className="tingle-ghost text-[0.95rem]"
        >
          {pending ? (
            <span className="inline-flex items-center gap-2">
              <Spidey move="run" height={28} label="Opening" />
              Opening…
            </span>
          ) : (
            "Try demo"
          )}
        </button>
        {error ? <span className="text-xs text-[var(--danger)]">{error}</span> : null}
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      title={error || "Open a throwaway desk"}
      onClick={() => void enter()}
      className="tingle-nav font-mono text-[0.68rem] tracking-[0.14em] uppercase"
    >
      {label}
    </button>
  );
}
