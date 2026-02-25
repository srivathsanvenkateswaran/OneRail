import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "OneRail — Indian Railways, Reimagined",
    template: "%s | OneRail",
  },
  description:
    "Search Indian Railways trains, check live schedules, explore station details, and plan your journey — beautifully.",
  keywords: ["Indian Railways", "train schedule", "PNR status", "IRCTC", "IndiaRailInfo"],
  openGraph: {
    title: "OneRail — Indian Railways, Reimagined",
    description: "Fast, beautiful Indian Railways information.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={outfit.className}>
        <Navbar />
        <main>{children}</main>
      </body>
    </html>
  );
}
