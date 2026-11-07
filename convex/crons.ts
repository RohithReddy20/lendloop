import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Safety net for the notification outbox: re-dispatch events whose delivery got lost.
// (The daily overdue reminder schedule lives in n8n, per the integration design.)
crons.interval("sweep stalled notifications", { minutes: 5 }, internal.notifications.sweep, {});

export default crons;
