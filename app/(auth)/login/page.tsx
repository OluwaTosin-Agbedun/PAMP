import type { Metadata } from "next";
import Image from "next/image";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in — PAM-P FMS",
};

export default function LoginPage() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <Image
          src="/pamp-logo.jpeg"
          alt="PAM-P"
          width={48}
          height={48}
          className="mb-2 size-12 rounded-full object-cover"
        />
        <CardTitle className="text-xl text-primary">EFMS</CardTitle>
        <CardDescription>
          Pius Anyim Mentorship Programme — Fellowship Management System.
          <br />
          Sign in with the credentials provided by your System Administrator.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm />
      </CardContent>
    </Card>
  );
}
