// Fake data for the Phase 0 design preview. Nothing here is real or saved.
import type { ChitTerms } from "./money";

export const organiser = {
  business: "Sri Murugan Chits",
  businessTa: "ஸ்ரீ முருகன் சிட்ஸ்",
  owner: "Murugan",
  ownerTa: "முருகன்",
};

export const chitA: ChitTerms & { code: string; day: number; time: string; month: number } = {
  code: "A",
  total: 500000,
  months: 20,
  ratePct: 1.5,
  increment: 500,
  day: 10,
  time: "9:00 AM",
  month: 2,
};

export type Seat = { id: string; name: string; nameTa: string; phone: string; organiser?: boolean };

const people: [string, string][] = [
  ["Murugan", "முருகன்"],
  ["Selvi", "செல்வி"],
  ["Karthik", "கார்த்திக்"],
  ["Lakshmi", "லட்சுமி"],
  ["Ravi", "ரவி"],
  ["Ravi", "ரவி"],
  ["Meena", "மீனா"],
  ["Suresh", "சுரேஷ்"],
  ["Divya", "திவ்யா"],
  ["Arun", "அருண்"],
  ["Priya", "பிரியா"],
  ["Kumar", "குமார்"],
  ["Anitha", "அனிதா"],
  ["Vijay", "விஜய்"],
  ["Geetha", "கீதா"],
  ["Mani", "மணி"],
  ["Revathi", "ரேவதி"],
  ["Bala", "பாலா"],
  ["Kavitha", "கவிதா"],
  ["Sakthi", "சக்தி"],
];

export const seatsA: Seat[] = people.map(([name, nameTa], i) => ({
  id: `A${String(i + 1).padStart(2, "0")}`,
  name,
  nameTa,
  // A05 and A06 are the same person (Ravi holds two seats).
  phone: i === 5 ? "98400 11205" : `9${String(8400110000 + i * 101).slice(1)}`,
  organiser: i === 0,
}));

/** Stable colour per seat for the 3D spheres. */
export const hue = (i: number) => (i * 47 + 175) % 360;

export const otherChits = [
  { code: "B", total: 300000, months: 15, ratePct: 2, month: 3, status: "collection" as const, paid: 12, seats: 15, day: 3 },
  { code: "C", total: 1000000, months: 20, ratePct: 1.5, month: 0, status: "draft" as const, paid: 0, seats: 14, day: 0 },
];
