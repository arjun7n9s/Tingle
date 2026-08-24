import type { Metadata } from "next";
import { Anton, IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Serif, Syne } from "next/font/google";
import "lenis/dist/lenis.css";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  weight: ["500", "600", "700", "800"],
});

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-plex",
  weight: ["400", "500", "600"],
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plex-mono",
  weight: ["400", "500"],
});

const instrument = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-instrument",
  weight: "400",
  style: ["normal", "italic"],
});

const anton = Anton({
  subsets: ["latin"],
  variable: "--font-anton",
  weight: "400",
});

export const metadata: Metadata = {
  title: "Tingle",
  description:
    "A watch on the claim you are actually building. Confirm one sentence, look at the public web, then watch what moved.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${syne.variable} ${plex.variable} ${mono.variable} ${instrument.variable} ${anton.variable}`}>
      <body className="min-h-screen antialiased [font-family:var(--font-plex),ui-sans-serif,system-ui,sans-serif]">
        {children}
      </body>
    </html>
  );
}
