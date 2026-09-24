"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { EagleMark } from "@/components/brand/EagleMark";

const NAV = [
  { href: "/live-ops", label: "Live Ops" },
  { href: "/safety", label: "Safety" },
];

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
        Loading…
      </div>
    );
  }

  if (!user) {
    // Redirect effect above will kick in; render nothing in the meantime.
    return null;
  }

  const role = user.campaignRoles[0]?.role?.replace(/_/g, " ") ?? "member";

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-brand-cream">
      <header className="flex items-center justify-between bg-brand-navy px-6 py-3.5 text-white shadow-sm">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-white/10">
              <EagleMark className="h-6 w-6" fill="white" />
            </div>
            <span className="font-display text-base font-semibold tracking-wide text-white">
              Field Console
            </span>
          </div>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3.5 py-1.5 text-sm font-medium tracking-wide transition-colors ${
                    active
                      ? "bg-white/15 text-white"
                      : "text-white/65 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-white/60">
            {user.email} <span className="text-white/25">·</span>{" "}
            <span className="capitalize">{role}</span>
          </span>
          <button
            onClick={() => {
              logout();
              router.replace("/login");
            }}
            className="rounded-md border border-white/25 px-2.5 py-1 text-xs font-medium text-white/85 transition-colors hover:bg-white/10"
          >
            Sign out
          </button>
        </div>
      </header>
      <div className="tricolor-rule" />
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
