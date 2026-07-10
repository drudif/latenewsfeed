"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Feed" },
  { href: "/arquivo", label: "Arquivo" },
  { href: "/ajustes", label: "Ajustes" },
];

export default function AppHeader() {
  const path = usePathname();
  return (
    <header className="app-header">
      <div className="wrap">
        <Link href="/" className="brand" style={{ ["--cc" as string]: "#e8551e" }}>
          Inputs<span className="dot">.</span>
        </Link>
        <nav className="nav">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={path === l.href ? "active" : ""}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
