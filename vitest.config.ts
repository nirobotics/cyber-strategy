import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Keep the product Vite config; only exclude the independent preview workspace.
export default mergeConfig(viteConfig, defineConfig({
  test: { exclude: [...configDefaults.exclude, "cloudflare/**"] },
}));
