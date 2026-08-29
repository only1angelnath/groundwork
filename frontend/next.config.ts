import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  // @coinbase/cdp-sdk (pulled in transitively by RainbowKit's Coinbase Smart
  // Wallet connector) has dynamic imports of optional peer packages
  // (@x402/svm/exact/client etc.) that aren't installed and aren't needed —
  // they're only used if x402 payment flows are configured, which this app
  // doesn't use. Webpack tries to statically resolve them anyway during the
  // SSR bundle and fails the build. Marking the package external for the
  // server bundle (known issue: rainbow-me/rainbowkit#2595) skips that.
  serverExternalPackages: ["@coinbase/cdp-sdk"],
};
export default nextConfig;