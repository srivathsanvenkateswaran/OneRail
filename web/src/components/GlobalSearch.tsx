"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./GlobalSearch.module.css";

interface TrainResult {
    train_number: string;
    train_name: string;
    source_station: { station_code: string; station_name: string };
    destination_station: { station_code: string; station_name: string };
}

export default function GlobalSearch() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<TrainResult[]>([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
    const router = useRouter();

    const search = useCallback(async (q: string) => {
        if (q.length < 2) {
            setResults([]);
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(`/api/trains/search?q=${encodeURIComponent(q)}`);
            const data = await res.json();
            setResults(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Search failed:", error);
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const q = e.target.value;
        setQuery(q);
        setOpen(true);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => search(q), 300);
    };

    const handleSelect = (t: TrainResult) => {
        setQuery("");
        setOpen(false);
        router.push(`/train/${t.train_number}`);
    };

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    return (
        <div ref={containerRef} className={styles.container}>
            <div className={styles.inputWrapper}>
                <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                    type="text"
                    className={styles.input}
                    placeholder="Search train name or number..."
                    value={query}
                    onChange={handleInput}
                    onFocus={() => { if (query.length >= 2) setOpen(true); }}
                    autoComplete="off"
                    spellCheck={false}
                />
            </div>

            {open && (loading || results.length > 0 || (query.length >= 2 && !loading)) && (
                <div className={styles.dropdown}>
                    {loading && <div className={styles.status}>Searching for trains...</div>}
                    {!loading && results.map((t) => (
                        <div
                            key={t.train_number}
                            className={styles.item}
                            onClick={() => handleSelect(t)}
                        >
                            <div className={styles.trainNumber}>{t.train_number}</div>
                            <div className={styles.info}>
                                <div className={styles.trainName}>{t.train_name}</div>
                                <div className={styles.route}>
                                    {t.source_station.station_name} → {t.destination_station.station_name}
                                </div>
                            </div>
                        </div>
                    ))}
                    {!loading && results.length === 0 && query.length >= 2 && (
                        <div className={styles.status}>No trains found for "{query}"</div>
                    )}
                </div>
            )}
        </div>
    );
}
