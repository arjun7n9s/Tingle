import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { repoRootFromScripts } from "../artifacts.js";
import { createTingleServer } from "../server.js";

const root = repoRootFromScripts(path.dirname(fileURLToPath(import.meta.url)));
dotenv.config({ path: path.join(root, ".env") });

const port = Number(process.env.TINGLE_PORT ?? 8788);
const host = process.env.TINGLE_HOST ?? "127.0.0.1";

createTingleServer({ dataDir: path.join(root, ".data") }).listen(port, host, () => {
  console.log(`Tingle first-look API on http://${host}:${port}`);
  console.log("  GET  /health");
  console.log("  POST /first-look");
});
