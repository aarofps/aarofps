"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/", "Net worth"], ["/transactions", "Transactions"], ["/budget", "Budget"], ["/spending", "Spending"],
  ["/recurring", "Recurring"], ["/goals", "Goals"], ["/credit", "Credit"], ["/chat", "Ask AI"], ["/settings", "Settings"],
] as const;

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
      {LINKS.map(([href, label]) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link key={href} href={href}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${active ? "bg-surface-2 font-medium text-text" : "text-muted hover:text-text"}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
