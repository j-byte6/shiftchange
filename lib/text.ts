// Names like "Leo T." end in a period, so "...removed Leo T.." needs tidying.
export function tidy(text: string) {
  return text.replace(/\.\.(?=\s|$)/g, ".");
}
