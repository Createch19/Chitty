import type { Metadata, Viewport } from "next";
import { ToastProvider } from "@/components/ui/kit";

export async function generateMetadata({ params }: LayoutProps<"/m/[token]">): Promise<Metadata> {
  const { token } = await params;
  return {
    title: "My chit",
    robots: { index: false, follow: false },
    referrer: "no-referrer", // the token is in the URL; never leak it to other sites
    appleWebApp: { capable: true, title: "Chitty", statusBarStyle: "black-translucent" },
    // "Add to Home Screen" here makes an app that opens this member's page, not /open
    manifest: `/m/${encodeURIComponent(token)}/manifest.webmanifest`,
  };
}
export const viewport: Viewport = { themeColor: "#0a0813" };

export default function Layout({ children }: LayoutProps<"/m/[token]">) {
  return <ToastProvider>{children}</ToastProvider>;
}
