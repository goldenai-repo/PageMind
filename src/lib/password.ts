export function scorePassword(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(4, Math.max(1, Math.ceil(score / 1.25)));
}

export const STRENGTH = [
  { label: "", color: "transparent", width: "0%" },
  { label: "Weak", color: "#d94f4f", width: "25%" },
  { label: "Fair", color: "#e68a2e", width: "50%" },
  { label: "Good", color: "#b8c62b", width: "75%" },
  { label: "Strong", color: "#27a96c", width: "100%" },
] as const;
