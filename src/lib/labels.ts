import { CATEGORIES, CONDITIONS, type Category, type Condition } from "@convex/lib/constants";

export { CATEGORIES, CONDITIONS };
export type { Category, Condition };

export const CATEGORY_LABELS: Record<Category, string> = {
  power_tools: "Power tools",
  hand_tools: "Hand tools",
  garden: "Garden",
  kitchen: "Kitchen",
  camping: "Camping",
  cleaning: "Cleaning",
  ladders: "Ladders",
  other: "Other",
};

export const CATEGORY_ICONS: Record<Category, string> = {
  power_tools: "🔌",
  hand_tools: "🔨",
  garden: "🌱",
  kitchen: "🍳",
  camping: "⛺",
  cleaning: "🧽",
  ladders: "🪜",
  other: "📦",
};

export const CONDITION_LABELS: Record<Condition, string> = {
  like_new: "Like new",
  good: "Good",
  fair: "Fair",
  well_used: "Well used",
};
