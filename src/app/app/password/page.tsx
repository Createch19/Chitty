import type { Metadata } from "next";
import { Suspense } from "react";
import { changePassword } from "@/app/actions/auth";
import { AuthFrame, PasswordCard } from "@/components/auth/AuthForms";
import { Aurora } from "@/components/brand";
import { requireOrganiser } from "@/server/session";

export const metadata: Metadata = { title: "Password" };

async function Form() {
  const me = await requireOrganiser();
  return <PasswordCard action={changePassword} forced={me.mustChangePassword} />;
}

export default function Page() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <Aurora />
      <AuthFrame>
        <Suspense fallback={<div className="card h-96 w-full animate-pulse" />}>
          <Form />
        </Suspense>
      </AuthFrame>
    </div>
  );
}
