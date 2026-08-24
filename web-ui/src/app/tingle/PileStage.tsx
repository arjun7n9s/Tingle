"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

const CLAIM = "Haptic gloves that help people navigate without looking at a screen.";

const piles: {
  title: string;
  meaning: string;
  rows: { title: string; source: string }[];
  empty: string;
}[] = [
  {
    title: "Existing work",
    meaning: "Papers and tools you can learn from — don't start from zero.",
    rows: [
      {
        title: "Navigating with Haptic Gloves",
        source: "arXiv",
      },
    ],
    empty: "",
  },
  {
    title: "Already shipping",
    meaning: "A live product doing the same job.",
    rows: [],
    empty: "None found for this idea. That's a real answer.",
  },
  {
    title: "New this week",
    meaning: "Launched or published in the last 7 days.",
    rows: [],
    empty: "Nothing this week for this idea.",
  },
];

export function PileStage() {
  const reduce = useReducedMotion();
  const [typed, setTyped] = useState(reduce ? CLAIM : "");
  const [locked, setLocked] = useState(Boolean(reduce));

  useEffect(() => {
    if (reduce) return;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setTyped(CLAIM.slice(0, i));
      if (i >= CLAIM.length) {
        window.clearInterval(id);
        window.setTimeout(() => setLocked(true), 280);
      }
    }, 22);
    return () => window.clearInterval(id);
  }, [reduce]);

  return (
    <div className="border-2 border-[var(--ink)] bg-[var(--cream)] text-[var(--ink)] shadow-[10px_10px_0_var(--ink)]">
      <div className="flex items-center justify-between gap-3 border-b-2 border-[var(--ink)] bg-[var(--poster)] px-3 py-2">
        <p className="font-mono text-[0.62rem] tracking-[0.16em] uppercase">
          Example: you typed this idea
        </p>
        {locked ? (
          <span className="tingle-stamp border-2 border-[var(--ink)] bg-[var(--cream)] px-2 py-0.5 font-mono text-[0.62rem] tracking-[0.14em] uppercase">
            Idea locked
          </span>
        ) : (
          <span className="font-mono text-[0.62rem] tracking-[0.14em] uppercase">
            Typing the idea…
          </span>
        )}
      </div>
      <p className="min-h-[3.4rem] border-b-2 border-[var(--ink)] px-3 py-3 font-mono text-[0.78rem] leading-relaxed">
        {typed}
        {!locked ? <span className="animate-pulse">▍</span> : null}
      </p>
      <div className="grid sm:grid-cols-3">
        {piles.map((pile, i) => (
          <motion.div
            key={pile.title}
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={locked ? { opacity: 1, y: 0 } : { opacity: 0.35, y: 8 }}
            transition={{ duration: 0.45, delay: reduce ? 0 : i * 0.12 }}
            className={i < 2 ? "border-b-2 border-[var(--ink)] sm:border-b-0 sm:border-r-2" : "border-b-0"}
          >
            <div className="border-b-2 border-[var(--ink)] px-3 py-2">
              <p className="tingle-poster text-[1.05rem]">{pile.title}</p>
              <p className="mt-1 font-mono text-[0.62rem] text-[var(--muted)]">{pile.meaning}</p>
            </div>
            <div className="min-h-[6.5rem] px-3 py-3">
              {pile.rows.length ? (
                pile.rows.map((row) => (
                  <p key={row.title} className="text-[0.82rem] leading-snug">
                    <span className="font-medium">{row.title}</span>
                    <span className="mt-1 block font-mono text-[0.62rem] uppercase tracking-[0.12em] text-[var(--muted)]">
                      {row.source} · public page
                    </span>
                  </p>
                ))
              ) : (
                <p className="font-mono text-[0.7rem] leading-relaxed text-[var(--muted)]">
                  {pile.empty}
                </p>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
