import type { Metadata } from "next";
import { Geist_Mono, Playfair_Display, Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

// Playfair Display (headings/wordmark) + Inter (body/UI) — a deliberate editorial pairing
// for a "high-class, expensive" feel, replacing the default Geist system-UI look. See
// app/globals.css for how --font-display / --font-body are wired into Tailwind.
const display = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const body = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GBT Field Console",
  description: "Manager console for the canvassing platform — Live Ops and Safety boards",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
