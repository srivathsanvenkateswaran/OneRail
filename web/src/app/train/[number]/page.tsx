import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { minsToTimeStr, formatDuration, expandRunDays } from "@/lib/utils";
import styles from "./page.module.css";

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ number: string }>;
}

// Coach class → display colour mapping
const CLASS_COLORS: Record<string, string> = {
    "1a": "#f59e0b", // Gold — First AC
    "2a": "#3b82f6", // Blue — Second AC
    "3a": "#8b5cf6", // Purple — Third AC
    "sl": "#10b981", // Green — Sleeper
    "gen": "#6b7280", // Grey — General
    "cc": "#06b6d4", // Cyan — AC Chair Car
    "ec": "#f97316", // Orange — Executive Chair Car
    "fc": "#ef4444", // Red — First Class
    "2s": "#84cc16", // Lime — Second Sitting
    "eog": "#374151", // Dark — EOG power car
    "loco-e": "#1f2937", // Darkest — Electric Loco
    "loco-d": "#292524", // Darkest — Diesel Loco
};

const CLASS_LABELS: Record<string, string> = {
    "1a": "First AC",
    "2a": "Second AC",
    "3a": "Third AC",
    "sl": "Sleeper",
    "gen": "General",
    "cc": "AC Chair Car",
    "ec": "Exec Chair",
    "fc": "First Class",
    "2s": "2nd Sitting",
    "eog": "Power Car",
    "loco-e": "Electric Loco",
    "loco-d": "Diesel Loco",
};

function getCoachColor(classCode: string): string {
    return CLASS_COLORS[classCode.toLowerCase()] ?? "#374151";
}

function getCoachLabel(classCode: string): string {
    return CLASS_LABELS[classCode.toLowerCase()] ?? classCode.toUpperCase();
}

function RunDayBadges({ bitmask }: { bitmask: number }) {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const bits = [1, 2, 4, 8, 16, 32, 64];
    return (
        <div className={styles.runDays}>
            {days.map((day, i) => (
                <span
                    key={day}
                    className={`${styles.dayBadge} ${(bitmask & bits[i]) ? styles.dayActive : styles.dayInactive}`}
                >
                    {day}
                </span>
            ))}
        </div>
    );
}

