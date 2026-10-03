import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://mimi-mimos.pages.dev"),
  title: "Mimi Mimos | Haute Parfumerie & Brand Collection 25ml",
  description:
    "Catálogo exclusivo de perfumes importados e árabes Brand Collection 25ml. O luxo das melhores fragrâncias do mundo na palma da sua mão.",
  keywords: [
    "perfumes importados",
    "perfumaria árabe",
    "Brand Collection",
    "25ml",
    "Mimi Mimos",
    "luxo",
    "Pix",
  ],
  authors: [{ name: "Mimi Mimos" }],
  applicationName: "Mimi Mimos",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Mimi Mimos",
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon-32.png"],
  },
  openGraph: {
    title: "Mimi Mimos | Haute Parfumerie & Brand Collection 25ml",
    description:
      "Catálogo exclusivo de perfumes importados e árabes Brand Collection 25ml. O luxo das melhores fragrâncias do mundo na palma da sua mão.",
    url: "/",
    siteName: "Mimi Mimos",
    images: [{ url: "/og-cover.jpg", width: 1344, height: 768, alt: "Mimi Mimos" }],
    type: "website",
    locale: "pt_BR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mimi Mimos | Haute Parfumerie",
    description: "Perfumes importados e árabes Brand Collection 25ml",
    images: ["/og-cover.jpg"],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#090a0f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css"
        />
        {/* Tema claro adaptativo — sobrescreve classes Tailwind quando em modo claro */}
        <style dangerouslySetInnerHTML={{ __html: `
          /* MODO CLARO AUTOMÁTICO (via prefers-color-scheme) */
          @media (prefers-color-scheme: light) {
            :root:not(.force-dark) .text-white { color: #2a2017 !important; }
            :root:not(.force-dark) .text-gray-100 { color: #2a2017 !important; }
            :root:not(.force-dark) .text-gray-200 { color: #3a2e1f !important; }
            :root:not(.force-dark) .text-gray-300 { color: #4a3a2a !important; }
            :root:not(.force-dark) .text-gray-400 { color: #6b5d4a !important; }
            :root:not(.force-dark) .text-gray-500 { color: #8a7a65 !important; }
            :root:not(.force-dark) .text-gray-600 { color: #9a8a75 !important; }
            :root:not(.force-dark) body { background-color: #faf7f0 !important; color: #2a2017 !important; }
            :root:not(.force-dark) .bg-obsidian-950 { background-color: #ffffff !important; }
            :root:not(.force-dark) .bg-obsidian-900 { background-color: #faf7f0 !important; }
            :root:not(.force-dark) .bg-obsidian-800 { background-color: #f0ebe0 !important; }
            :root:not(.force-dark) .bg-obsidian-800\\/40 { background-color: rgba(240,235,224,0.6) !important; }
            :root:not(.force-dark) .bg-obsidian-800\\/60 { background-color: rgba(240,235,224,0.8) !important; }
            :root:not(.force-dark) .bg-obsidian-800\\/80 { background-color: rgba(240,235,224,0.9) !important; }
            :root:not(.force-dark) .bg-obsidian-800\\/90 { background-color: rgba(240,235,224,0.95) !important; }
            :root:not(.force-dark) .bg-obsidian-900\\/40 { background-color: rgba(250,247,240,0.6) !important; }
            :root:not(.force-dark) .bg-obsidian-900\\/60 { background-color: rgba(250,247,240,0.8) !important; }
            :root:not(.force-dark) .bg-obsidian-900\\/80 { background-color: rgba(250,247,240,0.9) !important; }
            :root:not(.force-dark) .bg-obsidian-900\\/90 { background-color: rgba(250,247,240,0.95) !important; }
            :root:not(.force-dark) .bg-obsidian-950\\/80 { background-color: rgba(255,255,255,0.9) !important; }
            :root:not(.force-dark) .bg-black\\/80 { background: rgba(40,35,25,0.75) !important; }
            :root:not(.force-dark) .bg-black\\/85 { background: rgba(40,35,25,0.8) !important; }
            :root:not(.force-dark) .bg-black\\/75 { background: rgba(40,35,25,0.7) !important; }
            :root:not(.force-dark) .glass-panel { background: rgba(255,252,245,0.85) !important; border-color: rgba(170,140,44,0.25) !important; }
            :root:not(.force-dark) .glass-panel-gold { background: rgba(250,244,230,0.9) !important; border-color: rgba(170,140,44,0.4) !important; }
            :root:not(.force-dark) input, :root:not(.force-dark) textarea, :root:not(.force-dark) select { background-color: rgba(245,240,230,0.9) !important; color: #2a2017 !important; }
            :root:not(.force-dark) input::placeholder { color: #9a8a75 !important; }
            :root:not(.force-dark) ::-webkit-scrollbar-track { background: #f0ebe0 !important; }
            :root:not(.force-dark) ::-webkit-scrollbar-thumb { background: #c4a949 !important; }
          }
          /* MODO CLARO FORÇADO (via toggle .force-light) */
          .force-light .text-white { color: #2a2017 !important; }
          .force-light .text-gray-100 { color: #2a2017 !important; }
          .force-light .text-gray-200 { color: #3a2e1f !important; }
          .force-light .text-gray-300 { color: #4a3a2a !important; }
          .force-light .text-gray-400 { color: #6b5d4a !important; }
          .force-light .text-gray-500 { color: #8a7a65 !important; }
          .force-light .text-gray-600 { color: #9a8a75 !important; }
          .force-light body { background-color: #faf7f0 !important; color: #2a2017 !important; }
          .force-light .bg-obsidian-950 { background-color: #ffffff !important; }
          .force-light .bg-obsidian-900 { background-color: #faf7f0 !important; }
          .force-light .bg-obsidian-800 { background-color: #f0ebe0 !important; }
          .force-light .bg-obsidian-800\\/40 { background-color: rgba(240,235,224,0.6) !important; }
          .force-light .bg-obsidian-800\\/60 { background-color: rgba(240,235,224,0.8) !important; }
          .force-light .bg-obsidian-800\\/80 { background-color: rgba(240,235,224,0.9) !important; }
          .force-light .bg-obsidian-800\\/90 { background-color: rgba(240,235,224,0.95) !important; }
          .force-light .bg-obsidian-900\\/40 { background-color: rgba(250,247,240,0.6) !important; }
          .force-light .bg-obsidian-900\\/60 { background-color: rgba(250,247,240,0.8) !important; }
          .force-light .bg-obsidian-900\\/80 { background-color: rgba(250,247,240,0.9) !important; }
          .force-light .bg-obsidian-900\\/90 { background-color: rgba(250,247,240,0.95) !important; }
          .force-light .bg-obsidian-950\\/80 { background-color: rgba(255,255,255,0.9) !important; }
          .force-light .bg-black\\/80 { background: rgba(40,35,25,0.75) !important; }
          .force-light .bg-black\\/85 { background: rgba(40,35,25,0.8) !important; }
          .force-light .bg-black\\/75 { background: rgba(40,35,25,0.7) !important; }
          .force-light .glass-panel { background: rgba(255,252,245,0.85) !important; border-color: rgba(170,140,44,0.25) !important; }
          .force-light .glass-panel-gold { background: rgba(250,244,230,0.9) !important; border-color: rgba(170,140,44,0.4) !important; }
          .force-light input, .force-light textarea, .force-light select { background-color: rgba(245,240,230,0.9) !important; color: #2a2017 !important; }
          .force-light input::placeholder { color: #9a8a75 !important; }
          .force-light ::-webkit-scrollbar-track { background: #f0ebe0 !important; }
          .force-light ::-webkit-scrollbar-thumb { background: #c4a949 !important; }
        `}} />
      </head>
      <body
        className={`${cormorant.variable} ${jakarta.variable} antialiased bg-background text-foreground min-h-screen flex flex-col selection:bg-gold-500 selection:text-obsidian-950`}
      >
        {children}
      </body>
    </html>
  );
}
