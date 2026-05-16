import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { AuthProvider } from "@/components/AuthProvider";
import { AppChrome } from "@/components/layout/AppChrome";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { BRAND_TITLE } from "@/lib/brand";
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
  title: BRAND_TITLE,
  description: "End-to-end ticketing with SLA, escalation, and KPIs.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f8f8" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const themeInit = `(function(){try{var k='theme-preference';var d=document.documentElement;var t=localStorage.getItem(k);if(t==='light'){d.classList.remove('dark');}else{d.classList.add('dark');}}catch(e){document.documentElement.classList.add('dark');}})();`;

  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} min-h-dvh antialiased dark`}>
      <body className="flex min-h-dvh flex-col touch-manipulation">
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInit}
        </Script>
        <ThemeProvider>
          <AuthProvider>
            <AppChrome>{children}</AppChrome>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
