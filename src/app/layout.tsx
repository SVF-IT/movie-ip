import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Film IP Manager",
  description: "Manage film intellectual property rights and licenses",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
