import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";
import { NetworkBanner } from "@/components/NetworkBanner";
import { Providers } from "./providers";

// Stand-ins for Basel Grotesk (UI) and Basel Classic (display) from DESIGN.md
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Dayze — confidential payroll",
  description:
    "Stream salaries onchain without publishing them. Salaries, balances and withdrawals stay encrypted with Fhenix CoFHE.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${newsreader.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>
          <NetworkBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}
