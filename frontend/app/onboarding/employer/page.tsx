import { AppGate } from "@/components/AppGate";
import { EmployerOnboarding } from "@/components/employer/EmployerOnboarding";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Badge, Section } from "@/components/ui";

export default function EmployerOnboardingPage() {
  return (
    <>
      <SiteHeader />
      <Section tone="tint" className="flex-1 !py-12 md:!py-16">
        <div className="flex flex-col gap-12">
          <div className="flex max-w-3xl flex-col gap-4">
            <Badge ghost>Employer setup</Badge>
            <p className="text-subheading text-soft-charcoal">
              Six short steps. Each one checks the chain, so you can leave and pick up where you stopped.
            </p>
          </div>
          <AppGate>
            <EmployerOnboarding />
          </AppGate>
        </div>
      </Section>
      <SiteFooter />
    </>
  );
}
