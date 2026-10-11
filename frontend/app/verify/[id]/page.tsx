import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Section } from "@/components/ui";
import { CredentialView } from "@/components/verify/CredentialView";

export default async function VerifyCredential(props: PageProps<"/verify/[id]">) {
  const { id } = await props.params;
  return (
    <>
      <SiteHeader />
      <Section tone="tint" className="flex-1 !py-12 md:!py-16">
        <CredentialView id={id} />
      </Section>
      <SiteFooter />
    </>
  );
}
