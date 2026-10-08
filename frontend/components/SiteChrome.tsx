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

/** Minimal top bar: wordmark and links left, one dark pill right */
export function SiteHeader() {
  return (
    <header className="bg-pure-white">
      <Container className="flex h-20 items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-subheading font-medium">
            Dayze
          </Link>
          <nav className="hidden items-center gap-2 md:flex">
            <Link href="/#how" className="px-2 hover:text-soft-charcoal">
              How it works
            </Link>
            <Link href="/#roles" className="px-2 hover:text-soft-charcoal">
              Who it&apos;s for
            </Link>
            <Link href="/audit" className="px-2 hover:text-soft-charcoal">
              Auditors
            </Link>
          </nav>
        </div>
        <AuthButton />
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
