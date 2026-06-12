import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk } from "next/font/google";
import Script from "next/script";
import { AuthProvider } from "@/components/AuthProvider";
import { GlobalButtonParticles } from "@/components/GlobalButtonParticles";
import { AppChrome } from "@/components/layout/AppChrome";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { BRAND_TITLE } from "@/lib/brand";
import { safeGetServerSession } from "@/lib/server-session";
import "./globals.css";

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-geist-sans",
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
    { media: "(prefers-color-scheme: light)", color: "#fbfbfb" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const themeInit = `(function(){try{var k='theme-preference';var d=document.documentElement;var t=localStorage.getItem(k);if(t==='light'){d.classList.remove('dark');}else{d.classList.add('dark');}}catch(e){document.documentElement.classList.add('dark');}})();`;
  const session = await safeGetServerSession();

  return (
    <html lang="en" suppressHydrationWarning className={`${hankenGrotesk.variable} min-h-dvh antialiased dark`}>
      <body className="flex min-h-dvh flex-col touch-manipulation">
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInit}
        </Script>
        <ThemeProvider>
          <AuthProvider session={session}>
            <GlobalButtonParticles />
            <AppChrome>{children}</AppChrome>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
