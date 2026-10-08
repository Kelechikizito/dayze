"use client";

import { useLogin, usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import type { Address } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { destinationAfterLogin, rememberRole, rememberedRole, type Role } from "@/lib/routing";
import { Button } from "./ui";

/**
 * "I'm an employer" / "I'm an employee". Logged out: log in first, then route.
 * Logged in: route straight away. The chain decides between console and onboarding.
 */
export function RoleButtons() {
  const router = useRouter();
  const { authenticated } = usePrivy();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const pendingRole = useRef<Role | null>(null);

  const go = async (role: Role, account: Address | undefined) => {
    router.push(await destinationAfterLogin(role, account, publicClient));
  };

  const { login } = useLogin({
    onComplete: ({ user }) => {
      const role = pendingRole.current ?? rememberedRole();
      if (role) void go(role, user.wallet?.address as Address | undefined);
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
      <Button variant="yellow" onClick={() => choose("employer")}>
        I&apos;m an employer
      </Button>
      <Button variant="outline" onClick={() => choose("employee")}>
        I&apos;m an employee
      </Button>
    </div>
  );
}
