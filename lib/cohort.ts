import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/db/prisma";

/**
 * V1.0 runs a single active cohort. Every module reads it through here
 * rather than querying `isActive` itself, so "which cohort is current"
 * has one answer — a multi-cohort switcher later is a UI change to this
 * function's call sites, not a rewrite of how each module finds its data.
 */
export const getActiveCohort = cache(async () => {
  const cohort = await prisma.cohort.findFirst({ where: { isActive: true } });
  if (!cohort) {
    throw new Error("No active cohort is configured. Ask a System Administrator to create one.");
  }
  return cohort;
});
