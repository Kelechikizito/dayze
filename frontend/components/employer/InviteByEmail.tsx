"use client";

import { useState } from "react";
import { useSignMessage } from "wagmi";
import { Input } from "@/components/forms";
import { Button } from "@/components/ui";
import { useDayze } from "@/hooks/useDayze";
import { shortError } from "@/hooks/useTx";
import { inviteMessage, looksLikeEmail } from "@/lib/invite";

/**
 * Emails the invite link. The employer signs a short message first (no gas), so the server knows the
 * invite really comes from this org. The address is used to send and then forgotten.
 */
export function InviteByEmail({ onSent }: { onSent?: () => void }) {
  const { account, chainId } = useDayze();
  const { signMessageAsync } = useSignMessage();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ status: "idle" | "signing" | "sending" | "sent" | "error"; message?: string }>({
    status: "idle",
  });
  if (!account || chainId === undefined) return null;

  const send = async () => {
    const to = email.trim();
    if (!looksLikeEmail(to)) return;
    try {
      setState({ status: "signing" });
      const issuedAt = Math.floor(Date.now() / 1000);
      const signature = await signMessageAsync({ message: inviteMessage(account, to, chainId, issuedAt) });
      setState({ status: "sending" });
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ org: account, email: to, chainId, issuedAt, signature }),
      });
      const body = (await res.json()) as { sent?: boolean; error?: string };
      if (!res.ok || !body.sent) throw new Error(body.error ?? "Couldn't send the invite");
      setState({ status: "sent", message: `Invite sent to ${to}.` });
      setEmail("");
      onSent?.();
    } catch (e) {
      setState({ status: "error", message: shortError(e) });
    }
  };

  const busy = state.status === "signing" || state.status === "sending";
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <span className="text-caption text-mid-grey">Or invite by email</span>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" autoComplete="off" />
        <Button type="submit" variant="dark" disabled={!looksLikeEmail(email) || busy} className="shrink-0">
          {state.status === "signing" ? "Sign in your wallet…" : state.status === "sending" ? "Sending…" : "Send invite"}
        </Button>
      </div>
      <span className="text-caption text-soft-charcoal">
        {state.message ?? "You'll sign a short message first (no gas). The address isn't stored."}
      </span>
    </form>
  );
}
