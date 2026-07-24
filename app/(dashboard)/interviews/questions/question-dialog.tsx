"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { createQuestionAction, updateQuestionAction } from "./actions";

const CATEGORY_OPTIONS = [
  { value: "MANDATORY", label: "Mandatory — every applicant, cannot be skipped" },
  { value: "PATHWAY", label: "Pathway — a random 2 shown for a matching applicant" },
  { value: "SITUATIONAL", label: "Situational — a random 1 shown for every applicant" },
  { value: "ADDITIONAL_BANK", label: "Additional bank — panellists may pick this during the interview" },
] as const;

const PATHWAY_OPTIONS = [
  { value: "ENTREPRENEURSHIP_ENTERPRISE", label: "Entrepreneurship & Enterprise" },
  { value: "PUBLIC_PRIVATE_SECTOR_LEADERSHIP", label: "Public & Private Sector Leadership" },
  { value: "ACADEMIA_ADVANCED_STUDIES", label: "Academia & Advanced Studies" },
] as const;

type ExistingQuestion = {
  id: string;
  text: string;
  category: (typeof CATEGORY_OPTIONS)[number]["value"];
  pathway: (typeof PATHWAY_OPTIONS)[number]["value"] | null;
};

/** Create dialog when `question` is omitted; edit dialog (locked once asked) when provided. */
export function QuestionDialog({ question, locked }: { question?: ExistingQuestion; locked?: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [category, setCategory] = useState<string>(question?.category ?? "MANDATORY");
  const [isPending, startTransition] = useTransition();
  const isEdit = Boolean(question);

  function handleSubmit(formData: FormData) {
    if (isEdit && question) formData.set("questionId", question.id);

    startTransition(async () => {
      const action = isEdit ? updateQuestionAction : createQuestionAction;
      const result = await action(undefined, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(undefined);
      toast.success(isEdit ? "Interview question updated." : "Interview question created.");
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setError(undefined);
          setCategory(question?.category ?? "MANDATORY");
        }
      }}
    >
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="outline" size="sm" disabled={locked} title={locked ? "Already asked in an interview — locked" : undefined}>
            Edit
          </Button>
        ) : (
          <Button>
            <Plus />
            New question
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit interview question" : "New interview question"}</DialogTitle>
          <DialogDescription>
            Panellists may only ask mandatory, matching-pathway, or approved bank questions — never an ad
            hoc one.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-4">
          {error && <p className="text-destructive text-sm">{error}</p>}

          <div className="grid gap-2">
            <Label htmlFor="text">Question text</Label>
            <Textarea id="text" name="text" defaultValue={question?.text} required minLength={3} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="category">Category</Label>
            <Select name="category" value={category} onValueChange={setCategory} required>
              <SelectTrigger id="category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {category === "PATHWAY" && (
            <div className="grid gap-2">
              <Label htmlFor="pathway">Pathway</Label>
              <Select name="pathway" defaultValue={question?.pathway ?? undefined} required>
                <SelectTrigger id="pathway" className="w-full">
                  <SelectValue placeholder="Select a pathway" />
                </SelectTrigger>
                <SelectContent>
                  {PATHWAY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : isEdit ? "Save changes" : "Create question"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
