import type { Metadata } from "next";
import { AnalyticsProvider } from "@/components/providers/analytics-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "DoTheseNow", template: "%s | DoTheseNow" },
  description: "Operations management platform for teams",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AnalyticsProvider>{children}</AnalyticsProvider>
      </body>
    </html>
  );
}
