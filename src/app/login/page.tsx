import type { Metadata } from "next";
import { organiserLogin } from "@/app/actions/auth";
import { AuthFrame, LoginCard } from "@/components/auth/AuthForms";
import { Aurora } from "@/components/brand";

export const metadata: Metadata = { title: "Login" };

export default function Page() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <Aurora />
      <AuthFrame>
        <LoginCard kind="organiser" action={organiserLogin} />
      </AuthFrame>
    </div>
  );
}
