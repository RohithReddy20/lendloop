/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import schema from "../convex/schema";

export const modules = import.meta.glob("../convex/**/*.*s");

export function setup() {
  const t = convexTest(schema, modules);
  const as = (name: string, email = `${name.toLowerCase()}@example.com`) =>
    t.withIdentity({ subject: name.toLowerCase(), issuer: "https://test", name, email });
  return { t, ann: as("Ann"), bob: as("Bob"), cat: as("Cat") };
}

export function isoDay(offset = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
