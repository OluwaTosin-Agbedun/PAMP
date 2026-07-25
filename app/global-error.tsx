"use client";

/**
 * Last-resort boundary — only fires if the root layout itself throws (or
 * if app/error.tsx throws). Must render its own <html>/<body> since it
 * replaces the entire root layout. Deliberately minimal, unstyled, and
 * dependency-free: if things have gone this wrong, this file can't
 * assume anything else in the app (fonts, Tailwind, shadcn components)
 * is still working.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ textAlign: "center", maxWidth: 400, padding: 16 }}>
          <h1 style={{ fontSize: "1.25rem", marginBottom: 8 }}>Service temporarily unavailable</h1>
          <p style={{ color: "#666", marginBottom: 16 }}>
            Something went wrong on our end. Please try again shortly.
            {error.digest && (
              <>
                <br />
                <span style={{ fontSize: "0.75rem" }}>Reference: {error.digest}</span>
              </>
            )}
          </p>
          <button
            onClick={reset}
            style={{ padding: "8px 16px", background: "#1e3a8a", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
