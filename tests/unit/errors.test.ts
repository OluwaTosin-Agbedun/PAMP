import { describe, expect, it, vi } from "vitest";

import {
  AuthorisationError,
  ConflictError,
  InternalApplicationError,
  ValidationError,
} from "@/lib/errors/AppError";
import { handleActionError } from "@/lib/errors/handleAction";

describe("handleActionError", () => {
  it("passes through a typed AppError's own safe message", () => {
    const result = handleActionError(new ConflictError("A user with this email already exists."), "test.op");
    expect(result).toEqual({ error: "A user with this email already exists." });
  });

  it("passes through AuthorisationError and ValidationError messages unchanged", () => {
    expect(handleActionError(new AuthorisationError(), "test.op").error).toBe(
      "You don't have permission to do that.",
    );
    expect(handleActionError(new ValidationError("Select a valid account status."), "test.op").error).toBe(
      "Select a valid account status.",
    );
  });

  it("never leaks a raw, unexpected error's message to the caller", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const dbError = new Error("relation \"users\" does not exist — schema drift detected");

    const result = handleActionError(dbError, "test.op");

    expect(result.error).not.toContain("relation");
    expect(result.error).toBe(new InternalApplicationError().message);
    errorSpy.mockRestore();
  });

  it("logs (rather than swallows) unexpected errors server-side", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    handleActionError(new Error("boom"), "test.op");

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.operation).toBe("test.op");
    expect(logged.context.message).toBe("boom");

    errorSpy.mockRestore();
  });
});
