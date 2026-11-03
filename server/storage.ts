// Preconfigured storage helpers for Manus WebDev templates.
// Uses the storage proxy; never include upstream bodies or signed URLs in errors.
import { ENV } from "./_core/env";

const STORAGE_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_RESPONSE_BYTES = 64 * 1024;
type StorageConfig = { baseUrl: string; apiKey: string };

function getStorageConfig(): StorageConfig {
  const { forgeApiUrl: baseUrl, forgeApiKey: apiKey } = ENV;
  if (!baseUrl || !apiKey) throw new Error("Storage proxy credentials missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY");
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}
function normalizeKey(relKey: string): string { return relKey.replace(/^\/+/, ""); }
function endpoint(baseUrl: string, operation: string, key: string): URL {
  const url = new URL(`v1/storage/${operation}`, `${baseUrl}/`);
  url.searchParams.set("path", key);
  return url;
}
function budget(parent?: AbortSignal) {
  // A supplied signal is the caller's cumulative budget, not a fresh timeout.
  const controller = new AbortController();
  const timer = parent ? undefined : setTimeout(() => controller.abort(new Error("Storage deadline exceeded.")), STORAGE_TIMEOUT_MS);
  timer?.unref();
  return { signal: parent ?? controller.signal, dispose: () => { if (timer) clearTimeout(timer); } };
}
async function responseUrl(response: Response, signal: AbortSignal): Promise<string> {
  // Read through a cancellable reader: even a response that drips forever must
  // settle and release its body before the caller releases its resource slot.
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Storage request failed (${response.status}).`);
  }
  const reader = response.body.getReader();
  let cancellation: Promise<void> | undefined;
  const cancel = () => cancellation ??= reader.cancel().catch(() => undefined);
  const abort = () => { void cancel(); };
  signal.addEventListener("abort", abort, { once: true });
  const bytes: Uint8Array[] = [];
  let size = 0;
  try {
    signal.throwIfAborted();
    while (true) {
      const next = await reader.read();
      signal.throwIfAborted();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error("Storage response invalid.");
      bytes.push(next.value);
    }
    const value: unknown = JSON.parse(Buffer.concat(bytes, size).toString("utf8"));
    if (!value || typeof value !== "object" || !("url" in value) || typeof value.url !== "string") throw new Error("Storage response invalid.");
    const url = new URL(value.url);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Storage response invalid.");
    return url.href;
  } finally {
    signal.removeEventListener("abort", abort);
    // A second reader.cancel() can resolve immediately even while the first
    // underlying cancellation is still pending. Await the original operation.
    await cancel();
    reader.releaseLock();
  }
}
async function requestUrl(url: URL, init: RequestInit, signal?: AbortSignal): Promise<string> {
  const deadline = budget(signal);
  try {
    deadline.signal.throwIfAborted();
    const response = await fetch(url, { ...init, signal: deadline.signal });
    return await responseUrl(response, deadline.signal);
  } catch {
    // Do not expose proxy response text, credentials, capability keys or URLs.
    throw new Error(deadline.signal.aborted ? "Storage request aborted." : "Storage request failed.");
  } finally { deadline.dispose(); }
}
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
  signal?: AbortSignal,
): Promise<{ key: string; url: string }> {
  const { baseUrl, apiKey } = getStorageConfig();
  const key = normalizeKey(relKey);
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data as any], { type: contentType });
  const form = new FormData();
  form.append("file", blob, key.split("/").pop() || "file");
  const url = await requestUrl(endpoint(baseUrl, "upload", key), { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form }, signal);
  return { key, url };
}
export async function storageGet(relKey: string, signal?: AbortSignal): Promise<{ key: string; url: string }> {
  const { baseUrl, apiKey } = getStorageConfig();
  const key = normalizeKey(relKey);
  const url = await requestUrl(endpoint(baseUrl, "downloadUrl", key), { method: "GET", headers: { Authorization: `Bearer ${apiKey}` } }, signal);
  return { key, url };
}
