import { AppGate } from "@/components/AppGate";
import { EmployerConsole } from "@/components/employer/EmployerConsole";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Section } from "@/components/ui";

/** /employer, or /employer?payee=0x… from a worker's "pay me" link */
export default async function EmployerPage(props: PageProps<"/employer">) {
  const { payee } = await props.searchParams;
  return (
    <>
      <SiteHeader />
      <Section tone="tint" className="flex-1 !py-12 md:!py-16">
        <AppGate>
          <EmployerConsole payee={typeof payee === "string" ? payee : undefined} />
        </AppGate>
      </Section>
      <SiteFooter />
    </>
  );
}
