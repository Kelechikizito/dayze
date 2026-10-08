import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "./SiteChrome";
import { Badge, ButtonLink, Section } from "./ui";

/** Shell for routes whose checkpoint isn't built yet */
export function PlaceholderPage({
  checkpoint,
  title,
  children,
}: {
  checkpoint: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <Section tone="tint" className="flex-1">
        <div className="flex max-w-3xl flex-col gap-8">
          <Badge ghost>Checkpoint {checkpoint}</Badge>
          <h1 className="text-[48px] leading-[0.97] tracking-[-0.03em] md:text-heading-lg">{title}</h1>
          <div className="text-subheading text-soft-charcoal">{children}</div>
          <div>
            <ButtonLink href="/" variant="outline">
              ← Back home
            </ButtonLink>
          </div>
        </div>
      </Section>
      <SiteFooter />
    </>
  );
}
