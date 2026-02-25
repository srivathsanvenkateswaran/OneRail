/**
 * lib/utils.ts — Shared utility functions for the Next.js app.
 */

// ─────────────────────────────────────────────
// Time formatting
// ─────────────────────────────────────────────

/**
 * Convert minutes-from-midnight (as stored in TrainStop) to "HH:MM" display format.
 * e.g. 370 → "06:10", 1520 → "01:20" (with day 2 context)
 */
export function minsToTimeStr(mins: number | null | undefined): string {
    if (mins === null || mins === undefined) return "--:--";
    const normalised = mins % 1440; // strip day offset
    const h = Math.floor(normalised / 60);
    const m = normalised % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Calculate day number from total minutes (1-indexed).
 * Used to show "+1 day", "+2 day" labels on long journeys.
 */
export function minsToDayNumber(totalMins: number): number {
    return Math.floor(totalMins / 1440) + 1;
}

/**
 * Format a duration in minutes as "Xh Ym".
 * e.g. 290 → "4h 50m"
 */
export function formatDuration(mins: number | null | undefined): string {
    if (!mins) return "--";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ─────────────────────────────────────────────
// run_days bitmask helpers
// ─────────────────────────────────────────────

const DAY_BITS: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 4,
    Thu: 8,
    Fri: 16,
    Sat: 32,
    Sun: 64,
};
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Expand a bitmask integer to an array of day names the train runs on.
 * e.g. 65 → ["Mon", "Sun"]
 */
export function expandRunDays(bitmask: number): string[] {
    return DAY_NAMES.filter((day) => (bitmask & DAY_BITS[day]) > 0);
}

/**
 * Return the bitmask bit for a JavaScript Date's day of week.
 * JS Date.getDay(): 0 = Sunday, 1 = Monday … 6 = Saturday
 */
export function dateToDayBit(date: Date): number {
    const jsDayToName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return DAY_BITS[jsDayToName[date.getDay()]];
}

/**
 * Does a train with this bitmask run on the given date?
 */
export function trainRunsOnDate(runDays: number, date: Date): boolean {
    return (runDays & dateToDayBit(date)) > 0;
}

// ─────────────────────────────────────────────
// Class code helpers
// ─────────────────────────────────────────────

const CLASS_LABELS: Record<string, string> = {
    "1A": "First AC",
    "2A": "Second AC",
    "3A": "Third AC",
    "SL": "Sleeper",
    "GN": "General",
    "CC": "AC Chair Car",
    "EC": "Executive Chair Car",
    "FC": "First Class",
    "2S": "Second Sitting",
    "UR": "Unreserved",
};

export function classLabel(code: string): string {
    return CLASS_LABELS[code] ?? code;
}

// ─────────────────────────────────────────────
// Train type helpers (per gemini.md rule 5a)
// ─────────────────────────────────────────────

const OBSCURE_TYPES = new Set([
    "Heritage",
    "Tourist",
    "Toy Train",
    "Rail Motor",
    "Special",
    "Inspection",
]);

export function isObscureTrainType(type: string): boolean {
    return OBSCURE_TYPES.has(type);
}

// ─────────────────────────────────────────────
// CN helpers
// ─────────────────────────────────────────────

export function cn(...classes: (string | undefined | null | false)[]): string {
    return classes.filter(Boolean).join(" ");
}
