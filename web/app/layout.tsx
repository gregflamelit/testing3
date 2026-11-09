import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wine Lab — A clearer picture of quality",
  description: "Predict red wine quality, compare samples, and explore the evidence behind a validated machine learning model.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
