"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Root error boundary — catches any otherwise-unhandled error thrown
 * while rendering a route or layout (e.g. `requireUser()`'s
 * database-verified permission check in `(dashboard)/layout.tsx` failing
 * because the database is unreachable). Without this, that failure
 * previously surfaced as Next.js's generic, unbranded "This page
 * couldn't load" crash screen — see docs/DEPLOYMENT_TROUBLESHOOTING.md.
 *
 * The original error is already captured server-side in the platform's
 * function logs (Vercel Runtime Logs), keyed by `error.digest` — this
 * component only owns the user-facing fallback, and deliberately never
 * renders `error.message` (which, for a database connection failure,
 * can itself contain connection details).
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <CardTitle className="text-xl text-primary">Service temporarily unavailable</CardTitle>
          <CardDescription>
            Something went wrong on our end. Please try again shortly.
            {error.digest && (
              <>
                <br />
                <span className="text-xs text-muted-foreground">Reference: {error.digest}</span>
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button onClick={reset}>Try again</Button>
        </CardContent>
      </Card>
    </div>
  );
}
