import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  // Allow both VITE_* and PUBLIC_* env prefixes so the same var name works
  // across Vite (Vercel) and Bun dev-server builds.
  envPrefix: ["VITE_", "PUBLIC_"],
  server: {
    port: 3000,
  },
});
