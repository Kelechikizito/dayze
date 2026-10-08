"use client";

import { useLogin, usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import type { Address } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { destinationAfterLogin, rememberRole, type Role } from "@/lib/routing";
import { Button } from "./ui";

/**
 * "I'm an employer" / "I'm an employee". Logged out: log in first, then route.
 * Logged in: route straight away. The chain decides between console and onboarding.
 */
export function RoleButtons({ onDark = false }: { onDark?: boolean }) {
  const router = useRouter();
  const { authenticated } = usePrivy();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const pendingRole = useRef<Role | null>(null);

  const go = async (role: Role, account: Address | undefined) => {
    router.push(await destinationAfterLogin(role, account, publicClient));
  };

  const { login } = useLogin({
    // Privy also calls this on page load for a session that's already logged in.
    // Only route after a login the visitor just started from one of these buttons.
    onComplete: ({ user, wasAlreadyAuthenticated }) => {
      const role = pendingRole.current;
      if (wasAlreadyAuthenticated || !role) return;
      void go(role, user.wallet?.address as Address | undefined);
    },
  });

  const choose = (role: Role) => {
    rememberRole(role);
    pendingRole.current = role;
    if (authenticated) void go(role, address);
    else login();
  };

  return (
    <div className="flex flex-wrap gap-3">
      {onDark ? (
        <>
          <Button variant="light" onClick={() => choose("employee")}>
            I&apos;m an employee
          </Button>
          <Button variant="yellow" onClick={() => choose("employer")}>
            I&apos;m an employer
          </Button>
        </>
      ) : (
        <>
          <Button variant="dark" onClick={() => choose("employer")}>
            I&apos;m an employer
          </Button>
          <Button variant="outline" onClick={() => choose("employee")}>
            I&apos;m an employee
          </Button>
        </>
      )}
    </div>
  );
}
