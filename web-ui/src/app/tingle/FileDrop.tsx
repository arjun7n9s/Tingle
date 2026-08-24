"use client";

import { useEffect, useRef, useState } from "react";

export type DraftFile = {
  id: string;
  name: string;
  kind: "image" | "text" | "file";
  text?: string;
  image_data?: string;
};

const TEXT_RE = /\.(txt|md|markdown|csv|json|html?)$/i;

export function FileDrop({
  items,
  onChange,
  note,
  onNote,
}: {
  items: DraftFile[];
  onChange: (next: DraftFile[]) => void;
  note: string;
  onNote: (v: string) => void;
}) {
  const filesRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<HTMLInputElement>(null);
  const shotRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camOn, setCamOn] = useState(false);
  const [camError, setCamError] = useState("");
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => () => stopCam(), []);

  function stopCam() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
  }

  async function startCam() {
    setCamError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      shotRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setCamOn(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setCamError("Camera blocked — use Take photo instead.");
      shotRef.current?.click();
    }
  }

  async function snap() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    const max = 960;
    const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.72),
    );
    if (!blob) return;
    await addFiles([
      new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" }),
    ]);
    stopCam();
  }

  async function addFiles(list: File[] | FileList) {
    const next = [...items];
    for (const file of Array.from(list)) {
      if (next.length >= 8) break;
      next.push(await readOne(file));
    }
    onChange(next);
  }

  return (
    <section>
      <p className="tingle-kicker mb-2">Your files</p>
      <p className="mb-3 text-sm leading-relaxed text-[var(--muted)]">
        Photos, camera, or a spec you already wrote. This is your file, not a
        scrape. We read the text. Pictures need a line about what they show.
      </p>
      <div
        className="tingle-drop cursor-pointer px-4 py-6 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
        }}
        onClick={() => filesRef.current?.click()}
      >
        Drop files here, or click to browse
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="tingle-app-btn-ghost"
          onClick={() => photosRef.current?.click()}
        >
          Photos
        </button>
        <button type="button" className="tingle-app-btn-ghost" onClick={() => void startCam()}>
          Camera
        </button>
        <button
          type="button"
          className="tingle-app-btn-ghost"
          onClick={() => shotRef.current?.click()}
        >
          Take photo
        </button>
        <button
          type="button"
          className="tingle-app-btn-ghost"
          onClick={() => filesRef.current?.click()}
        >
          Files
        </button>
      </div>
      <input
        ref={filesRef}
        type="file"
        multiple
        className="hidden"
        accept=".txt,.md,.markdown,.csv,.json,.html,.htm,.pdf,image/*,text/plain"
        onChange={(e) => {
          if (e.target.files?.length) void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={photosRef}
        type="file"
        multiple
        className="hidden"
        accept="image/*"
        onChange={(e) => {
          if (e.target.files?.length) void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={shotRef}
        type="file"
        className="hidden"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          if (e.target.files?.length) void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {camOn ? (
        <div className="mt-4 space-y-2">
          <video
            ref={videoRef}
            className="w-full max-w-md border-2 border-[var(--ink)] bg-[var(--ink)]"
            playsInline
            muted
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="tingle-app-btn" onClick={() => void snap()}>
              Snap →
            </button>
            <button type="button" className="tingle-app-btn-ghost" onClick={stopCam}>
              Close camera
            </button>
          </div>
        </div>
      ) : null}
      {camError ? <p className="mt-2 text-sm text-[var(--danger)]">{camError}</p> : null}
      {items.length ? (
        <ul className="mt-4 space-y-2">
          {items.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-3 border-b-2 border-[var(--ink)] py-2 text-sm"
            >
              <span>
                <span className="font-mono text-[0.58rem] tracking-[0.12em] uppercase text-[var(--poster)]">
                  {a.kind}
                </span>{" "}
                {a.name}
              </span>
              <button
                type="button"
                className="tingle-app-btn-ghost px-2 py-1 text-xs"
                onClick={() => onChange(items.filter((x) => x.id !== a.id))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {items.some((a) => a.kind === "image") ? (
        <label className="mt-4 block">
          What’s in the photos
          <input
            value={note}
            onChange={(e) => onNote(e.target.value)}
            placeholder="Haptic glove prototype on the bench"
            className="mt-1 w-full"
          />
        </label>
      ) : null}
    </section>
  );
}

async function readOne(file: File): Promise<DraftFile> {
  const id = `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(16).slice(2)}`;
  if (file.type.startsWith("image/")) {
    const image_data = await compressImage(file);
    return { id, name: file.name, kind: "image", image_data };
  }
  if (TEXT_RE.test(file.name) || file.type.startsWith("text/") || file.type === "application/json") {
    return { id, name: file.name, kind: "text", text: (await file.text()).slice(0, 40_000) };
  }
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const extracted = extractPdfText(new Uint8Array(await file.arrayBuffer()));
    return {
      id,
      name: file.name,
      kind: "file",
      text: extracted
        ? extracted
        : `PDF attached: ${file.name}. No extractable text (scanned or compressed). Paste the abstract in the idea box if you want us to search from it.`,
    };
  }
  return { id, name: file.name, kind: "file" };
}

async function compressImage(file: File): Promise<string | undefined> {
  if (file.size > 2_000_000) return undefined;
  const bitmap = await createImageBitmap(file);
  const max = 960;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const data = canvas.toDataURL("image/jpeg", 0.72);
  return data.length <= 700_000 ? data : undefined;
}

/** Uncompressed PDF text only. Scanned PDFs stay a labeled stub. */
function extractPdfText(bytes: Uint8Array): string {
  const raw = new TextDecoder("latin1").decode(bytes);
  if (!raw.startsWith("%PDF")) return "";
  const chunks: string[] = [];
  const re = /\((?:\\.|[^\\)]){3,}\)/g;
  for (const m of raw.matchAll(re)) {
    const s = m[0]
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\n")
      .replace(/\\t/g, " ")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\\\/g, "\\");
    if (/[A-Za-z]{3,}/.test(s)) chunks.push(s);
  }
  return chunks.join(" ").replace(/\s+/g, " ").trim().slice(0, 40_000);
}
