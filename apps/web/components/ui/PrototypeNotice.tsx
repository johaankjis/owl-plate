import Link from "next/link";

/** A single quiet disclosure keeps the prototype honest without distracting from food. */
export function PrototypeNotice() {
  return (
    <p
      data-testid="prototype-notice"
      className="py-6 text-center text-xs text-ink-muted"
    >
      Owl Plate · Campus prototype ·{" "}
      <Link
        href="/admin"
        data-testid="prototype-admin-link"
        className="underline decoration-line underline-offset-2 hover:text-ink"
      >
        Admin
      </Link>
    </p>
  );
}
