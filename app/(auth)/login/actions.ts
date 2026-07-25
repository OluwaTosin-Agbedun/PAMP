"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";

import { signIn } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { loginSchema } from "@/lib/validation/auth";
import { logger, newCorrelationId } from "@/lib/logging/logger";

export async function loginAction(_prevState: string | undefined, formData: FormData) {
  try {
    // `redirect: false` — signIn() would otherwise redirect straight to a
    // fixed `redirectTo` itself. We need to pick /change-password instead
    // of /dashboard for accounts with mustChangePassword set, so the
    // destination is chosen once, here, in a single explicit redirect()
    // call below.
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return "Invalid email or password.";
        default:
          return "Something went wrong. Please try again.";
      }
    }
    // Anything else — most commonly the database being unreachable, or a
    // missing/invalid AUTH_SECRET — must never surface as a raw,
    // unhandled 500 (Next.js's generic "This page couldn't load" crash
    // screen). Logged with a correlation ID and error category only —
    // never the raw error message, which for a Prisma connection failure
    // can itself contain the connection string.
    const correlationId = newCorrelationId();
    logger.error(
      "login.unexpected_error",
      { errorCategory: error instanceof Error ? error.constructor.name : typeof error, path: "/login" },
      correlationId,
    );
    return "Service temporarily unavailable. Please try again shortly.";
  }

  // Deliberately re-reads the database rather than calling auth() here:
  // the session cookie signIn() just set isn't reliably visible to auth()
  // within the same Server Action invocation (a same-request cookie-
  // propagation timing gap, not something typecheck/lint/unit tests catch
  // — found via an end-to-end Playwright run, where it consistently sent
  // every account, including ones with mustChangePassword set, straight
  // to /dashboard). The email is already known-valid at this point (sign-
  // in just succeeded), so this look-up leaks nothing pre-auth.
  const { email } = loginSchema.parse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const user = await prisma.user.findUnique({ where: { email }, select: { mustChangePassword: true } });
  redirect(user?.mustChangePassword ? "/change-password" : "/dashboard");
}
