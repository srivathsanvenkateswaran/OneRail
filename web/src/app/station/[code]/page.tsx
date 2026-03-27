import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";
import styles from "./page.module.css";
import Link from "next/link";

interface Props {
  params: { code: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const code = params.code.toUpperCase();
  const station = await prisma.station.findUnique({
    where: { station_code: code },
    select: { station_name: true }
  });

  if (!station) return { title: "Unknown Station — OneRail" };

  return {
    title: `${station.station_name} (${code}) — OneRail`,
    description: `Train schedules, platforms, and amenities for ${station.station_name} (${code}) railway station.`,
  };
}

export default async function StationPage({ params }: Props) {
  const code = params.code.toUpperCase();

  const station = await prisma.station.findUnique({
    where: { station_code: code },
    include: {
      source_trains: { take: 10, select: { train_number: true, train_name: true, destination_station_code: true } },
      dest_trains: { take: 10, select: { train_number: true, train_name: true, source_station_code: true } },
      stops: {
        take: 20,
        orderBy: { arrival_time_mins: 'asc' },
        include: { train: { select: { train_number: true, train_name: true, source_station_code: true, destination_station_code: true } } }
      }
    }
  });

  if (!station) return notFound();

  return (
    <div className={styles.page}>
      {/* ── Header / Hero ── */}
      <header className={styles.hero}>
        <div className="container">
          <div className={styles.heroContent}>
            <div>
              <div className={styles.badges}>
                <span className={styles.badgeCode}>{station.station_code}</span>
                {station.zone_code && <span className={styles.badgeZone}>{station.zone_code}</span>}
                {station.is_junction && <span className={styles.badgeJunction}>📍 Junction</span>}
                {station.is_terminus && <span className={styles.badgeTerminus}>🛑 Terminus</span>}
              </div>
              <h1 className={styles.name}>{station.station_name}</h1>
              <p className={styles.meta}>
                {station.state ? `${station.state} · ` : ''}
                {station.num_platforms ? `${station.num_platforms} Platforms · ` : ''}
                {station.elevation_m ? `${station.elevation_m}m Elevation` : ''}
              </p>
            </div>

            {/* Minimap (Static for now, can be replaced with full interactive component) */}
            {station.latitude && station.longitude && (
              <div className={styles.minimap}>
                <img 
                  src={`https://basemaps.cartocdn.com/gl/dark-matter-gl-style/static/${station.longitude},${station.latitude},12,0/400x200@2x?access_token=none`} 
                  alt="Map Location" 
                  className={styles.minimapImg} 
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
                <div className={styles.minimapPin} />
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="container">
        <div className={styles.grid}>
          {/* ── Left Column: Trains ── */}
          <div className={styles.mainCol}>
            
            {/* Originating Trains */}
            {station.source_trains.length > 0 && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Trains Originating Here</h2>
                <div className={styles.trainList}>
                  {station.source_trains.map(t => (
                    <Link href={`/train/${t.train_number}`} key={t.train_number} className={styles.trainCard}>
                      <span className={styles.trainNum}>{t.train_number}</span>
                      <span className={styles.trainName}>{t.train_name}</span>
                      <span className={styles.trainRoute}>to {t.destination_station_code}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Terminating Trains */}
            {station.dest_trains.length > 0 && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Trains Terminating Here</h2>
                <div className={styles.trainList}>
                  {station.dest_trains.map(t => (
                    <Link href={`/train/${t.train_number}`} key={t.train_number} className={styles.trainCard}>
                      <span className={styles.trainNum}>{t.train_number}</span>
                      <span className={styles.trainName}>{t.train_name}</span>
                      <span className={styles.trainRoute}>from {t.source_station_code}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Passing Trains */}
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Passing Trains (Sample)</h2>
              {station.stops.length > 0 ? (
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Train</th>
                        <th>Route</th>
                        <th>Arrives</th>
                        <th>Departs</th>
                        <th>PF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {station.stops.map(stop => (
                        <tr key={stop.id}>
                          <td>
                            <Link href={`/train/${stop.train.train_number}`} className={styles.inlineLink}>
                              <span className={styles.trainNumSm}>{stop.train.train_number}</span>
                              {stop.train.train_name}
                            </Link>
                          </td>
                          <td className={styles.mutedText}>{stop.train.source_station_code} → {stop.train.destination_station_code}</td>
                          <td>{formatTime(stop.arrival_time_mins)}</td>
                          <td>{formatTime(stop.departure_time_mins)}</td>
                          <td>{stop.platform_number || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className={styles.emptyState}>No train schedules currently available for this station.</div>
              )}
            </section>
          </div>

          {/* ── Right Column: Amenities & Info ── */}
          <aside className={styles.sideCol}>
            <section className={styles.glassCard}>
              <h3 className={styles.cardTitle}>Station Amenities</h3>
              <ul className={styles.amenityList}>
                <li className={station.has_wifi ? styles.amenityYes : styles.amenityNo}>
                  <span className={styles.amenityIcon}>📡</span> Free WiFi
                </li>
                <li className={station.has_waiting_room ? styles.amenityYes : styles.amenityNo}>
                  <span className={styles.amenityIcon}>🛋️</span> Waiting Room
                </li>
                <li className={station.has_retiring_room ? styles.amenityYes : styles.amenityNo}>
                  <span className={styles.amenityIcon}>🛏️</span> Retiring Room
                </li>
                <li className={station.has_food_plaza ? styles.amenityYes : styles.amenityNo}>
                  <span className={styles.amenityIcon}>🍔</span> Food Plaza
                </li>
              </ul>
            </section>

            <section className={styles.glassCard}>
              <h3 className={styles.cardTitle}>Geospatial Data</h3>
              <div className={styles.geoData}>
                <div className={styles.geoRow}>
                  <span>Latitude</span>
                  <strong>{station.latitude?.toFixed(5) || 'Unknown'}</strong>
                </div>
                <div className={styles.geoRow}>
                  <span>Longitude</span>
                  <strong>{station.longitude?.toFixed(5) || 'Unknown'}</strong>
                </div>
                <div className={styles.geoRow}>
                  <span>Category</span>
                  <strong>{station.station_category || 'N/A'}</strong>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}

// ── Helpers ──

function formatTime(mins: number | null) {
  if (mins === null) return '--:--';
  const realMins = mins % 1440; // wrap around 24h
  const h = Math.floor(realMins / 60).toString().padStart(2, '0');
  const m = (realMins % 60).toString().padStart(2, '0');
  
  if (mins >= 1440) {
    return `${h}:${m} (+${Math.floor(mins / 1440)}d)`;
  }
  return `${h}:${m}`;
}
