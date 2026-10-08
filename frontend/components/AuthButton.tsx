"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { Badge, Button } from "./ui";

/** Short form of an address: 0x1234…abcd */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Log in / log out, with the active wallet once logged in.
 * @param onDark Light styling for use over the hero video
 */
export function AuthButton({ onDark = false }: { onDark?: boolean }) {
  const { ready, authenticated, login, logout } = usePrivy();
  const { address } = useAccount();

  if (!ready) {
    return (
      <Button variant={onDark ? "outline-light" : "outline"} disabled className="opacity-50">
        Loading…
      </Button>
    );
  }

  if (!authenticated) {
    return (
      <Button variant={onDark ? "light" : "dark"} onClick={login}>
        Log in
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {address &&
        (onDark ? (
          <span className="rounded-lg bg-pure-white/15 px-3 py-1 text-caption text-pure-white backdrop-blur">
            {shortAddress(address)}
          </span>
        ) : (
          <Badge>{shortAddress(address)}</Badge>
        ))}
      <Button variant={onDark ? "outline-light" : "outline"} onClick={logout}>
        Log out
      </Button>
    </div>
  );
}
