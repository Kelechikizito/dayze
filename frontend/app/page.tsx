import { RoleButtons } from "@/components/RoleButtons";
import { AnnouncementBar, SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Badge, ButtonLink, Container, Section } from "@/components/ui";

/*
 * Landing. Section cadence (DESIGN.md "Editorial Cadence"):
 * ink bar → white hero → tint stats → white roles (with the one dark card) → tint steps → ink footer.
 * Yellow appears once: the hero CTA.
 */

const stats = [
  { value: "0", caption: "salary amounts readable on the block explorer" },
  { value: "1 bit", caption: "all a landlord learns from an income credential" },
  { value: "k of n", caption: "approvals before a salary above your hidden limit starts" },
];

const roles = [
  {
    eyebrow: "Employers",
    title: "Run payroll in the open, keep the numbers closed.",
    body: "Fund a vault, set a hidden approval threshold, and stream salaries in cUSDC, cARB or cETH. Appoint an auditor who can read the books.",
    href: "/onboarding/employer",
    cta: "Set up an org",
  },
  {
    eyebrow: "Workers",
    title: "Get paid by the second. Show it only when you choose.",
    body: "Watch your pay accrue, withdraw any amount, and prove “I earn at least X” to one verifier without showing your salary.",
    href: "/onboarding/employee",
    cta: "Open your pay",
  },
  {
    eyebrow: "Verifiers and auditors",
    title: "One yes or no, or the full ledger. Never both.",
    body: "A landlord checks a single encrypted answer before it expires. An auditor the employer appointed reads every salary and balance.",
    href: "/audit",
    cta: "Auditor view",
  },
];

const privateItems = ["Salaries", "Vault balances", "Withdrawals", "Approval thresholds", "Income credential answers"];
const publicItems = [
  "Who pays whom, and in which token",
  "When a stream starts, and when it stops",
  "Whether a salary needed approval",
  "Which auditors an employer appointed",
];

const steps = [
  { n: "01", title: "Shield", body: "Wrap USDC, ARB or ETH into a confidential token. Balances become ciphertext." },
  { n: "02", title: "Stream", body: "Fund your vault and create encrypted salary streams. Pay accrues every second." },
  { n: "03", title: "Approve", body: "Salaries above your hidden threshold wait for k of your n approvers." },
  { n: "04", title: "Withdraw and prove", body: "Workers withdraw any amount and issue one-bit income credentials that expire." },
];

/** A stream card mock: what the employer console shows, with amounts hidden */
function StreamMock() {
  return (
    <div className="rounded-2xl bg-gloss-white p-6 md:p-8">
      <div className="flex items-center justify-between">
        <span className="text-caption text-mid-grey">Stream #12</span>
        <Badge>Active</Badge>
      </div>
      <div className="mt-6 flex flex-col gap-1">
        <span className="text-caption text-mid-grey">Acme Labs → 0x3f…a91</span>
        <span className="text-heading-sm">Monthly salary</span>
      </div>
      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 border-t-[1.5px] border-gloss-black pt-6">
        {[
          ["Monthly", "cUSDC"],
          ["Accrued", "cUSDC"],
          ["Withdrawn", "cUSDC"],
          ["Vault", "cUSDC"],
        ].map(([label, unit]) => (
          <div key={label} className="flex flex-col gap-2">
            <dt className="text-caption text-mid-grey">{label}</dt>
            <dd className="flex items-baseline gap-2">
              <span aria-label="encrypted" className="h-6 w-24 rounded-lg bg-gloss-black/90" />
              <span className="text-caption">{unit}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-8 text-caption text-mid-grey">Only the payer, the payee and appointed auditors can decrypt these.</p>
    </div>
  );
}

export default function Home() {
  return (
    <>
      <AnnouncementBar />
      <SiteHeader />

      {/* Hero — white */}
      <section className="bg-pure-white pt-12 pb-20 md:pt-20 md:pb-28">
        <Container className="flex flex-col gap-14">
          <div className="flex flex-col gap-8">
            <Badge ghost>Confidential payroll</Badge>
            <h1 className="max-w-5xl font-classic text-[64px] leading-[0.9] font-normal tracking-[-0.03em] md:text-display lg:text-display-xl">
              Payroll nobody else can read.
            </h1>
          </div>
          <div className="grid items-start gap-14 lg:grid-cols-[1fr_1fr]">
            <div className="flex flex-col gap-8">
              <p className="max-w-xl text-subheading text-soft-charcoal">
                Dayze streams salaries onchain and keeps every amount encrypted. Everyone sees that payroll ran. Only
                the right people see the numbers.
              </p>
              <RoleButtons />
            </div>
            <StreamMock />
          </div>
        </Container>
      </section>

      {/* Stats — tint */}
      <Section tone="tint">
        <div className="grid gap-12 md:grid-cols-3">
          {stats.map((s) => (
            <div key={s.value} className="flex flex-col gap-4">
              <span className="font-classic text-[72px] leading-[0.9] font-normal tracking-[-0.03em] md:text-display">
                {s.value}
              </span>
              <span className="max-w-[16rem]">{s.caption}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Roles + the one dark card — white */}
      <Section id="roles">
        <div className="flex flex-col gap-14">
          <h2 className="max-w-3xl text-[44px] leading-[0.97] tracking-[-0.03em] md:text-heading-lg">
            Three people. Three views of the same payroll.
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {roles.map((r) => (
              <article key={r.eyebrow} className="flex flex-col gap-6 rounded-lg bg-gloss-white p-6">
                <span className="text-caption text-mid-grey uppercase tracking-[0.063em]">{r.eyebrow}</span>
                <h3 className="text-heading-sm">{r.title}</h3>
                <p className="flex-1 text-soft-charcoal">{r.body}</p>
                <div>
                  <ButtonLink href={r.href} variant="outline">
                    {r.cta}
                  </ButtonLink>
                </div>
              </article>
            ))}
          </div>

          <div id="private" className="grid gap-12 rounded-2xl bg-gloss-black p-8 text-gloss-white md:grid-cols-2 md:p-12">
            <div className="flex flex-col gap-6">
              <span className="text-caption text-mid-grey uppercase tracking-[0.063em]">Encrypted</span>
              <ul className="flex flex-col gap-3 text-subheading">
                {privateItems.map((i) => (
                  <li key={i} className="border-b-[1.5px] border-gloss-white/20 pb-3">
                    {i}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-6">
              <span className="text-caption text-mid-grey uppercase tracking-[0.063em]">Public, and why</span>
              <ul className="flex flex-col gap-3 text-subheading">
                {publicItems.map((i) => (
                  <li key={i} className="border-b-[1.5px] border-gloss-white/20 pb-3">
                    {i}
                  </li>
                ))}
              </ul>
              <p className="text-caption text-mid-grey">
                A chain has to show that money moved. Dayze hides how much, and says exactly what it doesn&apos;t hide.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* How it works — tint */}
      <Section tone="tint" id="how">
        <div className="flex flex-col gap-14">
          <h2 className="max-w-3xl text-[44px] leading-[0.97] tracking-[-0.03em] md:text-heading-lg">How it works</h2>
          <ol className="grid gap-10 md:grid-cols-4">
            {steps.map((s) => (
              <li key={s.n} className="flex flex-col gap-4 border-t-[1.5px] border-gloss-black pt-6">
                <span className="text-caption text-mid-grey">{s.n}</span>
                <h3 className="text-subheading">{s.title}</h3>
                <p className="text-soft-charcoal">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      <SiteFooter />
    </>
  );
}
