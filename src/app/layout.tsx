import type { Metadata, Viewport } from "next";
import { Newsreader } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", display: "swap", axes: ["opsz"], style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: "Cart Blanche",
  description: "Meal plans and a shared shopping list for our family.",
  applicationName: "Cart Blanche",
  appleWebApp: {
    capable: true,
    title: "Cart Blanche",
    statusBarStyle: "default",
    // Launch screens for the home-screen app (cream with the icon)
    startupImage: (
      [
        [430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3], [375, 812, 3],
        [414, 896, 2], [375, 667, 2], [402, 874, 3], [440, 956, 3],
      ] as const
    ).map(([w, h, d]) => ({
      url: `/splash/launch-${w * d}x${h * d}.png?v=4`,
      media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${d}) and (orientation: portrait)`,
    })),
  },
  icons: {
    icon: [{ url: "/icons/icon-192.png?v=3", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png?v=3", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf9f5" },
    { media: "(prefers-color-scheme: dark)", color: "#141311" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={newsreader.variable}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
