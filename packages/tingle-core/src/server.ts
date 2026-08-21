import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { loadTingleConfig } from "./config.js";
import { runFirstLook } from "./jobs/firstLook.js";
import { ProjectStore } from "./store.js";

/**
 * Minimal HTTP surface over the headless job. Built on `node:http` on purpose —
 * this exists so the pipeline can be driven end to end without a UI, and it is
 * not worth a framework dependency to do that.
 */
export function createTingleServer(opts: { dataDir?: string } = {}) {
  const config = loadTingleConfig();
  const store = new ProjectStore(
    opts.dataDir ?? path.resolve(process.cwd(), ".data"),
  );

  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const send = (code: number, body: unknown) => {
      const json = JSON.stringify(body, null, 2);
      res.writeHead(code, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(json),
      });
      res.end(json);
    };

    if (req.method === "GET" && req.url === "/health") {
      return send(200, {
        ok: true,
        mode: config.mock ? "mock" : "live",
        collectors: {
          search: Boolean(config.collectors.search),
          watch: Boolean(config.collectors.watch),
          chaos: Boolean(config.collectors.chaos),
        },
      });
    }

    if (req.method !== "POST" || req.url !== "/first-look") {
      return send(404, {
        error: "not found",
        routes: ["GET /health", "POST /first-look"],
      });
    }

    try {
      const body = await readBody(req);
      const result = await runFirstLook(config, store, body);
      // A first look that needs the claim confirmed is a normal outcome, not an
      // error — 200 with a status the caller can branch on.
      return send(200, result);
    } catch (err) {
      return send(400, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > 2_000_000) throw new Error("request body too large");
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) throw new Error("empty request body");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("request body is not valid JSON");
  }
}
