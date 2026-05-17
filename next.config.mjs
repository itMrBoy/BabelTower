/** @type {import('next').NextConfig} */
const nextConfig = {
  // Windows without Developer Mode cannot create the pnpm symlinks Next traces
  // into .next/standalone. Keep standalone for Linux/Docker production builds.
  ...(process.platform === "win32" ? {} : { output: "standalone" }),
};

export default nextConfig;
