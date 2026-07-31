export const ASPECT_RATIO: Record<string, string | undefined> = {
  auto: undefined,
  '1:1': '1 / 1',
  '4:5': '4 / 5',
  '16:9': '16 / 9',
}

/** 由文字色推導強調色：同色相、提高彩度。避免使用者要調四個顏色。 */
export function accentFrom(textColor: string): string {
  return textColor === '#ffffff' ? '#7cc4ff' : '#1d6fd0'
}
