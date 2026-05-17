import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

// One architectural superfamily — display, body, and labels.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "DIY Reno — renovation planner & site foreman",
  description:
    "Plan, schedule, and execute your renovation. Log progress, track hours, snap photos, and ask an AI renovation expert for help on every step.",
  applicationName: "DIY Reno",
};

export const viewport: Viewport = {
  themeColor: "#14386b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${archivo.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
