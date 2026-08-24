"use client";

import { FormEvent, useEffect, useState } from "react";
import { tingle, tingleApiBase } from "@/lib/tingle";
import { DemoButton } from "./DemoButton";

export function AuthForm({
  mode,
  compact = false,
  onModeChange,
}: {
  mode: "login" | "signup";
  compact?: boolean;
  onModeChange?: (mode: "login" | "signup") => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [oauth, setOauth] = useState({ github: false, google: false });

  useEffect(() => {
    tingle<{ github?: boolean; google?: boolean }>("/auth/providers")
      .then((p) =>
        setOauth({ github: Boolean(p.github), google: Boolean(p.google) }),
      )
      .catch(() => undefined);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      await tingle(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      window.location.href = "/tingle";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/already registered/i.test(msg)) {
        setError("That email is already registered. Use Sign in.");
        onModeChange?.("login");
      } else {
        setError(msg);
      }
    } finally {
      setPending(false);
    }
  }

  const fieldClass = compact
    ? "mt-1 w-full rounded-none border-0 border-b border-[var(--line)] bg-transparent px-0 py-2"
    : "mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2";
  const submitClass = compact
    ? "w-full"
    : "w-full rounded-lg bg-[var(--signal)] px-4 py-2 font-medium text-[#062014]";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {compact ? null : (
        <h1 className="font-display text-2xl">
          {mode === "signup" ? "Create account" : "Sign in"}
        </h1>
      )}
      <p className="text-sm leading-relaxed text-[var(--muted)]">
        {compact ? (
          "Email and password. Sign-in never requests GitHub repo access."
        ) : mode === "signup" ? (
          <>
            <button
              type="button"
              onClick={() => onModeChange?.("login")}
              className="text-[var(--steel)] underline"
            >
              Already have an account
            </button>
            . Email and password is the default. GitHub/Google login, if
            enabled, does not request repo scope.
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onModeChange?.("signup")}
              className="text-[var(--steel)] underline"
            >
              Create an account
            </button>
            . Email and password is the default. GitHub/Google login, if
            enabled, does not request repo scope.
          </>
        )}
      </p>
      <label className="block text-sm">
        Email
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={fieldClass}
        />
      </label>
      <label className="block text-sm">
        Password
        <input
          type="password"
          required
          minLength={8}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={fieldClass}
        />
      </label>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? "…" : mode === "signup" ? "Sign up" : "Sign in"}
      </button>
      <p className="text-center font-mono text-[0.62rem] tracking-[0.16em] uppercase text-[var(--muted)]">
        or
      </p>
      <DemoButton size="lg" />
      {oauth.github || oauth.google ? (
        <div className="space-y-2 pt-2">
          {oauth.github ? (
            <a
              href={`${tingleApiBase()}/auth/github`}
              className="block w-full rounded-lg border border-[var(--line)] px-4 py-2 text-center text-sm"
            >
              Continue with GitHub (login only)
            </a>
          ) : null}
          {oauth.google ? (
            <a
              href={`${tingleApiBase()}/auth/google`}
              className="block w-full rounded-lg border border-[var(--line)] px-4 py-2 text-center text-sm"
            >
              Continue with Google
            </a>
          ) : null}
        </div>
      ) : compact ? null : (
        <p className="text-xs text-[var(--muted)]">
          GitHub/Google buttons appear after you paste OAuth client id/secret
          into <code>.env</code> and restart the Tingle API. Email still works.
        </p>
      )}
    </form>
  );
}
