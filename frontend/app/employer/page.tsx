import { AppGate } from "@/components/AppGate";
import { EmployerConsole } from "@/components/employer/EmployerConsole";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Section } from "@/components/ui";

export default function EmployerPage() {
  return (
    <>
      <SiteHeader />
      <Section tone="tint" className="flex-1 !py-12 md:!py-16">
        <AppGate>
          <EmployerConsole />
        </AppGate>
      </Section>
      <SiteFooter />
    </>
  );
}
