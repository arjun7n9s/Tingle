export function fetchT(
  url: string | URL,
  init: RequestInit = {},
  ms = 20_000,
): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(ms),
  });
}
