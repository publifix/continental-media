import { defineConfig } from "vite";

// GitHub Pages serves project sites from /<repo>/, not from the domain
// root, so asset URLs need that prefix only when building for that
// deployment. Local dev/preview keeps the default root base.
export default defineConfig({
  base: process.env.DEPLOY_TARGET === "gh-pages" ? "/continental-media/" : "/",
});
