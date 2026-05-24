import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  // The brief-pdf route reads Geist TTFs from src/lib/fonts at runtime via
  // path.join(process.cwd(), ...). The string isn't statically analyzable
  // by Next.js's file tracer, so include the .ttf files explicitly.
  outputFileTracingIncludes: {
    "/api/brief-pdf/[projectId]": ["./src/lib/fonts/*.ttf"],
  },
};

export default nextConfig;
