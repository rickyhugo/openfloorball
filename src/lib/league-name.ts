const PATTERNS: Array<[RegExp, string]> = [
  [/SSL/i, "SSL"],
  [/F-Liiga/i, "F-Liiga"],
  [/L-UPL/i, "L-UPL"],
]

export function shortLeagueName(name: string) {
  for (const [pattern, label] of PATTERNS) {
    if (pattern.test(name)) {
      const gender = /Damer/i.test(name) ? "Damer" : "Herrar"
      return `${label} ${gender}`
    }
  }
  return name.replace(/\s*\(.*\)\s*$/, "").trim()
}
