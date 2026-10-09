import type { Metadata, Viewport } from "next";
import { Abel, Roboto, Roboto_Condensed } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

// Tegen's brand type: Roboto for text, Roboto Condensed Black Italic for headings, Abel for labels.
const roboto = Roboto({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-roboto", display: "swap" });
const robotoCondensed = Roboto_Condensed({
  subsets: ["latin"],
  weight: ["900"],
  style: ["italic"],
  variable: "--font-roboto-condensed",
  display: "swap",
});
const abel = Abel({ subsets: ["latin"], weight: "400", variable: "--font-abel", display: "swap" });

export const metadata: Metadata = {
  title: t("app.name"),
};

export const viewport: Viewport = {
  themeColor: "#1e231e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" className={cn(roboto.variable, robotoCondensed.variable, abel.variable)}>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">{children}</body>
    </html>
  );
}
