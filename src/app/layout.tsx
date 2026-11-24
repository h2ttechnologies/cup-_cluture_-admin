import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif = Fraunces({ subsets: ["latin"], variable: "--font-serif", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Cup Culture Admin", template: "%s | Cup Culture Admin" },
  description: "Manage the Cup Culture menu, orders, reservations and café settings.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#1f1510", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-IN" className={`${sans.variable} ${serif.variable}`}><body>{children}</body></html>;
}
