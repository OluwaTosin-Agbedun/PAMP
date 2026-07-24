import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/permissions/guard";

import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = {
  title: "Change password — PAM-P FMS",
};

export default async function ChangePasswordPage() {
  const session = await requireSession();
  const isForced = session.user.mustChangePassword;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl text-primary">Change your password</CardTitle>
        <CardDescription>
          {isForced
            ? "Your account requires a new password before you can continue."
            : "Choose a new password for your account."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChangePasswordForm />
      </CardContent>
    </Card>
  );
}
