import { AppGate } from "@/components/AppGate";
import { ApprovalsSection } from "@/components/employer/ApprovalsSection";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Badge, Section } from "@/components/ui";

/** /approvals: for approvers, who may have no org of their own */
export default function ApprovalsPage() {
  return (
    <>
      <SiteHeader />
      <Section tone="tint" className="flex-1 !py-12 md:!py-16">
        <div className="flex flex-col gap-8">
          <div className="flex max-w-3xl flex-col gap-4">
            <Badge ghost>Approver</Badge>
            <h1 className="text-[44px] leading-[0.97] tracking-[-0.03em] md:text-heading-lg">Salaries waiting for you</h1>
            <p className="text-subheading text-soft-charcoal">
              An employer named you an approver. Salaries above their hidden limit start only once enough approvers say
              yes. You never see the salary or the limit.
            </p>
          </div>
          <AppGate>
            <ApprovalsSection />
          </AppGate>
        </div>
      </Section>
      <SiteFooter />
    </>
  );
}
