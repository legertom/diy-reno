import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  title: "DIY Reno — renovation planner & site foreman",
  description:
    "Plan, schedule, and execute your renovation. Log progress, track hours, snap photos, and ask an AI renovation expert for help on every step.",
  applicationName: "DIY Reno",
};

export const viewport: Viewport = {
  themeColor: "#f6f4ef",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
