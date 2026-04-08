import {
  hasCompletedBrowserSetup,
  readStoredApiKey,
  readStoredApiUrl,
} from "@/lib/settings/apiCredentials";

function resolvedBaseUrl(): string | undefined {
  if (typeof window !== "undefined") {
    const stored = readStoredApiUrl()?.trim().replace(/\/$/, "") ?? "";
    if (stored) return stored;
  }
  const env = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "") ?? "";
  return env || undefined;
}

function getBaseUrl(): string {
  const base = resolvedBaseUrl();
  if (!base) {
    throw new Error("API base URL is not set (first-run setup or NEXT_PUBLIC_API_URL)");
  }
  return base;
}

/** Both set at build time — skip first-run setup and use env only. */
export function hasFullBuildTimeApiConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_API_URL?.trim() && process.env.NEXT_PUBLIC_API_KEY?.trim(),
  );
}

/** For status UI: env wins, else stored origin. */
export function getDisplayApiBaseUrl(): string | null {
  const r = resolvedBaseUrl();
  return r ?? null;
}

/**
 * API key for `Authorization: Bearer …`.
 * Build-time `NEXT_PUBLIC_API_KEY` wins if set; otherwise localStorage after first-run setup (`ankiv2_api_key`).
 * Base URL: stored `ankiv2_api_url` wins on the client, else `NEXT_PUBLIC_API_URL`.
 */
export function getResolvedApiKey(): string | undefined {
  const envKey = process.env.NEXT_PUBLIC_API_KEY?.trim();
  if (envKey) return envKey;
  if (typeof window === "undefined") return undefined;
  if (!hasCompletedBrowserSetup()) return undefined;
  const stored = readStoredApiKey();
  if (stored === null) return undefined;
  const t = stored.trim();
  return t || undefined;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = getBaseUrl();
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const key = getResolvedApiKey();
  if (key) {
    headers.set("Authorization", `Bearer ${key}`);
  }
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;
  return fetch(url, { ...init, headers });
}

/** True when the app has a backend base URL (build-time env or localStorage after setup). */
export function isApiConfigured(): boolean {
  return Boolean(resolvedBaseUrl());
}

/**
 * True when sync requests can run: base URL is set and either the build supplies
 * `NEXT_PUBLIC_API_KEY` or the user finished the first-run API key screen.
 */
export function isApiReadyForRequests(): boolean {
  if (!isApiConfigured()) return false;
  if (process.env.NEXT_PUBLIC_API_KEY?.trim()) return true;
  if (typeof window === "undefined") return false;
  return hasCompletedBrowserSetup();
}

/**
 * When true, `POST /cards/new/index` is served from local JSON (`src/lib/mock/cards-new-index.response.json`)
 * instead of the network — same filtering as the real API (cards whose `id` is not in the request body).
 *
 * - `NEXT_PUBLIC_USE_SYNC_MOCK=true` / `1` → mock on
 * - `NEXT_PUBLIC_USE_SYNC_MOCK=false` / `0` → mock off (default)
 * - unset → **off** — use the Go API for pull when configured (`npm run dev:mock` enables the fixture)
 */
export function isSyncPullMockEnabled(): boolean {
  const f = process.env.NEXT_PUBLIC_USE_SYNC_MOCK?.trim().toLowerCase();
  if (f === "true" || f === "1") return true;
  if (f === "false" || f === "0") return false;
  return false;
}

/** Whether pull (real or mock) can run — mock does not require `NEXT_PUBLIC_API_URL`. */
export function isPullAvailable(): boolean {
  return isSyncPullMockEnabled() || isApiReadyForRequests();
}
