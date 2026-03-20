import React from "react";
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
    "3e": "#d946ef", // Pink - 3A Economy
    "sl": "#10b981", // Green — Sleeper
    "gen": "#6b7280", // Grey — General (GS/GEN)
    "cc": "#06b6d4", // Cyan — AC Chair Car
    "ec": "#f97316", // Orange — Executive Chair Car
    "fc": "#ef4444", // Red — First Class
    "2s": "#84cc16", // Lime — Second Sitting
    "ea": "#dc2626", // Red - Exec Anubhuti
    "eog": "#374151", // Dark — EOG power car
    "slr": "#374151", // SLR / Brake van
    "pc": "#eab308",  // Yellow - Pantry Car
    "loco": "#1f2937", // Darkest — Engine/Loco
    "lds": "#ec4899", // Pink - Ladies 
};

const CLASS_LABELS: Record<string, string> = {
    "1a": "First AC (1A)",
    "2a": "Second AC (2A)",
    "3a": "Third AC (3A)",
    "3e": "3 AC Economy (3E)",
    "sl": "Sleeper (SL)",
    "gen": "General (GEN/UR)",
    "cc": "AC Chair Car (CC)",
    "ec": "Exec Chair (EC)",
    "fc": "First Class (FC)",
    "2s": "Second Sitting (2S)",
    "ea": "Exec Anubhuti (EA)",
    "eog": "Power Car (EOG)",
    "slr": "SLR / Shield",
    "pc": "Pantry Car (PC)",
    "loco": "Engine/Loco",
    "lds": "Ladies Coach",
};

const CLASS_SHORT_NAMES: Record<string, string> = {
    "1a": "1A",
    "2a": "2A",
    "3a": "3A",
    "3e": "3E",
    "sl": "SL",
    "gen": "GEN",
    "cc": "CC",
    "ec": "EC",
    "fc": "FC",
    "2s": "2S",
    "ea": "EA",
    "eog": "EOG",
    "slr": "SLR",
    "pc": "PC",
    "loco": "LOCO",
    "lds": "LDS",
};

function normalizeClassCode(classCode: string): string {
    const code = classCode.toLowerCase();
    if (code.startsWith("m") && !isNaN(parseInt(code.slice(1)))) return "3e";
    if (code === "a1") return "1a";
    if (code === "a2") return "2a";
    if (code === "a3") return "3a";
    if (code === "ae") return "3e";
    if (code === "ex") return "ec";
    if (code === "s2") return "2s";
    if (code === "darr") return "slr";
    if (code === "gs") return "gen";
    if (code === "eng" || code.startsWith("loco")) return "loco";
    return code;
}

function getCoachColor(classCode: string): string {
    return CLASS_COLORS[normalizeClassCode(classCode)] ?? "#374151";
}

function getCoachLabel(classCode: string): string {
    const code = normalizeClassCode(classCode);
    return CLASS_LABELS[code] ?? classCode.toUpperCase();
}

