"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { Badge, Button } from "./ui";

/** Short form of an address: 0x1234…abcd */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Log in / log out, with the active wallet once logged in */
export function AuthButton() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { address } = useAccount();

  if (!ready) {
    return (
      <Button variant="outline" disabled className="opacity-50">
        Loading…
      </Button>
    );
  }

  if (!authenticated) {
    return (
      <Button variant="dark" onClick={login}>
        Log in
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {address && <Badge>{shortAddress(address)}</Badge>}
      <Button variant="outline" onClick={logout}>
        Log out
      </Button>
    </div>
  );
}
