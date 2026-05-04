// 🔑 TS source of truth for dynamic bindings & type safety.
// 🎨 CSS equivalent in :root (styles.scss) for static styling, cascade & GPU rendering.
// ⚠️ Keep both in sync when updating the layer palette.
export const LAYER_THEME = {
  Bronze:  { bg: '#1C140A', border: '#7A5C1F', accent: '#D4A373', text: '#D4A373' },
  Silver:  { bg: '#1A2233', border: '#5A6F8A', accent: '#94A8C4', text: '#94A8C4' }, // 🔵 Blue-gray più luminoso, undertone freddo
  Gold:    { bg: '#2B2208', border: '#A67C00', accent: '#F5D03B', text: '#F5D03B' },
  Unknown: { bg: '#14181F', border: '#3A414A', accent: '#6B7580', text: '#6B7580' }  // ⚫ Grigio neutro desaturato, chiaramente distincto
} as const;

export type LayerKey = keyof typeof LAYER_THEME;
