import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // Links shared before the dashboard moved: /?name=First+Last
    return [
      {
        source: "/",
        has: [{ type: "query", key: "name", value: "(?<name>.+)" }],
        destination: "/dashboard?name=:name",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
