import type { Metadata, Viewport } from "next";
import { ToastProvider } from "@/components/ui/kit";

export const metadata: Metadata = {
  title: "My chit",
  robots: { index: false, follow: false },
  referrer: "no-referrer", // the token is in the URL; never leak it to other sites
  appleWebApp: { capable: true, title: "Chitty", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = { themeColor: "#0a0813" };

export default function Layout({ children }: LayoutProps<"/m/[token]">) {
  return <ToastProvider>{children}</ToastProvider>;
}
