export const REVIEW_LABELS = {
  outside_range: "Outside studied range",
  unusual_combination: "Unusual combination",
  nearby_disagreement: "Nearby tasting scores disagree",
  uncommon_score: "Uncommon predicted score",
} as const;
export type ReviewCode = keyof typeof REVIEW_LABELS;
export const REVIEW_CODES = Object.keys(REVIEW_LABELS) as ReviewCode[];
