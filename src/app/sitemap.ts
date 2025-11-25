import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://app.ambulancenow.gr";
  return [
    { url: `${base}/`, priority: 1 },
    { url: `${base}/book`, priority: 0.9 }
  ];
}
