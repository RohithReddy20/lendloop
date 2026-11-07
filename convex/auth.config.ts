import type { AuthConfig } from "convex/server";

// Clerk issues the JWT; Convex verifies it against Clerk's JWKS.
// CLERK_JWT_ISSUER_DOMAIN is set on the Convex deployment (npx convex env set ...).
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
