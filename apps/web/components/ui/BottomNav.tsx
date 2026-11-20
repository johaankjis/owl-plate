"use client";
import { Home, Map, ShoppingBag, User } from "lucide-react";
export type StudentTabId = "home" | "map" | "reservations" | "profile";
export interface BottomNavProps {
  activeTab: StudentTabId;
  onSelectTab: (tab: StudentTabId) => void;
  activeHoldCount?: number;
}
const tabs = [
  { id: "home", label: "Home", Icon: Home },
  { id: "map", label: "Map", Icon: Map },
  { id: "reservations", label: "Reservations", Icon: ShoppingBag },
  { id: "profile", label: "Profile", Icon: User },
] as const;
/** The same four destinations work with thumbs, keyboards and desktop pointers. */
export function BottomNav({
  activeTab,
  onSelectTab,
  activeHoldCount = 0,
}: BottomNavProps) {
  return (
    <nav
      aria-label="Student navigation"
      data-testid="student-bottom-nav"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:sticky md:bottom-0"
    >
      <div className="mx-auto grid max-w-xl grid-cols-4 gap-1 px-2">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            data-testid={`nav-tab-${id}`}
            aria-current={activeTab === id ? "page" : undefined}
            onClick={() => onSelectTab(id)}
            className={`relative flex min-h-[72px] flex-col items-center justify-center gap-1 text-[11px] font-semibold transition ${activeTab === id ? "text-owl-goldText" : "text-ink-muted hover:text-ink"}`}
          >
            <span
              className={`rounded-full px-5 py-1 ${activeTab === id ? "bg-owl-goldTint" : ""}`}
            >
              <Icon size={21} strokeWidth={activeTab === id ? 2 : 1.75} />
            </span>
            {label}
            {id === "reservations" && activeHoldCount > 0 && (
              <span
                className="absolute right-7 top-3 h-2 w-2 rounded-full bg-success"
                aria-label="Active reservation"
              />
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}
