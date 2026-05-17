import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Fire at the top of every hour; the worker re-derives each user's local
// time and decides whether they should be notified right now.
crons.cron(
  "rfc123 daily briefing",
  "0 * * * *",
  internal.notifications.runHourlyBriefing,
  {},
);

export default crons;
