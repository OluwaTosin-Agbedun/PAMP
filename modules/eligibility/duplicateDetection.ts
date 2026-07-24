import "server-only";

import { prisma } from "@/lib/db/prisma";

export type DuplicateMatch = {
  applicationId: string;
  applicantName: string;
  matchedOn: ("email" | "phone" | "governmentIdNumber")[];
};

/**
 * §8.5 Duplicate Applications — exact matching only ("careful matching
 * to avoid treating unrelated applicants with similar names as
 * duplicates"). Deliberately does not fuzzy-match on name: a name-based
 * heuristic is exactly the kind of "possible false positive" the
 * checklist's own Consistency section (§5, "Name consistency") already
 * treats as a *human* judgement call, not an automatic one.
 */
export async function findExactDuplicates(applicationId: string, cohortId: string): Promise<DuplicateMatch[]> {
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { applicant: true },
  });

  const { email, phone, governmentIdNumber } = application.applicant;
  const orConditions: Record<string, unknown>[] = [{ applicant: { email } }];
  if (phone) orConditions.push({ applicant: { phone } });
  if (governmentIdNumber) orConditions.push({ applicant: { governmentIdNumber } });

  const candidates = await prisma.application.findMany({
    where: {
      cohortId,
      id: { not: applicationId },
      deletedAt: null,
      OR: orConditions,
    },
    include: { applicant: true },
  });

  return candidates.map((candidate) => {
    const matchedOn: DuplicateMatch["matchedOn"] = [];
    if (candidate.applicant.email === email) matchedOn.push("email");
    if (phone && candidate.applicant.phone === phone) matchedOn.push("phone");
    if (governmentIdNumber && candidate.applicant.governmentIdNumber === governmentIdNumber) matchedOn.push("governmentIdNumber");
    return {
      applicationId: candidate.id,
      applicantName: `${candidate.applicant.firstName} ${candidate.applicant.lastName}`,
      matchedOn,
    };
  });
}
