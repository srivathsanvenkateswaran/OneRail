import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { minsToTimeStr, minsToDayNumber } from "@/lib/utils";
import styles from "./page.module.css";

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ number: string }>;
}

export default async function TrainDetailsPage({ params }: PageProps) {
    const { number } = await params;

    const train = await prisma.train.findUnique({
        where: { train_number: number },
        include: {
            source_station: true,
            destination_station: true,
            stops: {
                orderBy: { stop_sequence: 'asc' }
            },
            coach_configs: {
                orderBy: { position_in_train: 'asc' }
            }
        }
    });

    if (!train) {
        notFound();
    }

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div className="container">
                    <div className={styles.meta}>
                        <span className={styles.number}>{train.train_number}</span>
                        <span className={styles.type}>{train.train_type}</span>
                    </div>
                    <h1 className={styles.name}>{train.train_name}</h1>
                    <div className={styles.route}>
                        <div className={styles.station}>
                            <span className={styles.code}>{train.source_station.station_code}</span>
                            <span className={styles.stationName}>{train.source_station.station_name}</span>
                        </div>
                        <div className={styles.arrow}>→</div>
                        <div className={styles.station}>
                            <span className={styles.code}>{train.destination_station.station_code}</span>
                            <span className={styles.stationName}>{train.destination_station.station_name}</span>
                        </div>
                    </div>
                </div>
            </header>

            <main className="container">
                <section className={styles.section}>
                    <h2 className={styles.sectionTitle}>Rake Composition</h2>
                    <div className={styles.rake}>
                        {train.coach_configs.map((coach: any) => (
                            <div key={coach.id} className={styles.coach}>
                                <div className={styles.coachLabel}>{coach.coach_label}</div>
                                <div className={styles.coachType}>{coach.class_code}</div>
                            </div>
                        ))}
                        {train.coach_configs.length === 0 && (
                            <div className={styles.empty}>Rake data unavailable for this train.</div>
                        )}
                    </div>
                    {train.rake_share_text && (
                        <p className={styles.rakeShare}>RSA: {train.rake_share_text}</p>
                    )}
                </section>

                <section className={styles.section}>
                    <h2 className={styles.sectionTitle}>Schedule & Timetable</h2>
                    <div className={styles.timeline}>
                        {train.stops.map((stop: any) => (
                            <div key={stop.id} className={styles.stop}>
                                <div className={styles.stopTime}>
                                    {minsToTimeStr(stop.arrival_time_mins)}
                                </div>
                                <div className={styles.stopDot}></div>
                                <div className={styles.stopDetails}>
                                    <div className={styles.stopStation}>
                                        {stop.station_code}
                                    </div>
                                    <div className={styles.stopMeta}>
                                        Day {stop.day_number} · {stop.distance_from_source_km} km
                                        {stop.platform_number && ` · PF ${stop.platform_number}`}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </main>
        </div>
    );
}
