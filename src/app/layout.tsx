import type { Metadata, Viewport } from "next";
import { Roboto } from "next/font/google";
import { Toaster } from "sonner";
import "bootstrap/dist/css/bootstrap.min.css";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { THEME_SCRIPT } from "@/components/ThemeToggle";

const roboto = Roboto({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-roboto" });

export const metadata: Metadata = {
  title: "HCM Lite",
  description: "AI-assisted Human Capital Management for Admin, HR and Employees",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f26522",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={roboto.variable} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
