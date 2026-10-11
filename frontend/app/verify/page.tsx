import { AppGate } from "@/components/AppGate";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Badge, Section } from "@/components/ui";
import { VerifierHome } from "@/components/verify/VerifierHome";

export default function VerifierPage() {
  return (
    <>
      <SiteHeader />
      <Section tone="tint" className="flex-1 !py-12 md:!py-16">
        <div className="flex flex-col gap-8">
          <div className="flex max-w-3xl flex-col gap-4">
            <Badge ghost>Verifier</Badge>
            <h1 className="text-[44px] leading-[0.97] tracking-[-0.03em] md:text-heading-lg">Check an income, not a salary</h1>
            <p className="text-subheading text-soft-charcoal">
              A worker can prove they earn at least an amount you choose. You learn yes or no, never the figure.
            </p>
          </div>
          <AppGate>
            <VerifierHome />
          </AppGate>
        </div>
      </Section>
      <SiteFooter />
    </>
  );
}
