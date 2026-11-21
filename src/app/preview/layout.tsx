import { ToastProvider } from "@/components/ui/kit";

export default function PreviewLayout({ children }: LayoutProps<"/preview">) {
  return <ToastProvider>{children}</ToastProvider>;
}
