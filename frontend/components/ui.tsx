import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/*
 * Primitives from DESIGN.md. Buttons are always full pills; cards and badges are 8px.
 * Borders are 1.5px ink, never 1px. No shadows anywhere.
 */

type ButtonVariant = "dark" | "yellow" | "outline" | "outline-light";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-pill px-6 py-3 text-body font-medium transition-colors duration-150";

const buttonVariants: Record<ButtonVariant, string> = {
  // Highest emphasis on light surfaces
  dark: "bg-gloss-black text-gloss-white hover:bg-soft-charcoal",
  // Hero CTA only: at most one per page
  yellow: "bg-solar-yellow text-gloss-black hover:bg-[#bdbd1f]",
  // Secondary action on light surfaces
  outline: "border-[1.5px] border-gloss-black text-gloss-black hover:bg-gloss-white",
  // Secondary action on ink surfaces
  "outline-light": "border-[1.5px] border-pure-white text-pure-white hover:bg-pure-white/10",
};

/** A pill-shaped link styled as a button */
export function ButtonLink({
  variant = "dark",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={`${buttonBase} ${buttonVariants[variant]} ${className}`} {...props} />;
}

/** A pill-shaped button */
export function Button({
  variant = "dark",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={`${buttonBase} ${buttonVariants[variant]} ${className}`} {...props} />;
}

/** Status tags and counts (filled) or eyebrow labels (ghost) */
export function Badge({ children, ghost = false }: { children: ReactNode; ghost?: boolean }) {
  return (
    <span
      className={
        ghost
          ? "inline-flex w-fit items-center rounded-lg border-[1.5px] border-gloss-black px-3 py-1 text-caption font-medium tracking-[0.063em] uppercase"
          : "inline-flex w-fit items-center rounded-lg bg-gloss-white px-3 py-1 text-caption font-medium"
      }
    >
      {children}
    </span>
  );
}

/** The 1200px content frame */
export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1200px] px-6 ${className}`}>{children}</div>;
}

/** A full-width section on one of the two alternating surfaces */
export function Section({
  children,
  tone = "white",
  className = "",
  id,
}: {
  children: ReactNode;
  tone?: "white" | "tint";
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`${tone === "tint" ? "bg-gloss-white" : "bg-pure-white"} py-20 md:py-28 ${className}`}>
      <Container>{children}</Container>
    </section>
  );
}
