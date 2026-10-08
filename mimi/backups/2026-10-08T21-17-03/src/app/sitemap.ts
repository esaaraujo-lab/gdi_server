import type { MetadataRoute } from "next";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://mimi-mimos.pages.dev";

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: base,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${base}/admin`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];

  // Dynamic product pages — fetch from D1
  try {
    const res = await fetch(`${base}/api/db/products`);
    if (!res.ok) return staticPages;
    const data = await res.json();
    if (!data?.success || !Array.isArray(data.products)) return staticPages;

    const productPages: MetadataRoute.Sitemap = data.products.map((p: { id: string; code: string; name: string; category: string }) => {
      // Generate slug (same logic as slug.ts)
      const prefix =
        p.category === "BRAND" ? "brand-collection" :
        p.category === "AFEER" ? "afeer" :
        p.category === "DECANTE" ? "decante" : "perfume";
      const codeMatch = p.code?.match(/(\d+)/);
      const token = codeMatch ? codeMatch[1] : "";
      const nameSlug = p.name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const slug = [prefix, token, nameSlug].filter(Boolean).join("-");

      return {
        url: `${base}/perfume/${slug}`,
        lastModified: new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      };
    });

    return [...staticPages, ...productPages];
  } catch {
    return staticPages;
  }
}
