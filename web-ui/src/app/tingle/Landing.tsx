"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SmoothScroll } from "@/components/SmoothScroll";
import { AuthModal } from "./AuthModal";
import { PileStage } from "./PileStage";
import { SignInButton } from "./SignInButton";
import { DemoButton } from "./DemoButton";
import { Spidey } from "./Spidey";

const ease = [0.16, 1, 0.3, 1] as const;

export function Landing({
  authMode,
  onOpenAuth,
  onCloseAuth,
  onModeChange,
}: {
  authMode: "login" | "signup" | null;
  onOpenAuth: (mode: "login" | "signup") => void;
  onCloseAuth: () => void;
  onModeChange: (mode: "login" | "signup") => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    const root = document.documentElement;
    const prevHtml = root.style.background;
    const prevBody = document.body.style.background;
    root.style.background = "#f3e9d8";
    document.body.style.background = "#f3e9d8";
    return () => {
      root.style.background = prevHtml;
      document.body.style.background = prevBody;
    };
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const slam = (delay = 0) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, x: -48, skewX: -6 },
          animate: { opacity: 1, x: 0, skewX: 0 },
          transition: { duration: 0.7, delay, ease },
        };

  return (
    <SmoothScroll>
      <div className="tingle-paper relative min-h-screen overflow-x-clip">
        <div className="tingle-grain pointer-events-none absolute inset-0 z-[1]" />

        <p className="pointer-events-none absolute top-1/3 left-[-1.2rem] z-[2] hidden rotate-180 font-mono text-[0.65rem] tracking-[0.28em] uppercase [writing-mode:vertical-rl] md:block">
          Public web only
        </p>

        <header
          className={`fixed inset-x-0 top-0 z-30 transition-colors ${
            scrolled ? "bg-[var(--cream)]" : "bg-transparent"
          }`}
        >
          <div className="flex items-center justify-between gap-4 border-b-2 border-[var(--ink)] px-5 py-3 md:px-8">
            <Link href="/tingle" className="tingle-poster text-[1.55rem] leading-none">
              Tingle
            </Link>
            <nav className="hidden items-center gap-6 font-mono text-[0.68rem] tracking-[0.16em] uppercase md:flex">
              <a href="#how" className="tingle-nav">
                How
              </a>
              <a href="#look" className="tingle-nav">
                First look
              </a>
              <a href="#proof" className="tingle-nav">
                Proof
              </a>
              <a href="#privacy" className="tingle-nav">
                Privacy
              </a>
            </nav>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => onOpenAuth("signup")}
                className="tingle-nav hidden font-mono text-[0.68rem] tracking-[0.14em] uppercase md:inline"
              >
                Create account
              </button>
              <DemoButton />
              <SignInButton onClick={() => onOpenAuth("login")} />
            </div>
          </div>
        </header>

        <main className="relative z-[2]">
          <section className="px-5 pb-8 pt-24 md:px-8 md:pt-28">
            <p className="font-mono text-[0.68rem] tracking-[0.22em] uppercase">
              Issue 01 · Claim watch
            </p>
            <motion.h1
              {...slam(0.05)}
              className="tingle-poster mt-4 max-w-[12ch] text-[clamp(3.4rem,12vw,9.2rem)]"
            >
              The web already has your idea.
            </motion.h1>
            <motion.div
              initial={reduce ? false : { scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.8, delay: 0.35, ease }}
              className={`tingle-wire mt-6 w-full max-w-3xl ${reduce ? "" : "tingle-wire-live"}`}
            />
            <div className="mt-7 grid max-w-5xl items-end gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <p className="max-w-xl text-[1.05rem] leading-[1.65]">
                Paste what you are building. Tingle reads the <strong>public web</strong> and
                shows what already exists — papers, products, posts — then keeps watching
                so you hear about a clone from the page itself, not from Twitter three
                months later.
              </p>
              <div className="flex flex-col justify-end gap-3">
                <SignInButton size="lg" onClick={() => onOpenAuth("login")}>
                  Sign in
                </SignInButton>
                <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
                  <DemoButton size="lg" />
                  <a href="#look" className="tingle-ghost w-fit">
                    See an example
                  </a>
                </div>
              </div>
            </div>
          </section>

          <section className="relative bg-[var(--poster)] px-5 py-5 text-[var(--ink)] md:px-8">
            <div className="tingle-halftone absolute inset-0" />
            <p className="relative tingle-poster text-[clamp(1.4rem,3.5vw,2.4rem)]">
              We don't guess if your idea is new. We show you pages that already exist.
            </p>
          </section>

          <section className="bg-[var(--ink)] px-5 py-20 text-[var(--cream)] md:px-8 md:py-24">
            <p className="font-mono text-[0.68rem] tracking-[0.22em] text-[var(--poster)] uppercase">
              The problem
            </p>
            <h2 className="tingle-poster mt-4 max-w-[14ch] text-[clamp(2.6rem,7vw,5.5rem)]">
              You are busy. The niche is not.
            </h2>
            <div className="mt-12 grid gap-px bg-[var(--cream)]/20 sm:grid-cols-3">
              {[
                ["Someone ships your pitch", "While you are still building."],
                ["You rebuild a thing that exists", "A library, a paper, a live product."],
                ["You find out too late", "A weekly email is not soon enough."],
              ].map(([title, body], i) => (
                <motion.div
                  key={title}
                  initial={reduce ? false : { opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.55, delay: reduce ? 0 : i * 0.08, ease }}
                  className="bg-[var(--ink)] px-5 py-8"
                >
                  <p className="font-mono text-[0.7rem] text-[var(--poster)]">0{i + 1}</p>
                  <h3 className="tingle-poster mt-3 text-[1.7rem]">{title}</h3>
                  <p className="mt-3 max-w-xs text-[0.92rem] leading-relaxed text-[var(--cream)]/75">
                    {body}
                  </p>
                </motion.div>
              ))}
            </div>
          </section>

          <section id="how" className="scroll-mt-16 px-5 py-20 md:px-8 md:py-24">
            <p className="font-mono text-[0.68rem] tracking-[0.22em] uppercase">How it works</p>
            <h2 className="tingle-poster mt-3 max-w-[16ch] text-[clamp(2.4rem,6vw,4.6rem)]">
              One sentence. Then a first look. Then a watch.
            </h2>
            <ol className="mt-12">
              {[
                [
                  "01",
                  "Lock the claim",
                  "Write the idea in one sentence you can edit. That sentence is the target. We don't look at the web — and we don't spend anything — until you lock it.",
                ],
                [
                  "02",
                  "See what exists",
                  "We search the public web and answer three questions: what already exists that you can learn from, who is already shipping this, and what showed up in the last week. If we find nothing, the box stays empty. We never make a product up.",
                ],
                [
                  "03",
                  "Leave the watch on",
                  "Optional. When something new matches, you get an alert. Not a Monday newsletter. When it actually showed up.",
                ],
              ].map(([n, title, body], i) => (
                <motion.li
                  key={n}
                  initial={reduce ? false : { opacity: 0, x: -28 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.45 }}
                  transition={{ duration: 0.5, delay: reduce ? 0 : i * 0.06, ease }}
                  className="grid gap-3 border-t-2 border-[var(--ink)] py-8 last:border-b-2 md:grid-cols-12 md:items-baseline"
                >
                  <span className="tingle-poster text-[2.2rem] text-[var(--poster)] md:col-span-2">
                    {n}
                  </span>
                  <h3 className="tingle-poster text-[2rem] md:col-span-4">{title}</h3>
                  <p className="max-w-xl text-[0.98rem] leading-[1.65] md:col-span-6">{body}</p>
                </motion.li>
              ))}
            </ol>
          </section>

          <section id="look" className="scroll-mt-16 bg-[var(--ink)] px-5 py-20 text-[var(--cream)] md:px-8 md:py-24">
            <div className="grid gap-10 lg:grid-cols-12 lg:items-end">
              <div className="lg:col-span-5">
                <p className="font-mono text-[0.68rem] tracking-[0.22em] text-[var(--poster)] uppercase">
                  First look
                </p>
                <h2 className="tingle-poster mt-3 text-[clamp(2.4rem,5.5vw,4.2rem)]">
                  Before you build, see if it&apos;s already out there.
                </h2>
                <p className="mt-5 max-w-md text-[0.98rem] leading-[1.65] text-[var(--cream)]/80">
                  You type one sentence. Tingle looks at public pages and fills
                  three boxes: existing work, live products, and things from the
                  last week. This example uses a real paper. Two boxes are empty
                  because nothing matched — not because we hid them. This is not
                  a patent lawyer. It is a first scan so you don&apos;t build in
                  the dark.
                </p>
              </div>
              <div className="lg:col-span-7">
                <div className="mb-4">
                  <Spidey move="web" height={72} label="First look" />
                </div>
                <PileStage />
              </div>
            </div>
          </section>

          <section id="proof" className="scroll-mt-16 px-5 py-20 md:px-8 md:py-24">
            <p className="font-mono text-[0.68rem] tracking-[0.22em] uppercase">The machinery</p>
            <h2 className="tingle-poster mt-3 max-w-[16ch] text-[clamp(2.4rem,6vw,4.4rem)]">
              Scrapers fetch. Zod trips. Heal stays on the same ID.
            </h2>
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {[
                [
                  "Evidence, not chat",
                  "Rows come from public pages the scrapers returned. If a source did not come back, the UI says it failed. No invented papers.",
                ],
                [
                  "Broken data is an incident",
                  "A Zod miss or an empty extractor is not a quiet log line. It starts a heal. Same collector before and after — the page keeps working.",
                ],
                [
                  "Long-tail sites",
                  "We watch niche boards and listings, not a pre-built Amazon scraper. Your extra URL reuses the watch we already own.",
                ],
              ].map(([title, body], i) => (
                <motion.article
                  key={title}
                  initial={reduce ? false : { opacity: 0, y: 20, rotate: -0.6 }}
                  whileInView={{ opacity: 1, y: 0, rotate: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.5, delay: reduce ? 0 : i * 0.07, ease }}
                  className="border-2 border-[var(--ink)] bg-[var(--cream)] p-5 shadow-[8px_8px_0_var(--poster)]"
                >
                  <h3 className="tingle-poster text-[1.55rem]">{title}</h3>
                  <p className="mt-4 text-[0.92rem] leading-[1.65]">{body}</p>
                </motion.article>
              ))}
            </div>
            <pre className="mt-10 overflow-x-auto border-2 border-[var(--ink)] bg-[var(--ink)] p-5 font-mono text-[0.75rem] leading-relaxed text-[var(--cream)]">
{`validation failed  →  heal preview  →  approve
collector_id_before === collector_id_after
piles still render. application code was not edited.`}
            </pre>
          </section>

          <section id="privacy" className="relative scroll-mt-16 bg-[var(--poster)] px-5 py-20 text-[var(--ink)] md:px-8 md:py-24">
            <div className="tingle-halftone absolute inset-0" />
            <div className="relative">
              <p className="font-mono text-[0.68rem] tracking-[0.22em] uppercase">Privacy</p>
              <h2 className="tingle-poster mt-3 max-w-[14ch] text-[clamp(2.4rem,6vw,4.4rem)]">
                Your pitch is not our dataset.
              </h2>
              <ul className="mt-10 max-w-2xl space-y-4 text-[1.02rem] leading-[1.6]">
                <li>Encrypted vault by default. We see the claim while a job runs. We do not keep a plaintext pitch around to search later.</li>
                <li>Sign-in never asks for GitHub repo access. Putting files in a private <code className="font-mono">.tingle/</code> folder is a later, optional switch.</li>
                <li>Public HTML only. No login walls, paywalls, or other people&apos;s data.</li>
              </ul>
              <div className="mt-10 flex flex-wrap items-center gap-6">
                <SignInButton size="lg" onClick={() => onOpenAuth("signup")}>
                  Create account
                </SignInButton>
                <DemoButton size="lg" />
              </div>
            </div>
          </section>
        </main>

        <footer className="relative z-[2] border-t-2 border-[var(--ink)] px-5 py-8 md:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="tingle-poster text-[clamp(3.5rem,14vw,9rem)] leading-none">Tingle</p>
              <p className="mt-2 font-mono text-[0.72rem] tracking-[0.14em] uppercase">
                A watch on the thing you are actually building.
              </p>
            </div>
            <div className="flex flex-col items-end gap-4">
              <SignInButton size="lg" onClick={() => onOpenAuth("login")} />
              <DemoButton size="lg" />
            </div>
          </div>
        </footer>

        <AnimatePresence>
          {authMode ? (
            <AuthModal
              key="auth"
              mode={authMode}
              onModeChange={onModeChange}
              onClose={onCloseAuth}
            />
          ) : null}
        </AnimatePresence>
      </div>
    </SmoothScroll>
  );
}
