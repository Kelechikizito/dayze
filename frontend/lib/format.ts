/**
 * Shortens a long link for display by cutting its middle, keeping the host and the unique tail.
 * "http://localhost:3000/onboarding/employee?org=0xDBC2…" → "localhost:3000/…bb86681313d90F".
 * Display only: copy buttons still copy the full link.
 * @param max Longest result, in characters
 */
export function shortLink(url: string, max = 30): string {
  const s = url.replace(/^https?:\/\//, "");
  if (s.length <= max) return s;
  const head = Math.ceil((max - 1) / 2);
  const tail = max - 1 - head;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}
