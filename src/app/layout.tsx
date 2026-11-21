import type { Metadata, Viewport } from "next";
import { Anek_Tamil, Plus_Jakarta_Sans, Sora } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], display: "swap" });
const sora = Sora({ variable: "--font-sora", subsets: ["latin"], display: "swap" });
const tamil = Anek_Tamil({ variable: "--font-tamil", subsets: ["tamil", "latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Chitty", template: "%s · Chitty" },
  description: "Chit fund management with a live auction room.",
  icons: { apple: "/pwa-icon/180" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f4ec" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0a12" },
  ],
};

// Runs before first paint: applies the saved theme override and language so there is no flash.
const bootScript = `try{var d=document.documentElement,t=localStorage.getItem('chitty.theme');if(t==='light'||t==='dark')d.setAttribute('data-theme',t);var l=localStorage.getItem('chitty.lang');if(l==='ta'||l==='en')d.lang=l;}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${jakarta.variable} ${sora.variable} ${tamil.variable} h-full antialiased`}
    >
      <head>
        <script
          type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: bootScript }}
        />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
