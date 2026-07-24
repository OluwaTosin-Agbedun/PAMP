import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import { isInternalStorageKey } from "@/lib/storage/documentStorage";

export const metadata: Metadata = {
  title: "Document — PAM-P FMS",
};

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic"];

/**
 * A dedicated, chrome-free HTML page for viewing a re-hosted applicant
 * document in its own browser tab — the popup preview's fallback
 * target for whenever the inline iframe/img in the dialog can't
 * render it. Deliberately a real page (`text/html`), not a link
 * straight to `/api/documents/[storageKey]`: navigating directly to
 * that raw file endpoint lets the browser's own file-handling decide
 * whether to preview or download it, and some browsers/OS
 * configurations choose "download" even with `Content-Disposition:
 * inline` set. A page that *embeds* the file, instead of *being* the
 * file, is always rendered as a normal webpage — never a save dialog.
 */
export default async function DocumentViewerPage({ params }: { params: Promise<{ storageKey: string }> }) {
  await requirePagePermission(PERMISSIONS.APPLICATIONS_VIEW);

  const { storageKey } = await params;
  if (!isInternalStorageKey(storageKey)) notFound();

  const src = `/api/documents/${storageKey}`;
  const extension = storageKey.slice(storageKey.lastIndexOf(".")).toLowerCase();
  const isImage = IMAGE_EXTENSIONS.includes(extension);

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-4">
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="Applicant document" className="max-h-screen max-w-full object-contain" />
      ) : (
        <embed src={src} type="application/pdf" className="h-screen w-full" />
      )}
    </div>
  );
}
