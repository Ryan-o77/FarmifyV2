/**
 * Identifiers.
 *
 * `crypto.randomUUID` is available in every browser Farmify targets and in Node,
 * but it is only exposed on secure origins -- so a fallback keeps the app working
 * when someone runs the built site straight off the filesystem or over plain
 * http on a farm office LAN.
 */
export function randomId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  if (c && typeof c.getRandomValues === "function") {
    const bytes = c.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
