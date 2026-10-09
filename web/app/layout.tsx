import React from "react";
import type { Metadata, Viewport } from "next";
import { Noto_Sans_Ethiopic, Outfit } from "next/font/google";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "next-themes";

import "./globals.css";

import { BRAND } from "@/lib/brand";
import { Toaster } from "@/components/ui/sonner";
import NextTopLoader from "nextjs-toploader";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PWARegister } from "@/components/pwa-register";

const outfit = Outfit({
  subsets: ["latin", "latin-ext"],
  variable: "--font-outfit",
  display: "swap",
});

// Fallback for Amharic text. Only fetched when Ethiopic glyphs appear.
const ethiopic = Noto_Sans_Ethiopic({
  subsets: ["ethiopic"],
  variable: "--font-ethiopic",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "Syntax Cafe System",
  description: "Cafe management and point-of-sale system.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Syntax Cafe",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: BRAND.sidebar },
    { media: "(prefers-color-scheme: dark)", color: BRAND.sidebarNight },
  ],
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn(outfit.variable, ethiopic.variable)} suppressHydrationWarning>
      <body suppressHydrationWarning className="bg-background font-sans">
        <TooltipProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem
            disableTransitionOnChange>
            {children}
            <PWARegister />
            <Toaster position="top-center" />
            <NextTopLoader color="var(--primary)" showSpinner={false} height={2} shadow={false} />
          </ThemeProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
