/**
 * Convert a non-negative integer to English words.
 * Covers 0-999; returns the number as a string for values >= 1000.
 */
const ONES = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS = [
  "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
];

export function numberToWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  n = Math.floor(n);
  if (n >= 1000) return String(n);
  if (n === 0) return "zero";

  let result = "";

  if (n >= 100) {
    result += ONES[Math.floor(n / 100)] + " hundred";
    n %= 100;
    if (n > 0) result += " ";
  }

  if (n >= 20) {
    result += TENS[Math.floor(n / 10)];
    n %= 10;
    if (n > 0) result += "-" + ONES[n];
  } else if (n > 0) {
    result += ONES[n];
  }

  return result;
}

/** Capitalize the first letter: "twenty-five" -> "Twenty-five" */
export function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
