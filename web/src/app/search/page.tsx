import type { Metadata } from "next";
import Link from "next/link";
import { formatDuration, expandRunDays } from "@/lib/utils";
import styles from "./page.module.css";

export const dynamic = 'force-dynamic';

interface SearchResult {
    train_number: string;
    train_name: string;
    train_type: string;
    departure_time: string;
    arrival_time: string;
    dep_day: number;
    arr_day: number;
    duration_mins: number | null;
    duration_label: string;
    distance_km: number | null;
    classes_available: string[];
    has_pantry: boolean;
}

interface SearchResponse {
    from: { code: string; name: string };
    to: { code: string; name: string };
    date: string;
    day_of_week: string;
    total: number;
    results: SearchResult[];
    error?: string;
}

interface PageProps {
    searchParams: Promise<{ from?: string; to?: string; date?: string; class?: string }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
    const p = await searchParams;
    return {
        title: p.from && p.to ? `${p.from} → ${p.to}` : "Search Results",
    };
}

async function fetchResults(params: Awaited<PageProps["searchParams"]>): Promise<SearchResponse> {
    const { from, to, date, class: cls } = params;
    if (!from || !to || !date) {
        return { from: { code: "", name: "" }, to: { code: "", name: "" }, date: "", day_of_week: "", total: 0, results: [], error: "Missing parameters" };
    }
    const qs = new URLSearchParams({ from, to, date, ...(cls ? { class: cls } : {}) });
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    const res = await fetch(`${base}/api/search?${qs}`, { next: { revalidate: 300 } });
    return res.json();
}

// ─────────────────────────────────────────────
const CLASS_ORDER = ["EC", "1A", "CC", "2A", "FC", "3A", "SL", "2S", "GN", "UR"];

export default async function SearchPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const data = await fetchResults(params);

    if (data.error) {
        return (
            <div className="container page-padding">
                <p className="text-secondary">{data.error}</p>
                <Link href="/" className="btn btn-ghost mt-4">← Back to search</Link>
            </div>
        );
    }

    const dateFormatted = new Date(data.date).toLocaleDateString("en-IN", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
    });

    return (
        <div className="container page-padding">
            {/* Header */}
            <div className={styles.header}>
                <div>
                    <div className={styles.route}>
                        <span>{data.from.name}</span>
                        <span className={styles.routeArrow}>→</span>
                        <span>{data.to.name}</span>
                    </div>
                    <p className={styles.dateLabel}>{dateFormatted}</p>
                </div>
                <Link href="/" className="btn btn-ghost btn-sm">Edit search</Link>
            </div>

            {/* Result count */}
            <p className={`${styles.count} text-secondary`}>
                {data.total === 0
                    ? "No trains found on this route for the selected date."
                    : `${data.total} train${data.total !== 1 ? "s" : ""} found`}
            </p>

            {/* Results list */}
            <div className={styles.list}>
                {data.results.map((train) => (
                    <TrainCard
                        key={train.train_number}
                        train={train}
                        fromCode={params.from!}
                        toCode={params.to!}
                    />
                ))}
            </div>
        </div>
    );
}

function TrainCard({ train, fromCode, toCode }: { train: SearchResult; fromCode: string; toCode: string }) {
    const runDays = expandRunDays(0); // will be filled when we have real data

    const sortedClasses = [...train.classes_available].sort(
        (a, b) => CLASS_ORDER.indexOf(a) - CLASS_ORDER.indexOf(b)
    );

    return (
        <Link href={`/train/${train.train_number}?from=${fromCode}&to=${toCode}`} className={styles.card}>
            {/* Left: times */}
            <div className={styles.times}>
                <div className={styles.timeBlock}>
                    <span className={styles.time}>{train.departure_time}</span>
                    <span className={styles.stationCode}>{fromCode}</span>
                </div>
                <div className={styles.duration}>
                    <span className={styles.durationLine} />
                    <span className={styles.durationLabel}>{train.duration_label}</span>
                    <span className={styles.durationLine} />
                </div>
                <div className={styles.timeBlock}>
                    <span className={styles.time}>{train.arrival_time}</span>
                    <span className={styles.stationCode}>{toCode}</span>
                    {train.arr_day > 1 && (
                        <span className={styles.nextDay}>+{train.arr_day - 1}d</span>
                    )}
                </div>
            </div>

            {/* Middle: train info */}
            <div className={styles.info}>
                <div className={styles.trainName}>
                    <span className={styles.trainNumber}>{train.train_number}</span>
                    {train.train_name}
                </div>
                <div className={styles.meta}>
                    <span className="badge badge-neutral">{train.train_type}</span>
                    {train.has_pantry && <span className="badge badge-green">Pantry</span>}
                    {train.distance_km && (
                        <span className="text-muted text-xs">{Math.round(train.distance_km)} km</span>
                    )}
                </div>
            </div>

            {/* Right: classes */}
            <div className={styles.classes}>
                {sortedClasses.map((cls) => (
                    <span key={cls} className={`badge class-${cls}`}>{cls}</span>
                ))}
            </div>

            {/* Arrow */}
            <span className={styles.arrow} aria-hidden="true">›</span>
        </Link>
    );
}
