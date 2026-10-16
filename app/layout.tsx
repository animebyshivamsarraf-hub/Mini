import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Mini AI — AI Control Center", description: "Build, automate, and get things done with Mini AI" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
