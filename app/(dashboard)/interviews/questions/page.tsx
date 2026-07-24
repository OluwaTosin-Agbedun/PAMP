import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { requirePagePermission } from "@/lib/permissions/guard";
import { pathwayLabel } from "@/modules/interviews/domain/interviewQuestions";
import { listQuestionsForCohort } from "@/modules/interviews/services/interviewQuestionService";

import { QuestionActiveToggle } from "./question-active-toggle";
import { QuestionDialog } from "./question-dialog";

export const metadata: Metadata = {
  title: "Interview Questions — PAM-P FMS",
};

const CATEGORY_LABELS: Record<string, string> = {
  MANDATORY: "Mandatory",
  PATHWAY: "Pathway",
  SITUATIONAL: "Situational",
  ADDITIONAL_BANK: "Additional bank",
};

export default async function InterviewQuestionsPage() {
  const user = await requirePagePermission(PERMISSIONS.INTERVIEW_QUESTIONS_MANAGE);
  const questions = await listQuestionsForCohort(user.id);

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Interview Questions</h1>
          <p className="text-muted-foreground text-sm">
            Every applicant answers the mandatory questions; pathway questions display automatically for
            a matching applicant; panellists may only pick additional questions from this bank — never an
            ad hoc one. A question already asked in an interview can no longer have its text, category, or
            pathway changed.
          </p>
        </div>
        <QuestionDialog />
      </div>

      {questions.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No interview questions configured yet</CardTitle>
            <CardDescription>
              Add mandatory, pathway, or additional-bank questions here before panellists can use them
              during an interview.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Question</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Pathway</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {questions.map((question) => (
                <TableRow key={question.id}>
                  <TableCell className="font-medium">
                    {question.text}
                    {question.hasBeenAsked && (
                      <Badge variant="outline" className="ml-2">
                        Asked — locked
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{CATEGORY_LABELS[question.category] ?? question.category}</TableCell>
                  <TableCell>{question.pathway ? pathwayLabel(question.pathway) : "—"}</TableCell>
                  <TableCell>
                    <QuestionActiveToggle questionId={question.id} isActive={question.isActive} />
                  </TableCell>
                  <TableCell className="text-right">
                    <QuestionDialog
                      question={{
                        id: question.id,
                        text: question.text,
                        category: question.category,
                        pathway: question.pathway,
                      }}
                      locked={question.hasBeenAsked}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
