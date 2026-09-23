import os from "os";
import path from "path";
import express from "express";
import { createServer as createViteServer } from "vite";
import app from "./server/app";

const PORT = 3000;

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Already bound to every interface, so a phone on the same Wi-Fi can reach
  // this. The log used to name only localhost, which reads as though the bind
  // were loopback-only — so it now prints the addresses that actually work.
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    for (const addresses of Object.values(os.networkInterfaces())) {
      for (const address of addresses ?? []) {
        if (address.family === "IPv4" && !address.internal) {
          console.log(`  on your network: http://${address.address}:${PORT}`);
        }
      }
    }
  });
}

startServer();
