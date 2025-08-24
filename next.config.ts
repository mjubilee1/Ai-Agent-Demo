import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // Ignore ESLint errors during builds (e.g., on Render)
    eslint: { ignoreDuringBuilds: true },

    // Ignore TypeScript type-check errors during builds
    typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
