import type { Availability } from "@convex/lib/availability";
import { formatDay, formatRange } from "@/lib/time";
import { Badge } from "./ui";

export function AvailabilityBadge({ availability }: { availability: Availability }) {
  switch (availability.state) {
    case "available":
      return (
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tone="accent">● Available</Badge>
          {availability.nextBooking && (
            <span className="text-xs text-muted">
              booked {formatRange(availability.nextBooking.startDate, availability.nextBooking.endDate)}
            </span>
          )}
        </span>
      );
    case "on_loan":
      return <Badge tone="warn">On loan until {formatDay(availability.until)}</Badge>;
    case "overdue":
      return <Badge tone="danger">Overdue since {formatDay(availability.since)}</Badge>;
  }
}
