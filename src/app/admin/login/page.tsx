import type { Metadata } from "next";
import { adminLogin } from "@/app/actions/auth";
import { AuthFrame, LoginCard } from "@/components/auth/AuthForms";
import { Aurora } from "@/components/brand";
import { ToastProvider } from "@/components/ui/kit";

export const metadata: Metadata = { title: "Admin login" };

export default function Page() {
  return (
    <ToastProvider>
      <div className="relative min-h-screen overflow-hidden">
        <Aurora />
        <AuthFrame>
          <LoginCard kind="admin" action={adminLogin} />
        </AuthFrame>
      </div>
    </ToastProvider>
  );
}
