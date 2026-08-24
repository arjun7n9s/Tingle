"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { tingle } from "@/lib/tingle";
import { AppChrome } from "../AppChrome";
import { FileDrop, type DraftFile } from "../FileDrop";
import { SpideyWait } from "../Spidey";

const STAGES = [
  { id: "starting", label: "Starting off", hint: "No public build yet." },
  { id: "building", label: "In progress", hint: "Repo or WIP." },
  { id: "shipped", label: "Done", hint: "Live thing or filing." },
] as const;

const EXTRA: Record<string, { q: string; opts: string[] } | null> = {
  starting: null,
  building: {
    q: "What should we trust most?",
    opts: ["The repo", "The docs", "What I type"],
  },
  shipped: {
    q: "What are we protecting?",
    opts: ["The product", "The filing", "Both"],
  },
};

function NewProjectForm() {
  const [stage, setStage] = useState<(typeof STAGES)[number]["id"]>("starting");
  const [extra, setExtra] = useState("");
  const [title, setTitle] = useState("");
  const [keepPrivate, setKeepPrivate] = useState(true);
  const [pitch, setPitch] = useState("");
  const [github, setGithub] = useState("");
  const [watchList, setWatchList] = useState("");
  const [ignore, setIgnore] = useState("");
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [photoNote, setPhotoNote] = useState("");
  const [proposed, setProposed] = useState("");
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const params = useSearchParams();

  useEffect(() => {
    const c = params.get("claim");
    if (c) setPitch(c);
  }, [params]);

  const extraQ = EXTRA[stage];
  const docsText = [
    photoNote.trim() ? `Photos: ${photoNote.trim()}` : "",
    ...files.filter((f) => f.text).map((f) => f.text as string),
  ]
    .filter(Boolean)
    .join("\n\n");

  const hasMaterial = Boolean(
    pitch.trim() || docsText.trim() || github.trim() || files.length,
  );

  async function create(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      const res = await tingle<{
        project: { id: string };
        proposed_claim: string;
      }>("/projects", {
        method: "POST",
        body: JSON.stringify({
          stage,
          extra_question: extraQ ? extra : undefined,
          title: title || undefined,
          stealth: keepPrivate,
          pitch: pitch || undefined,
          docs_text: docsText || undefined,
          attachments: files.map((f) => ({
            name: f.name,
            kind: f.kind,
            text: f.text,
            image_data: f.image_data,
          })),
          github_url: github || undefined,
          watch_list: watchList
            ? watchList.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
            : [],
          ignore: ignore
            ? ignore.split(",").map((s) => s.trim()).filter(Boolean)
            : [],
        }),
      });
      setProjectId(res.project.id);
      setProposed(res.proposed_claim);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  async function runLook() {
    setPending(true);
    setError("");
    try {
      await tingle(`/projects/${projectId}/first-look`, {
        method: "POST",
        body: JSON.stringify({ claim: proposed, confirmed: true }),
      });
      window.location.href = `/tingle/projects/${projectId}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <span className="tingle-band">New file</span>
        <h1 className="tingle-app-title mt-4">Name it. Drop what you have. Look.</h1>
        <p className="mt-3 text-[0.98rem] leading-relaxed text-[var(--muted)]">
          Short name on the left rail. One sentence is what we search. We
          spend after you confirm.
        </p>
      </div>
      <form onSubmit={create} className="space-y-8">
        <label className="block">
          Call it
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Haptic gloves"
            className="mt-1 w-full"
          />
        </label>

        <fieldset>
          <legend className="tingle-kicker mb-3">Where are you?</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {STAGES.map((s) => (
              <button
                key={s.id}
                type="button"
                data-on={stage === s.id}
                className="tingle-choice"
                onClick={() => {
                  setStage(s.id);
                  setExtra(EXTRA[s.id]?.opts[0] ?? "");
                }}
              >
                <div>{s.label}</div>
                <div className="mt-1 font-mono text-[0.6rem] tracking-[0.06em] opacity-70">
                  {s.hint}
                </div>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="tingle-kicker mb-3">Who can see the pitch?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              data-on={keepPrivate}
              className="tingle-choice"
              onClick={() => setKeepPrivate(true)}
            >
              <div>Keep it private</div>
              <div className="mt-1 font-mono text-[0.6rem] tracking-[0.06em] opacity-70">
                We still search the public web. We don’t reprint your pitch.
              </div>
            </button>
            <button
              type="button"
              data-on={!keepPrivate}
              className="tingle-choice"
              onClick={() => setKeepPrivate(false)}
            >
              <div>Fine if this is public</div>
              <div className="mt-1 font-mono text-[0.6rem] tracking-[0.06em] opacity-70">
                The sentence can show on your desk.
              </div>
            </button>
          </div>
        </fieldset>

        {extraQ ? (
          <fieldset className="space-y-2">
            <legend className="tingle-kicker mb-2">{extraQ.q}</legend>
            {extraQ.opts.map((o) => (
              <label key={o} className="flex cursor-pointer gap-2 text-sm">
                <input
                  type="radio"
                  name="extra"
                  checked={extra === o}
                  onChange={() => setExtra(o)}
                />
                {o}
              </label>
            ))}
          </fieldset>
        ) : null}

        <label className="block">
          The idea, in your words
          <textarea
            value={pitch}
            onChange={(e) => setPitch(e.target.value)}
            rows={4}
            placeholder="One paragraph is enough if you have no files yet."
            className="tingle-pad mt-1"
          />
        </label>

        <FileDrop items={files} onChange={setFiles} note={photoNote} onNote={setPhotoNote} />

        <section className="space-y-6">
          <p className="tingle-kicker">Places you already have</p>
          <div>
            <label htmlFor="tingle-github" className="block">
              GitHub URL
            </label>
            <p className="mt-1 text-sm font-normal text-[var(--muted)]">
              Your repo. We read the public README. This is not the qualifying
              scrape — Studio still hits the long-tail listings.
            </p>
            <input
              id="tingle-github"
              value={github}
              onChange={(e) => setGithub(e.target.value)}
              placeholder="https://github.com/you/this-thing"
              className="mt-2 w-full"
            />
          </div>
          <div>
            <label htmlFor="tingle-watch" className="block">
              Extra public pages to watch
            </label>
            <p className="mt-1 text-sm font-normal text-[var(--muted)]">
              One URL per line. Changelog, docs, a niche board. Not GitHub,
              Reddit, Amazon, or Product Hunt — those have pre-built scrapers.
            </p>
            <textarea
              id="tingle-watch"
              value={watchList}
              onChange={(e) => setWatchList(e.target.value)}
              rows={3}
              placeholder="https://example.com/changelog"
              className="mt-2 w-full"
            />
          </div>
          <div>
            <label htmlFor="tingle-ignore" className="block">
              Skip these
            </label>
            <p className="mt-1 text-sm font-normal text-[var(--muted)]">
              Names or sites that look adjacent but aren’t you. Comma-separated.
            </p>
            <input
              id="tingle-ignore"
              value={ignore}
              onChange={(e) => setIgnore(e.target.value)}
              placeholder="old brand name, that other glove company"
              className="mt-2 w-full"
            />
          </div>
        </section>

        {!projectId ? (
          <button type="submit" disabled={pending || !hasMaterial} className="tingle-app-btn">
            {pending ? "…" : "Rewrite as one sentence →"}
          </button>
        ) : null}
      </form>
      {projectId ? (
        <div className="tingle-panel space-y-3">
          <p className="text-sm text-[var(--muted)]">
            Confirm this sentence. That is what we search. We spend after you
            confirm.
          </p>
          <textarea
            value={proposed}
            onChange={(e) => setProposed(e.target.value)}
            rows={8}
            className="tingle-pad w-full"
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => void runLook()}
            className="tingle-app-btn"
          >
            {pending ? "Looking…" : "Run first look →"}
          </button>
        </div>
      ) : null}
      {pending ? (
        <SpideyWait
          move="run"
          copy={projectId ? "Looking" : "Rewriting"}
        />
      ) : null}
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

export default function NewProjectPage() {
  return (
    <AppChrome>
      <Suspense fallback={<SpideyWait move="run" copy="Loading" height={96} />}>
        <NewProjectForm />
      </Suspense>
    </AppChrome>
  );
}
