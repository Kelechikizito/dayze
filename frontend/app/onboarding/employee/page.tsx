import { AppGate } from "@/components/AppGate";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Badge, Section } from "@/components/ui";
import { EmployeeOnboarding } from "@/components/worker/EmployeeOnboarding";

/** Opened from an employer's invite link: /onboarding/employee?org=<payer> */
export default async function EmployeeOnboardingPage(props: PageProps<"/onboarding/employee">) {
  const { org } = await props.searchParams;
  return (
    <>
      <SiteHeader />
      <Section tone="tint" className="flex-1 !py-12 md:!py-16">
        <div className="flex flex-col gap-12">
          <div className="flex max-w-3xl flex-col gap-4">
            <Badge ghost>Get paid privately</Badge>
            <p className="text-subheading text-soft-charcoal">
              A few steps and your salary starts streaming to you, every second, with the amount kept private.
            </p>
          </div>
          <AppGate>
            <EmployeeOnboarding org={typeof org === "string" ? org : undefined} />
          </AppGate>
        </div>
      </Section>
      <SiteFooter />
    </>
  );
}
