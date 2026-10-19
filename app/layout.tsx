import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kestrel Support Triage",
  description: "Validated support triage, chat and evaluation.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav aria-label="Main navigation">
          <a href="/">Chat</a>
          <a href="/triage">Triage</a>
          <a href="/admin">Admin</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
