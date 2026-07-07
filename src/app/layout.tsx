import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = { title: "Portal de Inputs", description: "Feed pessoal" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-neutral-50 text-neutral-900">
        <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur">
          <nav className="mx-auto flex max-w-2xl items-center gap-6 px-4 py-3 text-sm font-medium">
            <Link href="/" className="hover:underline">Feed</Link>
            <Link href="/arquivo" className="hover:underline">Arquivo</Link>
            <Link href="/ajustes" className="ml-auto text-neutral-500 hover:underline">Ajustes</Link>
          </nav>
        </header>
        <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
