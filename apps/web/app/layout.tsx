import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Owl Plate — KSU Campus Food Dispatch",
  description:
    "Routes leftover event food to nearby KSU students who can safely eat it, quietly putting students who need it most first.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Owl Plate",
  },
};

export const viewport: Viewport = {
  themeColor: "#FDBB30",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-owl-black text-zinc-100 antialiased">
        {process.env.NEXT_PUBLIC_UI_FIXTURE_MODE === "true" && (
          <div
            role="status"
            data-testid="ui-fixture-banner"
            className="bg-amber-300 px-4 py-3 text-center font-semibold text-black"
          >
            Standalone UI fixture mode — simulated browser data. API requests
            and real notifications are disabled.
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
