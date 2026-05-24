const esbuild = require("esbuild");

const shared = {
  entryPoints: ["src/index.js"],
  bundle: true,
  target: "es2020",
  legalComments: "none",
};

async function build() {
  // Full bundle (globally available)
  await esbuild.build({
    ...shared,
    outfile: "dist/earth-globe.js",
    format: "iife",
    globalName: "GlobeWidget",
  });

  // Minified
  await esbuild.build({
    ...shared,
    outfile: "dist/earth-globe.min.js",
    format: "iife",
    globalName: "GlobeWidget",
    minify: true,
  });

  // ESM module
  await esbuild.build({
    ...shared,
    outfile: "dist/earth-globe.esm.js",
    format: "esm",
  });

  // ESM minified
  await esbuild.build({
    ...shared,
    outfile: "dist/earth-globe.esm.min.js",
    format: "esm",
    minify: true,
  });

  console.log("Built dist/earth-globe.js, .min.js, .esm.js, .esm.min.js");
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
