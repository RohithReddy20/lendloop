import { clerkMiddleware } from "@clerk/nextjs/server";

// Makes the Clerk session available to server code. Sign-in is required by the
// (app) layout, and every Convex function enforces auth and roles itself.
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
