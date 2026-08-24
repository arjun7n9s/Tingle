import { firstLook, parseFirstLookRequest } from "../jobs/firstLook.js";
import { loadEnv, loadTingleConfig } from "../config.js";

loadEnv();
const config = loadTingleConfig();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const req = parseFirstLookRequest({
  pitch: arg("pitch") ?? config.sampleClaim,
  claim: arg("claim"),
  docs_text: arg("docs"),
  github_url: arg("github"),
  patent_number: arg("patent"),
  stage: arg("stage") ?? "starting",
  confirmed: flag("confirm"),
  auto_approve_heal: flag("auto-approve"),
  ignore: arg("ignore") ? arg("ignore")!.split(",").map((s) => s.trim()) : undefined,
});

const result = await firstLook(req, { config });
console.log(JSON.stringify(result, null, 2));
if (result.status === "needs_confirm") {
  console.error(
    "\nClaim not confirmed — no Bright Data credits spent. Re-run with --confirm --claim \"...\"",
  );
  process.exit(2);
}
