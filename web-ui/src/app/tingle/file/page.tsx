"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AppChrome } from "../AppChrome";
import { ProjectDesk } from "../ProjectDesk";
import { SpideyWait } from "../Spidey";

export default function FilePage() {
  const pathname = usePathname();
  const [id, setId] = useState("");

  useEffect(() => {
    const found = pathname?.match(/\/tingle\/projects\/([^/]+)/)?.[1] ?? "";
    setId(found);
  }, [pathname]);

  if (!id) {
    return (
      <AppChrome>
        <SpideyWait move="run" copy="Opening the file" height={110} />
      </AppChrome>
    );
  }
  return <ProjectDesk id={id} />;
}
