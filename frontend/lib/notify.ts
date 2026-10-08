/**
 * Asks the server to email a stream's payee that their pay started (or is awaiting approval).
 * Fire-and-forget: the server reads the stream from the chain, so this only carries ids, and a failed
 * email never blocks payroll.
 */
export function notifyStreamPayee(chainId: number | undefined, streamId: bigint) {
  if (chainId === undefined) return;
  void fetch("/api/notify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chainId, streamId: streamId.toString() }),
  })
    .then((r) => r.json())
    .then((r: { sent?: boolean; reason?: string }) => {
      if (!r.sent) console.info("[dayze] no email sent:", r.reason);
    })
    .catch(() => undefined);
}
