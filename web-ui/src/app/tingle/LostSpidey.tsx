"use client";

import { useEffect, useState } from "react";

const FRAMES = [
  "/tingle/lost/01.png",
  "/tingle/lost/02.png",
  "/tingle/lost/03.png",
  "/tingle/lost/04.png",
] as const;

/** Time on each pose before the next. Last frame holds. */
const HOLDS_MS = [720, 780, 860];

export function LostSpidey() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setFrame(3);
      return;
    }
    const timers: number[] = [];
    let i = 0;
    const step = () => {
      if (i >= HOLDS_MS.length) return;
      timers.push(
        window.setTimeout(() => {
          i += 1;
          setFrame(i);
          step();
        }, HOLDS_MS[i]),
      );
    };
    step();
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  return (
    <div className="lost-stage" aria-hidden="true">
      {FRAMES.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          className={`lost-frame${i === frame ? " is-on" : ""}${i === 3 && frame === 3 ? " is-end" : ""}`}
        />
      ))}
    </div>
  );
}
