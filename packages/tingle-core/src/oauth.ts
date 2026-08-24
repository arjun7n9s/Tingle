import { randomBytes } from "node:crypto";
import type { TingleConfig } from "./config.js";

export type OauthProviders = {
  github: boolean;
  google: boolean;
  github_repo: boolean;
};

export type OauthIdentity = {
  provider: "github" | "google";
  id: string;
  email: string;
  token?: string;
};

type Pending = {
  purpose: "login" | "repo";
  userId?: string;
  projectId?: string;
  created: number;
};

const pending = new Map<string, Pending>();
const TTL_MS = 10 * 60_000;

export function oauthProviders(config: TingleConfig): OauthProviders {
  const github = Boolean(config.githubOAuth.clientId && config.githubOAuth.clientSecret);
  const google = Boolean(config.googleOAuth.clientId && config.googleOAuth.clientSecret);
  return { github, google, github_repo: github };
}

export function newOauthState(row: Omit<Pending, "created">): string {
  gc();
  const id = randomBytes(16).toString("hex");
  pending.set(id, { ...row, created: Date.now() });
  return id;
}

export function takeOauthState(id: string): Pending | undefined {
  gc();
  const row = pending.get(id);
  if (!row) return undefined;
  pending.delete(id);
  return row;
}

export function githubAuthorizeUrl(
  config: TingleConfig,
  state: string,
  purpose: "login" | "repo",
): string {
  const u = new URL("https://github.com/login/oauth/authorize");
  u.searchParams.set("client_id", config.githubOAuth.clientId);
  u.searchParams.set("redirect_uri", `${config.publicUrl}/auth/github/callback`);
  u.searchParams.set("state", state);
  u.searchParams.set(
    "scope",
    purpose === "repo" ? "repo" : "read:user user:email",
  );
  return u.toString();
}

export function googleAuthorizeUrl(config: TingleConfig, state: string): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", config.googleOAuth.clientId);
  u.searchParams.set("redirect_uri", `${config.publicUrl}/auth/google/callback`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", state);
  return u.toString();
}

export async function exchangeGithub(
  config: TingleConfig,
  code: string,
): Promise<OauthIdentity> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.githubOAuth.clientId,
      client_secret: config.githubOAuth.clientSecret,
      code,
      redirect_uri: `${config.publicUrl}/auth/github/callback`,
    }),
  });
  const body = (await res.json()) as { access_token?: string; error?: string };
  if (!body.access_token) {
    throw new Error(body.error || "GitHub token exchange failed");
  }
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${body.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "Tingle/0.1",
    },
  });
  if (!userRes.ok) throw new Error(`GitHub user HTTP ${userRes.status}`);
  const user = (await userRes.json()) as {
    id?: number;
    login?: string;
    email?: string | null;
  };
  let email = user.email?.trim() || "";
  if (!email) {
    const emailsRes = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${body.access_token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "Tingle/0.1",
      },
    });
    if (emailsRes.ok) {
      const emails = (await emailsRes.json()) as {
        email?: string;
        primary?: boolean;
        verified?: boolean;
      }[];
      email =
        emails.find((e) => e.primary && e.verified)?.email ||
        emails.find((e) => e.verified)?.email ||
        emails[0]?.email ||
        "";
    }
  }
  if (!email) {
    email = `${user.login || user.id}@users.noreply.github.com`;
  }
  return {
    provider: "github",
    id: String(user.id ?? user.login),
    email: email.toLowerCase(),
    token: body.access_token,
  };
}

export async function exchangeGoogle(
  config: TingleConfig,
  code: string,
): Promise<OauthIdentity> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.googleOAuth.clientId,
      client_secret: config.googleOAuth.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${config.publicUrl}/auth/google/callback`,
    }),
  });
  const body = (await res.json()) as { access_token?: string; error?: string };
  if (!body.access_token) {
    throw new Error(body.error || "Google token exchange failed");
  }
  const infoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${body.access_token}` },
  });
  if (!infoRes.ok) throw new Error(`Google userinfo HTTP ${infoRes.status}`);
  const info = (await infoRes.json()) as { id?: string; email?: string };
  if (!info.email || !info.id) throw new Error("Google account has no email");
  return { provider: "google", id: info.id, email: info.email.toLowerCase() };
}

function gc() {
  const now = Date.now();
  for (const [k, v] of pending) {
    if (now - v.created > TTL_MS) pending.delete(k);
  }
}
