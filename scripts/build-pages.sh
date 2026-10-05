#!/bin/sh
# Builds the GitHub Pages site into site/:
#   /          React demo
#   /angular/  Angular demo
#   /vanilla/  no-bundler example (CDN build of core)
# Relative base (./) so it works under any repo subpath.
set -e
cd "$(dirname "$0")/.."

npm run build:core
rm -rf site

npx vite build --base ./ --outDir ../site --emptyOutDir
npx vite build --config demo-angular/vite.config.ts --base ./ --outDir ../site/angular --emptyOutDir
npx vite build examples/vanilla --base ./ --outDir ../../site/vanilla --emptyOutDir

# Images are loaded by runtime URL strings, which Vite doesn't copy
cp -R demo/images site/images
cp -R examples/vanilla/images site/vanilla/images

touch site/.nojekyll
