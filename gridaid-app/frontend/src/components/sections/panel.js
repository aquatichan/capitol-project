// React Bits SpotlightCard settings shared by the panels below the planner: a soft backlight that follows the
// pointer across the panel face, on the panel's own surface and edge (the card CSS draws the border).
export const PANEL_LIGHT = {
  intensity: 0.07,
  spotlightSize: 420,
  softness: 0.85,
  borderGlow: 0.5,
  proximity: 60,
  style: { "--spotlight-card-surface": "var(--card)", "--spotlight-card-border": "transparent", "--spotlight-card-shadow": "var(--bevel)" },
};
