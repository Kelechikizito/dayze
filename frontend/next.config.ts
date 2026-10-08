import type { NextConfig } from "next";

/*
 * Production builds use webpack (`next build --webpack` in package.json). Turbopack's production
 * build stalls in its PostCSS worker once @cofhe/sdk (WASM + a Web Worker) is in the client bundle.
 * `next dev` with Turbopack works fine. Re-test plain `next build` after upgrading Next or @cofhe/sdk.
 *
 * wagmi's Base Account connector pulls in @coinbase/cdp-sdk, which imports the optional
 * @x402/* payment packages. Dayze never uses x402, so those imports resolve to an empty module
 * instead of installing five unused packages.
 */
const unusedOptionalPeers = [
  "@x402/core/client",
  "@x402/evm",
  "@x402/evm/exact/client",
  "@x402/evm/upto/client",
  "@x402/svm/exact/client",
];

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: Object.fromEntries(unusedOptionalPeers.map((m) => [m, "./lib/empty-module.ts"])),
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      ...Object.fromEntries(unusedOptionalPeers.map((m) => [m, false])),
    };
    return config;
  },
};

export default nextConfig;