export default async function TrainDetailsPage({ params }: PageProps) {
    const { number } = await params;

    const train = await prisma.train.findUnique({
        where: { train_number: number },
        include: {
            source_station: true,
            destination_station: true,
            stops: {
                orderBy: { stop_sequence: 'asc' },
                include: { station: true }
            },
            coach_configs: {
                orderBy: { position_in_train: 'asc' }
            }
        }
    });

    if (!train) {
        notFound();
    }

    const runDaysList = expandRunDays(train.run_days);
    const isDaily = runDaysList.length === 7;
    const totalStops = train.stops.length;

    return (
        <div className={styles.container}>
            {/* ── HERO HEADER ── */}
            <header className={styles.header}>
                <div className="container">
                    <div className={styles.meta}>
                        <span className={styles.number}>{train.train_number}</span>
                        <span className={styles.type}>{train.train_type}</span>
                        {train.locomotive_type && (
                            <span className={styles.loco}>{train.locomotive_type}</span>
                        )}
                    </div>
                    <h1 className={styles.name}>{train.train_name}</h1>

                    <div className={styles.route}>
                        <div className={styles.routeStation}>
                            <span className={styles.routeStationName}>
                                {train.source_station.station_name}
                            </span>
                            <span className={styles.routeStationCode}>
                                ({train.source_station.station_code})
                            </span>
                        </div>
                        <div className={styles.routeMiddle}>
                            <div className={styles.routeLine}>
                                <div className={styles.routeDot} />
                                <div className={styles.routeTrack} />
                                <div className={styles.routeDot} />
                            </div>
                            {train.total_distance_km && (
                                <span className={styles.routeDist}>
                                    {train.total_distance_km.toLocaleString()} km
                                </span>
                            )}
                        </div>
                        <div className={styles.routeStation}>
                            <span className={styles.routeStationName}>
                                {train.destination_station.station_name}
                            </span>
                            <span className={styles.routeStationCode}>
                                ({train.destination_station.station_code})
                            </span>
                        </div>
                    </div>

                    {/* Stats strip */}
                    {/* Stats & Schedule Strip */}
                    <div className={styles.infoStrip}>
                        <div className={styles.stats}>
                            {train.total_duration_mins && (
                                <div className={styles.stat}>
                                    <span className={styles.statValue}>{formatDuration(train.total_duration_mins)}</span>
                                    <span className={styles.statLabel}>Journey Time</span>
                                </div>
                            )}
                            <div className={styles.stat}>
                                <span className={styles.statValue}>{totalStops}</span>
                                <span className={styles.statLabel}>Halts</span>
                            </div>
                            <div className={styles.stat}>
                                <span className={styles.statValue}>
                                    {isDaily ? "Daily" : runDaysList.slice(0, 2).join(", ") + (runDaysList.length > 2 ? "…" : "")}
                                </span>
                                <span className={styles.statLabel}>Frequency</span>
                            </div>
                            {train.has_pantry && (
                                <div className={styles.stat}>
                                    <span className={styles.statValue}>🍽️</span>
                                    <span className={styles.statLabel}>Pantry Car</span>
                                </div>
                            )}
                        </div>

                        <div className={styles.runDaysSection}>
                            <span className={styles.statLabel}>Days of Run</span>
                            <RunDayBadges bitmask={train.run_days} />
                        </div>
                    </div>
                </div>
            </header>

            <main className="container">

                {/* ── RAKE COMPOSITION ── */}
                <section className={styles.section}>
                    <h2 className={styles.sectionTitle}>Rake Composition</h2>

                    {train.coach_configs.length > 0 ? (
                        <>
                            <div className={styles.rake}>
                                {train.coach_configs.map((coach: any) => (
                                    <div
                                        key={coach.id}
                                        className={styles.coach}
                                        style={{ '--coach-color': getCoachColor(coach.class_code) } as React.CSSProperties}
                                        title={getCoachLabel(coach.class_code)}
                                    >
                                        <div className={styles.coachBar} />
                                        <div className={styles.coachLabel}>{coach.coach_label}</div>
                                        <div className={styles.coachType}>{coach.class_code.toUpperCase()}</div>
                                    </div>
                                ))}
                            </div>
                            {/* Legend */}
                            <div className={styles.rakeLegend}>
                                {Array.from(new Set(train.coach_configs.map((c: any) => c.class_code.toLowerCase())))
                                    .map((code: any) => (
                                        <div key={code} className={styles.legendItem}>
                                            <span
                                                className={styles.legendDot}
                                                style={{ background: getCoachColor(code) }}
                                            />
                                            <span>{getCoachLabel(code)}</span>
                                        </div>
                                    ))}
                            </div>
                        </>
                    ) : (
                        <div className={styles.emptyCard}>
                            Rake composition data is not available for this train.
                        </div>
                    )}

                    {train.rake_share_text && (
                        <div className={styles.rakeShareCard}>
                            <div className={styles.rakeShareIcon}>🔄</div>
                            <div>
                                <div className={styles.rakeShareTitle}>Rake Sharing (RSA)</div>
                                <div className={styles.rakeShareText}>{train.rake_share_text}</div>
                            </div>
                        </div>
                    )}
                </section>

                {/* ── TIMETABLE ── */}
                <section className={styles.section}>
                    <h2 className={styles.sectionTitle}>
                        Schedule &amp; Timetable
                        <span className={styles.sectionSubtitle}>{totalStops} stations</span>
                    </h2>

                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th className={styles.thSrno}>#</th>
                                    <th className={styles.thStation}>Station</th>
                                    <th className={styles.thTime}>Arrival</th>
                                    <th className={styles.thTime}>Departure</th>
                                    <th className={styles.thHalt}>Halt</th>
                                    <th className={styles.thDay}>Day</th>
                                    <th className={styles.thDist}>Distance</th>
                                    <th className={styles.thPF}>PF</th>
                                </tr>
                            </thead>
                            <tbody>
                                {train.stops.map((stop: any, idx: number) => {
                                    const isFirst = idx === 0;
                                    const isLast = idx === train.stops.length - 1;
                                    return (
                                        <tr
                                            key={stop.id}
                                            className={`
                                                ${styles.stopRow}
                                                ${isFirst ? styles.stopFirst : ""}
                                                ${isLast ? styles.stopLast : ""}
                                                ${stop.is_technical_halt ? styles.stopTech : ""}
                                            `}
                                        >
                                            <td className={styles.tdSrno}>{stop.stop_sequence}</td>
                                            <td className={styles.tdStation}>
                                                <span className={styles.stationName}>{stop.station?.station_name}</span>
                                                <span className={styles.stationCode}>({stop.station_code})</span>
                                                {stop.is_technical_halt && (
                                                    <span className={styles.techBadge}>Technical</span>
                                                )}
                                            </td>
                                            <td className={styles.tdTime}>
                                                <span className={isFirst ? styles.timeNA : styles.timeVal}>
                                                    {isFirst ? "Source" : minsToTimeStr(stop.arrival_time_mins)}
                                                </span>
                                            </td>
                                            <td className={styles.tdTime}>
                                                <span className={isLast ? styles.timeNA : styles.timeVal}>
                                                    {isLast ? "Destination" : minsToTimeStr(stop.departure_time_mins)}
                                                </span>
                                            </td>
                                            <td className={styles.tdHalt}>
                                                {!isFirst && !isLast && stop.halt_duration_mins != null
                                                    ? `${stop.halt_duration_mins}m`
                                                    : "—"}
                                            </td>
                                            <td className={styles.tdDay}>
                                                <span className={styles.dayNum}>D{stop.day_number}</span>
                                            </td>
                                            <td className={styles.tdDist}>
                                                {stop.distance_from_source_km != null
                                                    ? `${stop.distance_from_source_km} km`
                                                    : "—"}
                                            </td>
                                            <td className={styles.tdPF}>
                                                {stop.platform_number ?? "—"}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>
            </main>
        </div>
    );
}
