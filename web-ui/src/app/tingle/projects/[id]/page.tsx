import { Suspense } from "react";
import { AppChrome } from "../../AppChrome";
import { SpideyWait } from "../../Spidey";
import { ProjectDesk } from "./ProjectDesk";

export const dynamic = "force-dynamic";

export default function ProjectPage() {
  return (
    <Suspense
      fallback={
        <AppChrome>
          <SpideyWait move="run" copy="Opening the file" height={110} />
        </AppChrome>
      }
    >
      <ProjectDesk />
    </Suspense>
  );
}
