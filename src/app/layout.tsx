import type { Metadata } from "next";
import { Syne, DM_Mono } from "next/font/google";
import "./globals.css";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

export const metadata: Metadata = {
  title: "GetAnyNumberOnline — Temporary Phone Numbers for SMS Verification",
  description:
    "Get real SIM-based temporary phone numbers instantly. Verify any app or service. Pay only when you receive an SMS. No subscriptions.",
  keywords:
    "temporary phone number, receive sms online, sms verification, virtual phone number, disposable number",
  openGraph: {
    title: "GetAnyNumberOnline — Temporary Phone Numbers",
    description: "Real SIM cards. Instant delivery. Pay per use.",
    url: "https://getanynumberonline-v2.vercel.app",
    siteName: "GetAnyNumberOnline",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GetAnyNumberOnline — Temporary Phone Numbers",
    description: "Real SIM cards. Instant delivery. Pay per use.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${syne.variable} ${dmMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
