"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ProjectError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="tingle-paper tingle-app min-h-[60vh] px-5 py-10 md:px-8">
      <p className="tingle-kicker">File would not open</p>
      <h1 className="tingle-app-title mt-3">This desk hit a server error.</h1>
      <p className="mt-3 max-w-xl text-[0.98rem] leading-relaxed text-[var(--muted)]">
        The look is still in the vault. Open the file again, or go back to the
        list and pick it from there.
      </p>
      <Link href="/tingle" className="tingle-app-btn mt-8 inline-flex">
        Back to files →
      </Link>
    </div>
  );
}
