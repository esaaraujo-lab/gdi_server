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
        {/* Google Analytics (GA4) — replace G-XXXXXXX with real ID when available */}
        {process.env.NEXT_PUBLIC_GA_ID && (
          <>
            <script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`}
            />
            <script dangerouslySetInnerHTML={{ __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}');
            `}} />
          </>
        )}
        {/* Meta Pixel — replace PIXEL_ID with real ID when available */}
        {process.env.NEXT_PUBLIC_META_PIXEL_ID && (
          <script dangerouslySetInnerHTML={{ __html: `
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${process.env.NEXT_PUBLIC_META_PIXEL_ID}');
              fbq('track', 'PageView');
            `}} />
        )}
        {/* Tema claro adaptativo — sobrescreve classes Tailwind quando em modo claro */}
        <style dangerouslySetInnerHTML={{ __html: `
          /* MODO CLARO AUTOMÁTICO (via prefers-color-scheme) — DIOR STYLE */
          @media (prefers-color-scheme: light) {
            :root:not(.force-dark) .text-white { color: #1a1a1a !important; }
            :root:not(.force-dark) .text-gray-100 { color: #1a1a1a !important; }
            :root:not(.force-dark) .text-gray-200 { color: #333333 !important; }
            :root:not(.force-dark) .text-gray-300 { color: #555555 !important; }
            :root:not(.force-dark) .text-gray-400 { color: #777777 !important; }
            :root:not(.force-dark) .text-gray-500 { color: #999999 !important; }
            :root:not(.force-dark) .text-gray-600 { color: #aaaaaa !important; }
            :root:not(.force-dark) body { background-color: #ffffff !important; color: #1a1a1a !important; }
            :root:not(.force-dark) .bg-obsidian-950 { background-color: #ffffff !important; }
            :root:not(.force-dark) .bg-obsidian-900 { background-color: #f7f7f7 !important; }
            :root:not(.force-dark) .bg-obsidian-800 { background-color: #f0f0f0 !important; }
            :root:not(.force-dark) .bg-obsidian-800\\/40 { background-color: rgba(240,240,240,0.6) !important; }
            :root:not(.force-dark) .bg-obsidian-800\\/60 { background-color: rgba(240,240,240,0.8) !important; }
            :root:not(.force-dark) .bg-obsidian-800\\/80 { background-color: rgba(240,240,240,0.9) !important; }
            :root:not(.force-dark) .bg-obsidian-800\\/90 { background-color: rgba(240,240,240,0.95) !important; }
            :root:not(.force-dark) .bg-obsidian-900\\/40 { background-color: rgba(247,247,247,0.6) !important; }
            :root:not(.force-dark) .bg-obsidian-900\\/60 { background-color: rgba(247,247,247,0.8) !important; }
            :root:not(.force-dark) .bg-obsidian-900\\/80 { background-color: rgba(247,247,247,0.9) !important; }
            :root:not(.force-dark) .bg-obsidian-900\\/90 { background-color: rgba(247,247,247,0.95) !important; }
            :root:not(.force-dark) .bg-obsidian-950\\/80 { background-color: rgba(255,255,255,0.95) !important; }
            :root:not(.force-dark) .text-obsidian-950 { color: #ffffff !important; }
            :root:not(.force-dark) .bg-black\\/80 { background: rgba(26,26,26,0.7) !important; }
            :root:not(.force-dark) .bg-black\\/85 { background: rgba(26,26,26,0.75) !important; }
            :root:not(.force-dark) .bg-black\\/75 { background: rgba(26,26,26,0.65) !important; }
            :root:not(.force-dark) .glass-panel { background: rgba(255,255,255,0.95) !important; border-color: rgba(0,0,0,0.05) !important; box-shadow: 0 2px 20px rgba(0,0,0,0.06) !important; }
            :root:not(.force-dark) .glass-panel-gold { background: rgba(255,250,240,0.95) !important; border-color: rgba(166,124,0,0.2) !important; box-shadow: 0 2px 20px rgba(0,0,0,0.06) !important; }
            :root:not(.force-dark) .text-gold-300 { color: #a67c00 !important; }
            :root:not(.force-dark) .text-gold-400 { color: #8a6800 !important; }
            :root:not(.force-dark) .btn-gold { background: #8a6800 !important; color: #ffffff !important; }
            :root:not(.force-dark) .btn-gold:hover { background: #6b5200 !important; }
            :root:not(.force-dark) .shadow-2xl { box-shadow: 0 4px 24px rgba(0,0,0,0.08) !important; }
            :root:not(.force-dark) input, :root:not(.force-dark) textarea, :root:not(.force-dark) select { background-color: rgba(255,255,255,0.9) !important; color: #1a1a1a !important; border-color: rgba(0,0,0,0.1) !important; }
            :root:not(.force-dark) input::placeholder { color: #999999 !important; }
            :root:not(.force-dark) ::-webkit-scrollbar-track { background: #f0f0f0 !important; }
            :root:not(.force-dark) ::-webkit-scrollbar-thumb { background: #c4a949 !important; }
          }
          /* MODO CLARO FORÇADO (via toggle .force-light) — DIOR STYLE */
          .force-light .text-white { color: #1a1a1a !important; }
          .force-light .text-gray-100 { color: #1a1a1a !important; }
          .force-light .text-gray-200 { color: #333333 !important; }
          .force-light .text-gray-300 { color: #555555 !important; }
          .force-light .text-gray-400 { color: #777777 !important; }
          .force-light .text-gray-500 { color: #999999 !important; }
          .force-light .text-gray-600 { color: #aaaaaa !important; }
          .force-light body { background-color: #ffffff !important; color: #1a1a1a !important; }
          .force-light .bg-obsidian-950 { background-color: #ffffff !important; }
          .force-light .bg-obsidian-900 { background-color: #f7f7f7 !important; }
          .force-light .bg-obsidian-800 { background-color: #f0f0f0 !important; }
          .force-light .bg-obsidian-800\\/40 { background-color: rgba(240,240,240,0.6) !important; }
          .force-light .bg-obsidian-800\\/60 { background-color: rgba(240,240,240,0.8) !important; }
          .force-light .bg-obsidian-800\\/80 { background-color: rgba(240,240,240,0.9) !important; }
          .force-light .bg-obsidian-800\\/90 { background-color: rgba(240,240,240,0.95) !important; }
          .force-light .bg-obsidian-900\\/40 { background-color: rgba(247,247,247,0.6) !important; }
          .force-light .bg-obsidian-900\\/60 { background-color: rgba(247,247,247,0.8) !important; }
          .force-light .bg-obsidian-900\\/80 { background-color: rgba(247,247,247,0.9) !important; }
          .force-light .bg-obsidian-900\\/90 { background-color: rgba(247,247,247,0.95) !important; }
          .force-light .bg-obsidian-950\\/80 { background-color: rgba(255,255,255,0.95) !important; }
          .force-light .text-obsidian-950 { color: #ffffff !important; }
          .force-light .bg-black\\/80 { background: rgba(26,26,26,0.7) !important; }
          .force-light .bg-black\\/85 { background: rgba(26,26,26,0.75) !important; }
          .force-light .bg-black\\/75 { background: rgba(26,26,26,0.65) !important; }
          .force-light .glass-panel { background: rgba(255,255,255,0.95) !important; border-color: rgba(0,0,0,0.05) !important; box-shadow: 0 2px 20px rgba(0,0,0,0.06) !important; }
          .force-light .glass-panel-gold { background: rgba(255,250,240,0.95) !important; border-color: rgba(166,124,0,0.2) !important; box-shadow: 0 2px 20px rgba(0,0,0,0.06) !important; }
          .force-light .text-gold-300 { color: #a67c00 !important; }
          .force-light .text-gold-400 { color: #8a6800 !important; }
          .force-light .btn-gold { background: #8a6800 !important; color: #ffffff !important; }
          .force-light .btn-gold:hover { background: #6b5200 !important; }
          .force-light .shadow-2xl { box-shadow: 0 4px 24px rgba(0,0,0,0.08) !important; }
          .force-light input, .force-light textarea, .force-light select { background-color: rgba(255,255,255,0.9) !important; color: #1a1a1a !important; border-color: rgba(0,0,0,0.1) !important; }
          .force-light input::placeholder { color: #999999 !important; }
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
