import { PlaceholderPage } from "@/components/PlaceholderPage";

export default async function VerifyCredential(props: PageProps<"/verify/[id]">) {
  const { id } = await props.params;
  return (
    <PlaceholderPage checkpoint="12" title={`Income credential #${id}`}>
      If this credential was issued to you, you&apos;ll see one answer: does this person earn at least the amount you
      asked about, yes or no.
    </PlaceholderPage>
  );
}
