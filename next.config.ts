import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: { '/api/spj': ['./public/images/kuitansi-biru.svg'] },
};

export default nextConfig;
