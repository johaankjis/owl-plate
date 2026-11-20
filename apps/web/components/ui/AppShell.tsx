"use client";
import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";
import type { ReactNode } from "react";
import { OWL_MOTION_CLASSES } from "../../lib/motion";
import { useTheme, type ThemePreference } from "../../lib/theme";
import { PrototypeNotice } from "./PrototypeNotice";
export type AppShellVariant =
  "public" | "student" | "host" | "pantry" | "admin";
export interface AppShellProps {
  variant: AppShellVariant;
  title?: string;
  headerAction?: ReactNode;
  bottomNav?: ReactNode;
  showPrototypeNotice?: boolean;
  maxWidth?: "md" | "lg" | "xl" | "wide";
  children: ReactNode;
}
export function ThemeControl() {
  const { preference, setPreference } = useTheme();
  return (
    <label className="text-xs text-ink-muted">
      <span className="sr-only">Appearance</span>
      <select
        aria-label="Appearance"
        data-testid="theme-select"
        value={preference}
        onChange={(e) => setPreference(e.target.value as ThemePreference)}
        className="min-h-11 rounded-full border border-line bg-surface px-3 text-xs font-medium text-ink transition-colors hover:border-ink-muted/40"
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
    </label>
  );
}
/** Give each role a familiar shell without leaking management controls to students. */
export function AppShell({
  variant,
  title,
  headerAction,
  bottomNav,
  showPrototypeNotice = true,
  maxWidth = "xl",
  children,
}: AppShellProps) {
  const widths = {
    md: "max-w-md",
    lg: "max-w-3xl",
    xl: "max-w-6xl",
    wide: "max-w-7xl",
  };
  return (
    <div
      data-testid="app-shell"
      data-role={variant}
      className="min-h-screen bg-canvas text-ink"
    >
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur-md">
        <div
          className={`mx-auto flex min-h-[72px] ${widths[maxWidth]} items-center justify-between gap-3 px-4 sm:px-6`}
        >
          <Link
            href="/"
            aria-label="Owl Plate home"
            className={`flex min-h-11 shrink-0 items-center gap-2.5 font-extrabold tracking-tight ${OWL_MOTION_CLASSES.press}`}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-owl-gold text-owl-goldInk shadow-sm">
              <UtensilsCrossed size={21} strokeWidth={1.75} />
            </span>
            <span className="text-lg">Owl Plate</span>
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            {headerAction}
            <ThemeControl />
          </div>
        </div>
      </header>
      <main
        className={`mx-auto ${widths[maxWidth]} px-4 pt-6 sm:px-6 ${bottomNav ? "pb-24" : "pb-6"}`}
      >
        {title && (
          <h1 className="mb-6 text-3xl font-extrabold tracking-tight">
            {title}
          </h1>
        )}
        {children}
        {showPrototypeNotice && <PrototypeNotice />}
      </main>
      {bottomNav}
    </div>
  );
}