function getShortCoachType(classCode: string): string {
    const code = normalizeClassCode(classCode);
    return CLASS_SHORT_NAMES[code] ?? classCode.toUpperCase();
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
    const totalHalts = Math.max(0, totalStops - 2);
    const totalIntermediateStops = train.stops.reduce((sum, stop) => sum + (stop.intermediate_stations || 0), 0);

    let averageSpeed = 0;
    if (train.total_distance_km && train.total_duration_mins && train.total_duration_mins > 0) {
        averageSpeed = Math.round(train.total_distance_km / (train.total_duration_mins / 60));
    }

    const firstWordOfName = train.train_name.split(/[\s-]/)[0];
    const reverseTrain = await prisma.train.findFirst({
        where: {
            source_station_code: train.destination_station_code,
            destination_station_code: train.source_station_code,
            train_name: {
                contains: firstWordOfName,
            }
        },
        select: {
            train_number: true,
            train_name: true
        }
    });

    return (
        <div className={styles.container}>
            {/* ── HERO HEADER ── */}
            <header className={styles.header}>
                <div className="container">
                    <div className={styles.meta}>
                        <span className={styles.number}>{train.train_number}</span>
                        <span className={styles.type}>{train.train_type}</span>
                        {train.zone_code && (
                            <span className={styles.zone}>{train.zone_code} Zone</span>
                        )}
                        {train.locomotive_type && (
                            <span className={styles.loco}>{train.locomotive_type}</span>
                        )}
                        {reverseTrain && (
                            <a href={`/train/${reverseTrain.train_number}`} className={styles.reverseLink} title={`Reverse train: ${reverseTrain.train_name}`}>
                                🔁 {reverseTrain.train_number}
                            </a>
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

                    {/* Stats & Schedule Strip */}
                    <div className={styles.infoStrip}>
                        {/* FIRST ROW: Core Stats + Days of Run */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '2rem', alignItems: 'flex-start' }}>
                            <div className={styles.statsRow}>
                                {train.total_duration_mins != null && (
                                    <div className={styles.stat}>
                                        <span className={styles.statValue}>{formatDuration(train.total_duration_mins)}</span>
                                        <span className={styles.statLabel}>Travel Time</span>
                                    </div>
                                )}
                                {train.total_distance_km != null && (
                                    <div className={styles.stat}>
                                        <span className={styles.statValue}>{train.total_distance_km.toLocaleString()} km</span>
                                        <span className={styles.statLabel}>Distance</span>
                                    </div>
                                )}
                                {averageSpeed > 0 && (
                                    <div className={styles.stat}>
                                        <span className={styles.statValue}>{averageSpeed} km/h</span>
                                        <span className={styles.statLabel}>Avg Speed</span>
                                    </div>
                                )}
                                <div className={styles.stat}>
                                    <span className={styles.statValue}>{totalHalts}</span>
                                    <span className={styles.statLabel}>Halts</span>
                                </div>
                                <div className={styles.stat}>
                                    <span className={styles.statValue}>{totalStops}</span>
                                    <span className={styles.statLabel}>Total Stations</span>
                                </div>
                                <div className={styles.stat}>
                                    <span className={styles.statValue}>{totalIntermediateStops}</span>
                                    <span className={styles.statLabel}>Intermed. Stn</span>
                                </div>
                            </div>
                            <div className={styles.runDaysSection}>
                                <span className={styles.statLabel}>Days of Run</span>
                                <RunDayBadges bitmask={train.run_days} />
                            </div>
                        </div>

                        {/* SECOND ROW: Extended Information */}
                        <div className={styles.statsRowSecondary}>
                            {train.has_pantry && (
                                <div className={styles.stat}>
                                    <span className={styles.statValue}>
                                        🍽️ <span className={styles.statSubText}>{train.pantry_menu ? '(Menu Available)' : ''}</span>
                                    </span>
                                    <span className={styles.statLabel}>Pantry Car</span>
                                </div>
                            )}
                            <div className={styles.stat}>
                                <span className={styles.statValue}>
                                    {train.bedroll_available ? (
                                        <span style={{ color: "var(--success-color, #10b981)", display: "flex", alignItems: "center", gap: "6px" }}>
                                            <span style={{ fontSize: "1.2rem" }}>✅</span> <span style={{ fontSize: "1rem", fontWeight: "600" }}>Available</span>
                                        </span>
                                    ) : (
                                        <span style={{ color: "var(--error-color, #ef4444)", display: "flex", alignItems: "center", gap: "6px" }}>
                                            <span style={{ fontSize: "1.2rem" }}>❌</span> <span style={{ fontSize: "1rem", fontWeight: "600" }}>Not Available</span>
                                        </span>
                                    )}
                                </span>
                                <span className={styles.statLabel}>Bedroll Status</span>
                            </div>
                            {train.first_run_date && (
                                <div className={styles.stat}>
                                    <span className={styles.statValue}>{train.first_run_date}</span>
                                    <span className={styles.statLabel}>First Run</span>
                                </div>
                            )}
                            {train.max_speed && (() => {
                                const speedMatch = train.max_speed.match(/^(\d+(?:\.\d+)?)\s*(?:km\/hr|kmph|km\/h)/i);
                                const speed = speedMatch ? `${speedMatch[1]} km/h` : train.max_speed;
                                const sectionMatch = train.max_speed.match(/between\s+(.+)$/i);
                                const section = sectionMatch ? sectionMatch[1].replace(/between/i, '').trim() : null;

                                return (
                                    <div className={styles.stat} title={train.max_speed}>
                                        <span className={styles.statValue}>
                                            {speed} <span className={styles.statSubText} style={{ fontSize: '0.8rem' }}>⚡</span>
                                        </span>
                                        <span className={styles.statLabel}>Max Speed</span>
                                        {section && (
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px', maxWidth: '240px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {section}
                                            </span>
                                        )}
                                    </div>
                                );
                            })()}
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
                                        <div className={styles.coachType}>{getShortCoachType(coach.class_code)}</div>
                                    </div>
                                ))}
                            </div>
                            {/* Legend */}
                            <div className={styles.rakeLegend}>
                                {Array.from(new Set(train.coach_configs.map((c: any) => normalizeClassCode(c.class_code))))
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
                                        <React.Fragment key={stop.id}>
                                            <tr
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
                                                    {!isFirst && !isLast && stop.departure_time_mins != null && stop.arrival_time_mins != null
                                                        ? `${stop.departure_time_mins - stop.arrival_time_mins}m`
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
                                            {stop.intermediate_stations != null && stop.intermediate_stations > 0 && (
                                                <tr className={styles.intermediateRow}>
                                                    <td></td>
                                                    <td colSpan={7} className={styles.intermediateData}>
                                                        <span className={styles.intermediateText}>
                                                            ↓ {stop.intermediate_stations} intermediate stations
                                                        </span>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
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
