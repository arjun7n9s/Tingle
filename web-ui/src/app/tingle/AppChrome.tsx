"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { tingle } from "@/lib/tingle";
import { FileRail, type FileProject } from "./ui";

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [projects, setProjects] = useState<FileProject[]>([]);
  const [filesError, setFilesError] = useState("");
  const activeId = pathname?.match(/\/tingle\/projects\/([^/]+)/)?.[1];

  useEffect(() => {
    const root = document.documentElement;
    const prevHtml = root.style.background;
    const prevBody = document.body.style.background;
    root.style.background = "#f3e9d8";
    document.body.style.background = "#f3e9d8";
    tingle<{ email: string }>("/me")
      .then((u) => setEmail(u.email))
      .catch(() => undefined);
    tingle<{ projects: FileProject[] }>("/projects")
      .then((res) => setProjects(res.projects))
      .catch((err: Error) => setFilesError(err.message));
    return () => {
      root.style.background = prevHtml;
      document.body.style.background = prevBody;
    };
  }, []);

  async function signOut() {
    try {
      await tingle("/auth/logout", { method: "POST" });
    } catch {
      /* still leave */
    }
    window.location.href = "/tingle";
  }

  const fileCount = String(projects.length).padStart(2, "0");

  return (
    <div className="tingle-paper tingle-app relative min-h-screen overflow-x-clip">
      <div className="tingle-app-shell relative z-[1]">
        <aside className="tingle-drawer">
          <Link href="/tingle" className="tingle-poster text-[1.7rem] leading-none text-[var(--cream)]">
            Tingle
          </Link>
          <div className="mt-8 flex items-baseline justify-between gap-3">
            <p className="tingle-kicker mb-0">Files</p>
            <span className="font-mono text-[0.62rem] tracking-[0.16em] text-[var(--poster)]">
              {fileCount}
            </span>
          </div>
          {filesError ? (
            <p className="mt-3 text-sm text-[var(--poster)]">{filesError}</p>
          ) : null}
          <div className="mt-2 flex-1">
            <FileRail projects={projects} activeId={activeId} variant="drawer" />
          </div>
          <div className="mt-8 border-t border-[rgba(243,233,216,0.18)] pt-4">
            {email ? (
              <p className="truncate font-mono text-[0.62rem] tracking-[0.04em] text-[rgba(243,233,216,0.65)]">
                {email}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void signOut()}
              className="mt-2 font-mono text-[0.62rem] tracking-[0.16em] uppercase text-[var(--cream)] hover:text-[var(--poster)]"
            >
              Sign out
            </button>
          </div>
        </aside>

        <div className="tingle-app-work relative">
          <div className="tingle-grain pointer-events-none absolute inset-0" />
          <header className="relative z-[1] flex items-center justify-between gap-4 px-5 py-3 md:px-8">
            <div className="flex items-center gap-5">
              <Link
                href="/tingle"
                className="tingle-poster text-[1.45rem] leading-none lg:hidden"
              >
                Tingle
              </Link>
              <nav className="flex items-center gap-5 font-mono text-[0.68rem] tracking-[0.14em] uppercase">
                <Link href="/tingle" className="tingle-nav">
                  Desk
                </Link>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="tingle-nav lg:hidden"
                >
                  Sign out
                </button>
              </nav>
            </div>
            <Link href="/tingle/new" className="tingle-app-btn py-2 px-3 text-[0.8rem]">
              New file →
            </Link>
          </header>
          <div className="relative z-[1] tingle-app-wire tingle-wire-live" />
          <div className="relative z-[1] lg:hidden">
            <div className="tingle-files-strip">
              <FileRail projects={projects} activeId={activeId} variant="strip" />
            </div>
          </div>
          <main className="relative z-[1] tingle-app-stage">
            <p className="pointer-events-none absolute top-10 left-[-0.85rem] hidden rotate-180 font-mono text-[0.58rem] tracking-[0.28em] uppercase [writing-mode:vertical-rl] lg:block">
              Desk
            </p>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
