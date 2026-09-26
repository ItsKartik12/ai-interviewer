import { serve } from "bun";
import index from "./index.html";

const server = serve({
  port: Number(process.env.PORT || 3000),
  routes: {
    // Serve index.html for all unmatched routes (SPA behavior).
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
