/** @type {import('next').NextConfig} */
const API = process.env.ESCALA_API_URL || "http://127.0.0.1:8000";
const nextConfig = {
  reactStrictMode: true,
  // /api/* é encaminhado ao serviço Python (FastAPI + OR-Tools + SQLite)
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API}/api/:path*` }];
  },
};
export default nextConfig;
