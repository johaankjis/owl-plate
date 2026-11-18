import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Owl Plate — KSU Campus Food Dispatch",
  description:
    "Routes leftover event food to nearby KSU students who can safely eat it, quietly putting students who need it most first.",
  manifest: "/manifest.json",
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
        {children}
      </body>
    </html>
  );
}
