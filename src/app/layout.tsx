import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import { GlobalButtonParticles } from "@/components/GlobalButtonParticles";
import { AppChrome } from "@/components/layout/AppChrome";
import { ServiceWorkerRegister } from "@/components/offline/ServiceWorkerRegister";
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
  applicationName: BRAND_TITLE,
  appleWebApp: {
    capable: true,
    title: BRAND_TITLE,
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
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
    <html lang="en" suppressHydrationWarning className={`${hankenGrotesk.variable} h-full antialiased dark`}>
      <body className="flex h-full min-h-dvh flex-col touch-manipulation">
        <script
          id="theme-init"
          dangerouslySetInnerHTML={{ __html: themeInit }}
        />
        <ThemeProvider>
          <AuthProvider session={session}>
            <ServiceWorkerRegister />
            <GlobalButtonParticles />
            <AppChrome initialRole={session?.user?.role}>{children}</AppChrome>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
