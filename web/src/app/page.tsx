import type { Metadata } from "next";
import SearchForm from "@/components/SearchForm";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Search Trains — OneRail",
};

export default function HomePage() {
  return (
    <div className={styles.page}>
      {/* Hero */}
      <section className={styles.hero}>
        <div className="container">
          <p className={styles.eyebrow}>Indian Railways · SR Zone · More cities coming</p>
          <h1 className={styles.headline}>
            Find your train,<br />
            <span className={styles.accent}>without the noise.</span>
          </h1>
          <p className={styles.sub}>
            Schedules, stops, coach positions, and route maps — all in one clean place.
          </p>
        </div>
      </section>

      {/* Search card */}
      <section className={styles.searchSection}>
        <div className="container">
          <SearchForm />
        </div>
      </section>

      {/* Quick links */}
      <section className={styles.quickSection}>
        <div className="container">
          <h2 className={styles.quickTitle}>Popular SR Stations</h2>
          <div className={styles.chips}>
            {POPULAR_STATIONS.map((s) => (
              <a key={s.code} href={`/station/${s.code}`} className={styles.chip}>
                <span className={styles.chipCode}>{s.code}</span>
                <span className={styles.chipName}>{s.name}</span>
              </a>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

const POPULAR_STATIONS = [
  { code: "MAS", name: "Chennai Central" },
  { code: "MS", name: "Chennai Egmore" },
  { code: "SBC", name: "Bengaluru City" },
  { code: "CBE", name: "Coimbatore" },
  { code: "MDU", name: "Madurai" },
  { code: "TVC", name: "Thiruvananthapuram" },
  { code: "ERS", name: "Ernakulam" },
  { code: "SA", name: "Salem" },
  { code: "TPJ", name: "Tiruchirappalli" },
  { code: "NCJ", name: "Nagercoil" },
];
