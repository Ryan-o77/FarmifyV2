/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Farmify ships as a plain folder of HTML, CSS and JavaScript. That is what
  // lets it be hosted free on Vercel, Netlify, Cloudflare Pages or any static
  // host, run offline once loaded, and keep every grower's field data in their
  // own browser instead of on someone else's server.
  output: "export",

  // Static hosts serve /about as /about/index.html; the trailing slash keeps
  // relative links working the same way on every one of them.
  trailingSlash: true,

  // No image optimisation server exists in a static export.
  images: { unoptimized: true },
};

export default nextConfig;
