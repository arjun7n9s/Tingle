import Link from "next/link";
import type { Metadata } from "next";
import { LostSpidey } from "./LostSpidey";

export const metadata: Metadata = {
  title: "404 · Tingle",
};

export default function TingleNotFound() {
  return (
    <div className="tingle-paper relative min-h-screen overflow-x-clip">
      <div className="tingle-grain pointer-events-none absolute inset-0 z-[1]" />
      <p className="pointer-events-none absolute top-1/3 right-[-1.1rem] z-[2] hidden font-mono text-[0.65rem] tracking-[0.28em] uppercase [writing-mode:vertical-rl] md:block">
        Page missing
      </p>

      <header className="relative z-[3] border-b-2 border-[var(--ink)] px-5 py-3 md:px-8">
        <Link href="/tingle" className="tingle-poster text-[1.55rem] leading-none">
          Tingle
        </Link>
      </header>

      <main className="relative z-[3] grid min-h-[calc(100vh-3.5rem)] items-center gap-10 px-5 py-10 md:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]">
        <div>
          <p className="font-mono text-[0.68rem] tracking-[0.22em] uppercase">Error 404</p>
          <h1 className="tingle-poster mt-4 max-w-[8ch] text-[clamp(4.2rem,14vw,9rem)]">
            Not on this web.
          </h1>
          <div className="tingle-wire mt-6 w-full max-w-md" />
          <p className="mt-6 max-w-md text-[1.05rem] leading-[1.65]">
            That URL is not a page we watch. The public web is still out there — this path
            just is not on it.
          </p>
          <Link href="/tingle" className="tingle-cta tingle-cta-lg mt-8">
            <span>Back to Tingle</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
        <LostSpidey />
      </main>
    </div>
  );
}
