"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useId, useRef } from "react";
import { AuthForm } from "./AuthForm";

export function AuthModal({
  mode,
  onModeChange,
  onClose,
}: {
  mode: "login" | "signup";
  onModeChange: (mode: "login" | "signup") => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.querySelector<HTMLElement>("input,button")?.focus();
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="presentation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.22 }}
    >
      <button
        type="button"
        aria-label="Close sign in"
        className="absolute inset-0 cursor-pointer bg-[var(--ink)]/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
        transition={{ duration: reduce ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-[26rem] border-2 border-[var(--ink)] bg-[var(--cream)] p-7 shadow-[12px_12px_0_var(--poster)]"
      >
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p
              id={titleId}
              className="tingle-poster text-[2.1rem] leading-none"
            >
              {mode === "signup" ? "Create account" : "Sign in"}
            </p>
            <div className="mt-4 flex gap-5 text-[0.72rem] tracking-[0.16em] uppercase">
              <button
                type="button"
                onClick={() => onModeChange("login")}
                className={
                  mode === "login"
                    ? "text-[var(--text)] shadow-[inset_0_-1px_0_var(--text)]"
                    : "text-[var(--muted)] hover:text-[var(--text)]"
                }
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => onModeChange("signup")}
                className={
                  mode === "signup"
                    ? "text-[var(--text)] shadow-[inset_0_-1px_0_var(--text)]"
                    : "text-[var(--muted)] hover:text-[var(--text)]"
                }
              >
                Create account
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[0.7rem] tracking-[0.14em] text-[var(--muted)] uppercase hover:text-[var(--ink)]"
            aria-label="Close"
          >
            Close
          </button>
        </div>
        <AuthForm mode={mode} compact onModeChange={onModeChange} />
      </motion.div>
    </motion.div>
  );
}
