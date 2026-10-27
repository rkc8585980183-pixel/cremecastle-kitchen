import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kitchen Inventory Tracker",
  description: "Kitchen inventory management system",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "https://lh3.googleusercontent.com/d/1XNpcNjDPcpFxIoDjHMhoWOYAJtqQWshj=w64-h64",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full font-sans" suppressHydrationWarning>{children}</body>
    </html>
  );
}
