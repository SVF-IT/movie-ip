import Link from "next/link";
import "./globals.css";

export default function NotFound() {
  return (
    <html lang="en">
      <body className="antialiased" style={{ background: "var(--bg)", color: "var(--text)" }}>
        <div className="flex h-screen items-center justify-center">
          <div className="flex flex-col items-center text-center gap-5 max-w-md px-6">
            <div
              style={{ fontFamily: "var(--font-serif)" }}
              className="text-6xl tracking-tight text-(--text-faint)"
            >
              404
            </div>
            <div className="space-y-1.5">
              <h1 className="text-lg font-semibold">Page not found</h1>
              <p className="text-sm text-(--text-faint) leading-relaxed">
                The page you're looking for doesn't exist or may have moved.
              </p>
            </div>
            <Link
              href="/"
              className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium transition-colors"
              style={{ background: "var(--svf-accent)", color: "white" }}
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
