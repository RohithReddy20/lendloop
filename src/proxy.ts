import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Signed-out visitors are redirected to sign in before these pages render.
// This is a UX convenience only: every Convex function enforces auth and roles itself.
const isAppRoute = createRouteMatcher([
  "/board(.*)",
  "/listings(.*)",
  "/requests(.*)",
  "/incoming(.*)",
  "/admin(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isAppRoute(req)) await auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
