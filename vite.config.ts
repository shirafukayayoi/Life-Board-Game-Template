import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("index.html", import.meta.url)),
        controller: fileURLToPath(new URL("controller.html", import.meta.url)),
        controllerPlay: fileURLToPath(new URL("controller-play.html", import.meta.url)),
        display: fileURLToPath(new URL("display.html", import.meta.url)),
        game: fileURLToPath(new URL("game.html", import.meta.url)),
      },
    },
  },
});
