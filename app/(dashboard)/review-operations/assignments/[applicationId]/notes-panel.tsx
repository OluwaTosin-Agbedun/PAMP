"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { createAdministrativeNoteAction } from "./actions";

export type NoteViewModel = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
};

/** Administrative notes (Phase 3D) — timestamped, attributed, kept separate from reviewer comments; never modifies a scoring outcome. */
export function NotesPanel({ applicationId, notes }: { applicationId: string; notes: NoteViewModel[] }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(undefined);
    startTransition(async () => {
      const result = await createAdministrativeNoteAction(applicationId, { body });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Note added.");
      setBody("");
    });
  }

  return (
    <div className="grid gap-4">
      <form onSubmit={handleSubmit} className="grid gap-2">
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Label htmlFor="note-body" className="sr-only">
          Administrative note
        </Label>
        <Textarea
          id="note-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add an administrative note (visible to staff, never to reviewers as feedback on their work)…"
          required
          minLength={3}
        />
        <Button type="submit" disabled={isPending} className="justify-self-end">
          {isPending ? "Saving…" : "Add note"}
        </Button>
      </form>

      {notes.length === 0 ? (
        <p className="text-muted-foreground text-sm">No administrative notes yet.</p>
      ) : (
        <ul className="grid gap-3">
          {notes.map((note) => (
            <li key={note.id} className="rounded-md border p-3 text-sm">
              <p className="whitespace-pre-wrap">{note.body}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {note.authorName} · {new Date(note.createdAt).toLocaleString("en-GB")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
