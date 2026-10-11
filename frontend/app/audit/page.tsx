import { AppGate } from "@/components/AppGate";
import { AuditorView } from "@/components/audit/AuditorView";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Badge, Section } from "@/components/ui";

export default function AuditPage() {
  return (
    <>
      <SiteHeader />
      <Section tone="tint" className="flex-1 !py-12 md:!py-16">
        <div className="flex flex-col gap-8">
          <div className="flex max-w-3xl flex-col gap-4">
            <Badge ghost>Auditor</Badge>
            <h1 className="text-[44px] leading-[0.97] tracking-[-0.03em] md:text-heading-lg">The full ledger, for you alone</h1>
            <p className="text-subheading text-soft-charcoal">
              Employers that named you their auditor let you read every salary, withdrawal and vault balance from then on.
            </p>
          </div>
          <AppGate>
            <AuditorView />
          </AppGate>
        </div>
      </Section>
      <SiteFooter />
    </>
  );
}
