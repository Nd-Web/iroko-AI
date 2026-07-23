import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthSessionProvider } from "@/components/providers/session-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Iroko AI — Nigeria's Operating System for Life & Business",
  description:
    "Iroko AI is Nigeria's AI assistant for bureaucracy, tax, business registration, NIN, BVN and more. Ask anything about Nigerian law, regulations and government processes.",
  keywords: [
    "Iroko AI",
    "Nigeria AI",
    "CAC registration",
    "NIN registration",
    "Nigerian tax calculator",
    "BVN",
    "FIRS",
    "Nigerian business",
  ],
  authors: [{ name: "Iroko AI" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Iroko AI — Nigeria's Operating System for Life & Business",
    description:
      "An AI built specifically for Nigeria. Handle government and business processes end-to-end.",
    siteName: "Iroko AI",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0f8a5f" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1f17" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // Extend into the iPhone notch/home-bar areas; we pad with safe-area insets.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthSessionProvider>
            {children}
            <Toaster />
          </AuthSessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
