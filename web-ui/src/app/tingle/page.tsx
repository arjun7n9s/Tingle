"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { tingle } from "@/lib/tingle";
import { Home } from "./Home";
import { Landing } from "./Landing";
import { SpideyWait } from "./Spidey";

function authFromQuery(value: string | null): "login" | "signup" | null {
  if (value === "signup") return "signup";
  if (value === "signin") return "login";
  return null;
}

function TingleGate() {
  const params = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "in" | "out">("loading");
  const [me, setMe] = useState<{ email: string } | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(() =>
    authFromQuery(params.get("auth")),
  );

  useEffect(() => {
    setAuthMode(authFromQuery(params.get("auth")));
  }, [params]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await tingle<{ email: string }>("/me");
        if (cancelled) return;
        setMe(user);
        if (!cancelled) setStatus("in");
      } catch {
        if (!cancelled) setStatus("out");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function openAuth(mode: "login" | "signup") {
    setAuthMode(mode);
    const q = mode === "signup" ? "signup" : "signin";
    router.replace(`/tingle?auth=${q}`, { scroll: false });
  }

  function closeAuth() {
    setAuthMode(null);
    router.replace("/tingle", { scroll: false });
  }

  function changeMode(mode: "login" | "signup") {
    setAuthMode(mode);
    const q = mode === "signup" ? "signup" : "signin";
    router.replace(`/tingle?auth=${q}`, { scroll: false });
  }

  if (status === "loading") {
    return (
      <div className="tingle-paper min-h-screen bg-[#f3e9d8] px-5 py-8 md:px-8">
        <p className="tingle-poster text-[1.55rem] leading-none">Tingle</p>
        <div className="mt-10">
          <SpideyWait move="run" copy="Opening the desk" height={110} />
        </div>
      </div>
    );
  }

  if (status === "in" && me) {
    return <Home me={me} />;
  }

  return (
    <Landing
      authMode={authMode}
      onOpenAuth={openAuth}
      onCloseAuth={closeAuth}
      onModeChange={changeMode}
    />
  );
}

export default function TinglePage() {
  return (
    <Suspense
        fallback={
          <div className="tingle-paper min-h-screen bg-[#f3e9d8] px-5 py-8 md:px-8">
            <p className="tingle-poster text-[1.55rem] leading-none">Tingle</p>
            <div className="mt-10">
              <SpideyWait move="run" copy="Opening the desk" height={110} />
            </div>
          </div>
        }
    >
      <TingleGate />
    </Suspense>
  );
}
