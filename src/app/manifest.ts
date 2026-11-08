import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cart Blanche",
    short_name: "Cart Blanche",
    description: "Meal plans and a shared shopping list",
    start_url: "/list",
    display: "standalone",
    background_color: "#fbf9f5",
    theme_color: "#fbf9f5",
    icons: [
      { src: "/icons/icon-192.png?v=3", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png?v=3", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png?v=3", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
