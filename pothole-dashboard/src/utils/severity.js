export function severityLabel(score) {
  if (score >= 0.8) return { text: "High", chip: "chip chip-high" };
  if (score >= 0.5) return { text: "Medium", chip: "chip chip-med" };
  return { text: "Low", chip: "chip chip-low" };
}
