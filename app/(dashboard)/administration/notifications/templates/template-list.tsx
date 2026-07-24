"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { NotificationEventDefinition } from "@/modules/notifications/eventCatalogue";

import { sendTestEmailAction, updateTemplateAction } from "../actions";

type TemplateRow = {
  definition: NotificationEventDefinition;
  template: { subject: string; body: string; version: number } | null;
};

function EditTemplateDialog({ definition, template }: { definition: NotificationEventDefinition; template: TemplateRow["template"] }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateTemplateAction({ event: definition.key, subject, body });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`Template updated — a new version is now in use for "${definition.label}".`);
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setSubject(template?.subject ?? "");
          setBody(template?.body ?? "");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{definition.label}</DialogTitle>
          <DialogDescription>
            Available placeholders: {definition.variables.map((v) => `{{${v}}}`).join(", ")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`subject-${definition.key}`}>Subject</Label>
            <Input id={`subject-${definition.key}`} value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`body-${definition.key}`}>Body</Label>
            <Textarea id={`body-${definition.key}`} rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={isPending || !subject.trim() || !body.trim()}>
            Save new version
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SendTestEmailDialog({ event }: { event: string }) {
  const [open, setOpen] = useState(false);
  const [toEmail, setToEmail] = useState("");
  const [isPending, startTransition] = useTransition();

  function send() {
    startTransition(async () => {
      const result = await sendTestEmailAction({ event, toEmail });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`Test email sent to ${toEmail}.`);
      setOpen(false);
      setToEmail("");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Send test
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Send a test email</DialogTitle>
          <DialogDescription>
            Sends the current template with sample placeholder values — never counted as a real notification.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="test-email">Send to</Label>
          <Input id="test-email" type="email" value={toEmail} onChange={(e) => setToEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <DialogFooter>
          <Button onClick={send} disabled={isPending || !toEmail.trim()}>
            Send test email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TemplateList({ rows, canManage }: { rows: TemplateRow[]; canManage: boolean }) {
  return (
    <div className="grid gap-3">
      {rows.map(({ definition, template }) => (
        <Card key={definition.key}>
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="text-base">{definition.label}</CardTitle>
              <p className="text-muted-foreground mt-1 text-sm">{template ? template.subject : "No template configured"}</p>
            </div>
            <Badge variant="outline">{definition.recipient === "APPLICANT" ? "Applicant" : "Internal"}</Badge>
          </CardHeader>
          {canManage && (
            <CardContent className="flex gap-2 pt-0">
              <EditTemplateDialog definition={definition} template={template} />
              <SendTestEmailDialog event={definition.key} />
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}
