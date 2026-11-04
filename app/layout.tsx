import type { Metadata } from "next";
import { Geist, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const display = Instrument_Sans({ subsets: ["latin"], variable: "--font-loaded-display", display: "swap" });
const sans = Geist({ subsets: ["latin"], variable: "--font-loaded-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-loaded-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Claude Code Linear Agent (unofficial)",
  description: "Delegate Linear issues to Claude Code on the web, running on your own Claude account.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
