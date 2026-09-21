/** @type {import('next').NextConfig} */
const nextConfig = {
  // required by the Dockerfile's standalone runner stage
  output: "standalone",
};

export default nextConfig;
