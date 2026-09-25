// Empty replacement module for the node:fs and node:crypto imports that the
// LiteRT.js emscripten glue keeps in its dead Node branches. The aliases in
// wrangler.jsonc point those specifiers here, so the bundle needs no
// nodejs_compat flag.
export default {};
