import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Ambugo — by AmbulanceNow",
  description: "Κάνε αίτημα για ιδιωτικό ασθενοφόρο σε πραγματικό χρόνο.",
  applicationName: "Ambugo",
  manifest: "/site.webmanifest",
  openGraph: {
    title: "Ambugo — by AmbulanceNow",
    description:
      "Κάνε αίτημα για ιδιωτικό ασθενοφόρο σε πραγματικό χρόνο.",
    type: "website",
    url: "https://app.ambulancenow.gr",
  },
  other: { viewport: "width=device-width, initial-scale=1" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="el">
      <body>
        <header className="border-b border-black/10 bg-white">
          <div className="container h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <img src="/logo.svg" alt="Ambugo logo" className="h-6 w-6" />
              <span className="font-semibold text-black">Ambugo</span>
              <span className="text-neutral-600 text-sm">by AmbulanceNow</span>
            </Link>
            {/* αφαιρέθηκε το top-right link “Αίτημα” για να μην διπλώνει το CTA */}
          </div>
        </header>

        <main>{children}</main>

        <footer className="border-t border-black/10 mt-12 bg-[#f8f8f8]">
          <div className="container py-8 text-neutral-600 text-sm">
            © {new Date().getFullYear()} Ambugo — by AmbulanceNow
          </div>
        </footer>
      </body>
    </html>
  );
}
