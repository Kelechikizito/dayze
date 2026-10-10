import type { ReactNode } from "react";
import { ChainVsYou } from "@/components/landing/ChainVsYou";
import { HeroPayCard } from "@/components/landing/HeroPayCard";
import { HeroVideo } from "@/components/landing/HeroVideo";
import { AuditorMock, CredentialMock, EmployerMock } from "@/components/landing/RoleMocks";
import { CountUp } from "@/components/motion/CountUp";
import { Reveal, RiseWords } from "@/components/motion/Reveal";
import { RoleButtons } from "@/components/RoleButtons";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Badge, ButtonLink, Section } from "@/components/ui";

/*
 * Landing. Section cadence (DESIGN.md "Editorial Cadence"):
 * video hero → solar wash live pay → tint stats → white ledgers → tint roles → white privacy → periwinkle steps → tint roadmap → ink footer.
 * Yellow: the hero CTA (on dark video), the live-pay wash, and the "Yes" chip inside the credential mock (a product-UI metric chip).
 */

const roles: { eyebrow: string; title: string; body: string; href: string; cta: string; mock: ReactNode }[] = [
  {
    eyebrow: "Employers",
    title: "Run payroll in the open. Keep the numbers closed.",
    body: "Fund a vault, set a hidden approval threshold, and stream salaries in cUSDC, cARB or cETH.",
    href: "/onboarding/employer",
    cta: "Set up an org",
    mock: <EmployerMock />,
  },
  {
    eyebrow: "Workers",
    title: "Get paid by the second. Prove it only when you choose.",
    body: "Withdraw any amount, and show a landlord “I earn at least X” without showing your salary.",
    href: "/onboarding/employee",
    cta: "Open your pay",
    mock: <CredentialMock />,
  },
  {
    eyebrow: "Auditors",
    title: "The full ledger, for the one person who should read it.",
    body: "An employer appoints you. You read every salary and balance, and export the month as CSV.",
    href: "/audit",
    cta: "Auditor view",
    mock: <AuditorMock />,
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

const roadmap = [
  {
    title: "Invite by email",
    body: "Type an employee's email and Dayze sends them your invite link. The address is used once and never stored.",
  },
  {
    title: "Pay notifications",
    body: "An email when your stream starts or is approved. It says your pay started, never how much.",
  },
];

const statNumber = "font-classic text-[80px] leading-[0.9] tracking-[-0.03em] md:text-display";
const sectionHeading = "text-[44px] leading-[0.97] tracking-[-0.03em] md:text-heading-lg";

export default function Home() {
  return (
    <>
      {/* Hero — full-bleed video, white type bottom-left */}
      <section className="relative isolate flex min-h-[100svh] flex-col justify-end overflow-hidden text-pure-white">
        <HeroVideo />
        <SiteHeader overlay />
        <div className="relative z-10 mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-6 pt-32 pb-16 md:pb-20">
          <h1 className="max-w-4xl font-classic text-[56px] leading-[0.92] font-normal tracking-[-0.03em] md:text-display lg:text-[112px]">
            <RiseWords text="Payroll nobody else can read." />
          </h1>
          <div className="fade-up" style={{ animationDelay: "500ms" }}>
            <p className="max-w-xl text-subheading text-pure-white/85">
              Salaries stream onchain by the second. Every amount stays encrypted. Everyone can see payroll ran. Only the
              right people see the numbers.
            </p>
          </div>
          <div className="fade-up" style={{ animationDelay: "650ms" }}>
            <RoleButtons onDark />
          </div>
        </div>
      </section>

      {/* Live pay — solar wash */}
      <section className="bg-solar-wash py-20 md:py-28">
        <div className="mx-auto grid w-full max-w-[1200px] items-center gap-14 px-6 lg:grid-cols-[1fr_1.1fr]">
          <Reveal className="flex flex-col gap-6">
            <Badge ghost>Live · by the second</Badge>
            <h2 className={sectionHeading}>Pay that moves while you watch.</h2>
            <p className="max-w-md text-subheading text-soft-charcoal">
              Your salary accrues every second and you can withdraw any of it, any time. Flip the card to see what the
              rest of the world gets: ciphertext.
            </p>
          </Reveal>
          <Reveal delay={150}>
            <HeroPayCard />
          </Reveal>
        </div>
      </section>

      {/* Stats — tint */}
      <Section tone="tint">
        <div className="grid gap-12 md:grid-cols-3">
          <Reveal className="flex flex-col gap-4">
            <span className={statNumber}>
              <CountUp to={0} />
            </span>
            <span className="max-w-[16rem]">salary amounts readable on the block explorer</span>
          </Reveal>
          <Reveal delay={120} className="flex flex-col gap-4">
            <span className={statNumber}>
              <CountUp to={1} suffix=" bit" />
            </span>
            <span className="max-w-[16rem]">all a landlord learns from an income credential</span>
          </Reveal>
          <Reveal delay={240} className="flex flex-col gap-4">
            <span className={statNumber}>
              <CountUp to={86400} grouped />
            </span>
            <span className="max-w-[16rem]">times a day your pay moves. It accrues every second.</span>
          </Reveal>
        </div>
      </Section>

      {/* Chain vs you — white */}
      <Section>
        <div className="flex flex-col gap-14">
          <Reveal className="flex max-w-3xl flex-col gap-6">
            <Badge ghost>Same transactions</Badge>
            <h2 className={sectionHeading}>Public ledger. Private numbers.</h2>
            <p className="max-w-xl text-subheading text-soft-charcoal">
              Every withdrawal lands onchain. On the explorer its amount is a handle to a ciphertext. In Alice&apos;s app
              it&apos;s a number.
            </p>
          </Reveal>
          <ChainVsYou />
        </div>
      </Section>

      {/* Roles — tint */}
      <Section tone="tint" id="roles">
        <div className="flex flex-col gap-14">
          <Reveal>
            <h2 className={`max-w-3xl ${sectionHeading}`}>Three people. Three views of one payroll.</h2>
          </Reveal>
          <div className="grid gap-4 md:grid-cols-3">
            {roles.map((r, i) => (
              <Reveal
                key={r.eyebrow}
                as="article"
                delay={i * 120}
                className="flex flex-col gap-6 rounded-2xl border-[1.5px] border-gloss-black/10 p-6"
              >
                {r.mock}
                <span className="text-caption tracking-[0.063em] text-mid-grey uppercase">{r.eyebrow}</span>
                <h3 className="text-heading-sm">{r.title}</h3>
                <p className="flex-1 text-soft-charcoal">{r.body}</p>
                <div>
                  <ButtonLink href={r.href} variant="outline">
                    {r.cta}
                  </ButtonLink>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      {/* Privacy — white */}
      <Section id="private">
        <div className="grid gap-14 lg:grid-cols-[1fr_1.4fr]">
          <Reveal className="flex flex-col gap-6">
            <Badge ghost>What&apos;s private</Badge>
            <h2 className={sectionHeading}>Honest about the edges.</h2>
            <p className="text-subheading text-soft-charcoal">
              A chain has to show that money moved. Dayze hides how much, and says exactly what it doesn&apos;t hide.
            </p>
          </Reveal>
          <div className="grid gap-10 sm:grid-cols-2">
            {[
              { label: "Encrypted", items: privateItems },
              { label: "Public", items: publicItems },
            ].map((col, c) => (
              <div key={col.label} className="flex flex-col gap-4">
                <span className="text-caption tracking-[0.063em] text-mid-grey uppercase">{col.label}</span>
                <ul className="flex flex-col">
                  {col.items.map((item, i) => (
                    <Reveal
                      key={item}
                      as="li"
                      delay={c * 200 + i * 80}
                      className="border-t-[1.5px] border-gloss-black py-3 text-subheading"
                    >
                      {item}
                    </Reveal>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* How it works — periwinkle wash */}
      <section id="how" className="bg-periwinkle-wash py-20 md:py-28">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-14 px-6">
          <Reveal>
            <h2 className={sectionHeading}>How it works</h2>
          </Reveal>
          <ol className="grid gap-10 md:grid-cols-4">
            {steps.map((s, i) => (
              <Reveal key={s.n} as="li" delay={i * 150} className="flex flex-col gap-4">
                <span
                  className="rule-grow block h-[1.5px] w-full bg-gloss-black"
                  style={{ transitionDelay: `${i * 150 + 200}ms` }}
                />
                <span className="text-caption">{s.n}</span>
                <h3 className="text-subheading">{s.title}</h3>
                <p className="text-soft-charcoal">{s.body}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Roadmap — tint */}
      <Section tone="tint" id="roadmap">
        <div className="grid gap-14 lg:grid-cols-[1fr_1.4fr]">
          <Reveal className="flex flex-col gap-6">
            <Badge ghost>Roadmap</Badge>
            <h2 className={sectionHeading}>Coming next.</h2>
            <p className="text-subheading text-soft-charcoal">What we&apos;re building after the hackathon.</p>
          </Reveal>
          <ul className="flex flex-col">
            {roadmap.map((r, i) => (
              <Reveal key={r.title} as="li" delay={i * 120} className="flex flex-col gap-2 border-t-[1.5px] border-gloss-black py-5">
                <h3 className="text-subheading">{r.title}</h3>
                <p className="text-soft-charcoal">{r.body}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </Section>

      <SiteFooter />
    </>
  );
}
