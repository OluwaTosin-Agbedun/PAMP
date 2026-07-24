import { describe, expect, it } from "vitest";

import { InvalidStatusTransitionError } from "@/lib/errors";
import { assertPanelistTransition, canTransitionPanelist } from "@/modules/interviews/domain/panelLifecycle";

describe("panelLifecycle", () => {
  it("allows ASSIGNED to move to REASSIGNED or CANCELLED", () => {
    expect(canTransitionPanelist("ASSIGNED", "REASSIGNED")).toBe(true);
    expect(canTransitionPanelist("ASSIGNED", "CANCELLED")).toBe(true);
  });

  it("treats REASSIGNED and CANCELLED as terminal", () => {
    expect(canTransitionPanelist("REASSIGNED", "ASSIGNED")).toBe(false);
    expect(canTransitionPanelist("CANCELLED", "ASSIGNED")).toBe(false);
    expect(canTransitionPanelist("REASSIGNED", "CANCELLED")).toBe(false);
  });

  it("assertPanelistTransition throws InvalidStatusTransitionError for an illegal move", () => {
    expect(() => assertPanelistTransition("CANCELLED", "ASSIGNED")).toThrow(InvalidStatusTransitionError);
  });

  it("assertPanelistTransition is a no-op for a legal move", () => {
    expect(() => assertPanelistTransition("ASSIGNED", "CANCELLED")).not.toThrow();
  });
});
