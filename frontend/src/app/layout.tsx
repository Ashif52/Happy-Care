import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Happy Care — Hospital Service Management & Operations Platform",
  description: "Happy Care hospital operational service request, maintenance verification, patient feedback, and SLA escalation platform.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}>
      <head>
        <link rel="stylesheet" href="https://fonts.cdnfonts.com/css/sf-pro-display" />
      </head>
      <body className="min-h-screen flex flex-col bg-[#F7F8FA] text-[#17212F] overflow-x-hidden overflow-y-auto">
        {children}
      </body>
    </html>
  );
}

