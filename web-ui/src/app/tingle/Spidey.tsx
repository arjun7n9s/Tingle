"use client";

import { useEffect, useState } from "react";

const MOVES = {
  idle: { src: "/tingle/spidey/idle.png", frames: 10, w: 117, h: 99, ms: 90 },
  punch: { src: "/tingle/spidey/punch.png", frames: 13, w: 156, h: 117, ms: 70 },
  flip: { src: "/tingle/spidey/flip.png", frames: 7, w: 174, h: 119, ms: 80 },
  web: { src: "/tingle/spidey/web.png", frames: 13, w: 158, h: 83, ms: 75 },
  lunge: { src: "/tingle/spidey/lunge.png", frames: 12, w: 127, h: 96, ms: 70 },
  shot: { src: "/tingle/spidey/shot.png", frames: 6, w: 121, h: 79, ms: 90 },
  spin: { src: "/tingle/spidey/spin.png", frames: 10, w: 140, h: 96, ms: 55 },
  ready: { src: "/tingle/spidey/ready.png", frames: 6, w: 100, h: 76, ms: 110 },
  run: { src: "/tingle/spidey/run.png", frames: 4, w: 188, h: 180, ms: 110 },
  think: { src: "/tingle/spidey/think.png", frames: 2, w: 99, h: 101, ms: 280 },
} as const;

export type SpideyMove = keyof typeof MOVES;

export function Spidey({
  move,
  height = 88,
  label,
}: {
  move: SpideyMove;
  height?: number;
  label?: string;
}) {
  const meta = MOVES[move];
  const [frame, setFrame] = useState(0);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(
      () => setFrame((n) => (n + 1) % meta.frames),
      meta.ms,
    );
    return () => window.clearInterval(id);
  }, [meta, reduce]);

  const scale = height / meta.h;
  const w = Math.round(meta.w * scale);
  const h = Math.round(meta.h * scale);
  const i = reduce ? 0 : frame;

  return (
    <span className="spidey-slot" role="img" aria-label={label ?? "Spider-Man"}>
      <span
        className="spidey"
        style={{
          width: w,
          height: h,
          backgroundImage: `url(${meta.src})`,
          backgroundPosition: `${-i * w}px 0`,
          backgroundSize: `${meta.frames * w}px ${h}px`,
        }}
      />
    </span>
  );
}

export function SpideyWait({
  move = "run",
  copy = "Looking",
  height = 96,
}: {
  move?: SpideyMove;
  copy?: string;
  height?: number;
}) {
  return (
    <div className="spidey-wait">
      <Spidey move={move} height={height} label={copy} />
      <p className="spidey-kicker">{copy}</p>
    </div>
  );
}
