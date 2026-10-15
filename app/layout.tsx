import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Mini Autonomous Agent", description: "A resumable multi-tool AI task orchestrator" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
