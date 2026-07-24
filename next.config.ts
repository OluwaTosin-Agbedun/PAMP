import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Next.js defaults Server Actions to a 1MB request body, well under
      // the `file_upload.max_size_mb` Configuration Centre setting's own
      // default (10MB, app/(dashboard)/applicants/import/actions.ts) —
      // without this, any import file over 1MB was rejected by the
      // framework before that setting's own check ever ran. Next can't
      // read a runtime DB setting at config-eval time, so this is a
      // static ceiling matching today's default; raise it here too if
      // `file_upload.max_size_mb` is ever configured above 10.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
