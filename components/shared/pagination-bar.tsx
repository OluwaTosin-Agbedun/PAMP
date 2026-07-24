import Link from "next/link";

import { Button } from "@/components/ui/button";

export function PaginationBar({
  page,
  pageSize,
  total,
  basePath,
  searchParams,
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  searchParams: Record<string, string | undefined>;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  function hrefForPage(targetPage: number) {
    const params = new URLSearchParams(
      Object.entries(searchParams).filter(([, v]) => Boolean(v)) as [string, string][],
    );
    params.set("page", String(targetPage));
    return `${basePath}?${params.toString()}`;
  }

  const rangeStart = (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-muted-foreground text-sm">
        Showing {rangeStart}–{rangeEnd} of {total}
      </p>
      <div className="flex items-center gap-2">
        {page <= 1 ? (
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link href={hrefForPage(page - 1)}>Previous</Link>
          </Button>
        )}
        <span className="text-muted-foreground text-sm">
          Page {page} of {totalPages}
        </span>
        {page >= totalPages ? (
          <Button variant="outline" size="sm" disabled>
            Next
          </Button>
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link href={hrefForPage(page + 1)}>Next</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
