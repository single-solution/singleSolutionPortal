import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToasterProvider } from "@/components/ToasterProvider";

export const metadata: Metadata = {
  title: "Single Solution Sync",
  description: "Automatic employee presence and attendance tracking system",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "SS Sync",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAFA" },
    { media: "(prefers-color-scheme: dark)", color: "#111113" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="apple-touch-icon" href="/icons/icon.svg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className="antialiased min-h-screen" suppressHydrationWarning>
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("ss-theme");var d=t==="dark";document.documentElement.setAttribute("data-theme",d?"dark":"light")}catch(e){}})();if("serviceWorker"in navigator)navigator.serviceWorker.register("/sw.js").catch(function(){})`,
          }}
        />
        <ToasterProvider />
        {children}
      </body>
    </html>
  );
}
