/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // The docs route reads docs/*.md from disk at request time. Serverless
    // hosts only ship traced files, so without this include the docs links
    // 404 once deployed even though the build passes.
    // (On Next 14 this key belongs under experimental; it is top level in 15.)
    outputFileTracingIncludes: {
      '/api/docs': ['./docs/**/*'],
    },
  },
  // Keeps the public docs addresses stable: /docs/VALIDATION.md is served by
  // the route handler at src/app/api/docs/route.ts.
};

export default nextConfig;
