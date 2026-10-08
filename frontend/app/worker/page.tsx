import { AppGate } from "@/components/AppGate";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Section } from "@/components/ui";
import { WorkerApp } from "@/components/worker/WorkerApp";

export default function WorkerPage() {
  return (
    <>
      <SiteHeader />
      <Section tone="tint" className="flex-1 !py-12 md:!py-16">
        <AppGate>
          <WorkerApp />
        </AppGate>
      </Section>
      <SiteFooter />
    </>
  );
}
