// Builder-only options. Identity and bindings are fixed in cloudflare.config.ts.
export default {
  assetsDirectory: "./.build-input/build/client",
  build: { command: "node scripts/build.mjs" },
  // RR's unchanged Node streaming entry requires renderToPipeableStream.
  alias: { "react-dom/server": "react-dom/server.node" },
  minify: true,
  uploadSourceMaps: false,
  sendMetrics: false,
  types: { generate: false },
};
