import Link from "next/link";
import { AuthButton } from "./AuthButton";
import { Container } from "./ui";

/** Top strip: the one place we state the network status */
export function AnnouncementBar() {
  return (
    <div className="bg-gloss-black py-3 text-center text-caption text-gloss-white">
      Testnet demo · Salaries are encrypted with Fhenix CoFHE ·{" "}
      <a href="#private" className="underline underline-offset-4">
        What stays private →
      </a>
    </div>
  );
}

/**
 * Minimal top bar: wordmark and links left, auth right.
 * @param overlay Transparent with white text, floating over the hero video
 */
export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  const link = overlay ? "px-2 text-pure-white/90 hover:text-pure-white" : "px-2 hover:text-soft-charcoal";
  return (
    <header className={overlay ? "absolute inset-x-0 top-0 z-20" : "bg-pure-white"}>
      <Container className="flex h-20 items-center justify-between">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className={`text-subheading font-medium tracking-[0.2em] uppercase ${overlay ? "text-pure-white" : ""}`}
          >
            Dayze
          </Link>
          <nav className="hidden items-center gap-2 md:flex">
            <Link href="/#how" className={link}>
              How it works
            </Link>
            <Link href="/#roles" className={link}>
              Who it&apos;s for
            </Link>
            <Link href="/audit" className={link}>
              Auditors
            </Link>
          </nav>
        </div>
        <AuthButton onDark={overlay} />
      </Container>
    </header>
  );
}

/** Ink footer */
export function SiteFooter() {
  return (
    <footer className="mt-auto bg-gloss-black py-16 text-gloss-white">
      <Container className="flex flex-col gap-10 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-3">
          <span className="font-classic text-heading">Dayze</span>
          <p className="max-w-sm text-caption text-mid-grey">
            Confidential payroll on Arbitrum and Base testnets. Built with Fhenix CoFHE. Not audited; don&apos;t use
            real funds.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-8 gap-y-3 text-caption">
          <Link href="/employer" className="hover:text-pure-white/70">
            Employer console
          </Link>
          <Link href="/worker" className="hover:text-pure-white/70">
            Worker app
          </Link>
          <Link href="/audit" className="hover:text-pure-white/70">
            Auditor view
          </Link>
          <a href="https://cofhe-docs.fhenix.zone" className="hover:text-pure-white/70">
            Fhenix CoFHE
          </a>
        </nav>
      </Container>
    </footer>
  );
}
