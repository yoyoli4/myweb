/** '2025-03' -> '2025.03'，'2025-03-18' -> '2025.03.18' */
export function formatDate(value: string): string {
  return value
    .split('-')
    .map((part) => part.padStart(2, '0'))
    .join('.')
}
