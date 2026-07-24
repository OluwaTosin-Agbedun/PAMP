"use client";

import { useState } from "react";
import { FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic"];

/**
 * Documents re-hosted by the importer (`lib/storage/documentStorage.ts`)
 * have a storage key of `{uuid}.{ext}`, served inline through
 * `/api/documents/[storageKey]`. A storage key that's still a raw
 * `http(s)` URL means re-hosting failed at import time (e.g. the
 * source link had already expired) — that one opens externally as
 * before, since there's nothing on our own server to preview.
 */
export function DocumentViewerButton({ type, fileName, storageKey }: { type: string; fileName: string; storageKey: string }) {
  const [open, setOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const isExternal = storageKey.startsWith("http");

  if (isExternal) {
    return (
      <a href={storageKey} target="_blank" rel="noopener noreferrer" className="text-primary break-words hover:underline">
        {fileName}
      </a>
    );
  }

  const src = `/api/documents/${storageKey}`;
  // A real HTML page that embeds the file, not a link straight to the raw
  // file endpoint — navigating directly to the endpoint lets the browser's
  // own file handling decide whether to preview or download it, and some
  // browsers/OS configurations choose "download" even with
  // `Content-Disposition: inline` set. A page is always rendered as a
  // normal webpage, never a save dialog.
  const viewerPageUrl = `/documents/${storageKey}`;
  const extension = storageKey.slice(storageKey.lastIndexOf(".")).toLowerCase();
  const isImage = IMAGE_EXTENSIONS.includes(extension);
  const isPdf = extension === ".pdf";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-primary break-words text-left hover:underline">
        {fileName}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-auto">
          <DialogHeader>
            <DialogTitle>{type}</DialogTitle>
          </DialogHeader>
          {isImage && !imageFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={fileName}
              className="max-h-[70vh] w-full rounded-md object-contain"
              onError={() => setImageFailed(true)}
            />
          ) : isPdf ? (
            <div className="grid gap-2">
              {/* Some browsers' built-in PDF viewer renders blank inside a
                  dialog-portaled iframe even though the file itself is
                  fine — a fallback link is shown alongside, not just on
                  error, since an iframe that "loads" but shows nothing
                  never fires onError. */}
              <iframe src={src} title={fileName} className="h-[65vh] w-full rounded-md border" />
              <Button asChild size="sm" variant="outline" className="w-fit">
                <a href={viewerPageUrl} target="_blank" rel="noopener noreferrer">
                  Preview not showing? Open in browser
                </a>
              </Button>
            </div>
          ) : (
            <div className="text-muted-foreground flex flex-col items-center gap-3 py-10 text-sm">
              <FileText className="size-8" />
              <p>{isImage ? "This image couldn't be loaded here." : "This file type can't be previewed here."}</p>
              {isImage ? (
                <Button asChild size="sm" variant="outline">
                  <a href={viewerPageUrl} target="_blank" rel="noopener noreferrer">
                    Open in browser
                  </a>
                </Button>
              ) : (
                <Button asChild size="sm" variant="outline">
                  <a href={src} target="_blank" rel="noopener noreferrer">
                    Open in a new tab
                  </a>
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
