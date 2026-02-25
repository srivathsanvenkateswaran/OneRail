"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./SearchForm.module.css";

interface Station {
    station_code: string;
    station_name: string;
    state: string | null;
    zone_code: string | null;
    station_category: string | null;
}

export default function SearchForm() {
    const router = useRouter();
    const today = new Date().toISOString().split("T")[0];

    const [from, setFrom] = useState<Station | null>(null);
    const [to, setTo] = useState<Station | null>(null);
    const [date, setDate] = useState(today);
    const [cls, setCls] = useState("");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!from || !to) return;
        const params = new URLSearchParams({
            from: from.station_code,
            to: to.station_code,
            date,
            ...(cls ? { class: cls } : {}),
        });
        router.push(`/search?${params.toString()}`);
    };

    const handleSwap = () => {
        setFrom(to);
        setTo(from);
    };

    return (
        <form onSubmit={handleSubmit} className={`glass-card card-padded ${styles.form}`} aria-label="Train search">
            <div className={styles.row}>
                {/* From */}
                <div className={styles.fieldGroup}>
                    <label className={styles.label} htmlFor="from-input">From</label>
                    <StationAutocomplete
                        id="from-input"
                        placeholder="Station name or code…"
                        value={from}
                        onChange={setFrom}
                        excludeCode={to?.station_code}
                    />
                </div>

                {/* Swap button */}
                <button
                    type="button"
                    onClick={handleSwap}
                    className={`btn btn-ghost btn-sm ${styles.swap}`}
                    aria-label="Swap stations"
                    title="Swap"
                >
                    ⇄
                </button>

                {/* To */}
                <div className={styles.fieldGroup}>
                    <label className={styles.label} htmlFor="to-input">To</label>
                    <StationAutocomplete
                        id="to-input"
                        placeholder="Station name or code…"
                        value={to}
                        onChange={setTo}
                        excludeCode={from?.station_code}
                    />
                </div>

                {/* Date */}
                <div className={`${styles.fieldGroup} ${styles.fieldDate}`}>
                    <label className={styles.label} htmlFor="date-input">Date</label>
                    <input
                        id="date-input"
                        type="date"
                        className="input"
                        value={date}
                        min={today}
                        onChange={(e) => setDate(e.target.value)}
                        required
                    />
                </div>

                {/* Class filter */}
                <div className={`${styles.fieldGroup} ${styles.fieldClass}`}>
                    <label className={styles.label} htmlFor="class-input">Class</label>
                    <select
                        id="class-input"
                        className="input"
                        value={cls}
                        onChange={(e) => setCls(e.target.value)}
                    >
                        <option value="">Any class</option>
                        <option value="1A">1A — First AC</option>
                        <option value="2A">2A — Second AC</option>
                        <option value="3A">3A — Third AC</option>
                        <option value="SL">SL — Sleeper</option>
                        <option value="CC">CC — AC Chair</option>
                        <option value="EC">EC — Executive Chair</option>
                        <option value="GN">GN — General</option>
                    </select>
                </div>

                {/* Submit */}
                <button
                    type="submit"
                    className={`btn btn-primary ${styles.submit}`}
                    disabled={!from || !to}
                >
                    Search trains
                </button>
            </div>
        </form>
    );
}

// ─────────────────────────────────────────────
// Station autocomplete component
// ─────────────────────────────────────────────

interface AutocompleteProps {
    id: string;
    placeholder: string;
    value: Station | null;
    onChange: (s: Station | null) => void;
    excludeCode?: string;
}

function StationAutocomplete({ id, placeholder, value, onChange, excludeCode }: AutocompleteProps) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<Station[]>([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

    // Show the selected station's name in the input, or whatever is being typed
    const displayValue = value ? `${value.station_code} — ${value.station_name}` : query;

    const search = useCallback(async (q: string) => {
        if (q.length < 2) { setResults([]); return; }
        setLoading(true);
        try {
            const res = await fetch(`/api/stations/search?q=${encodeURIComponent(q)}`);
            const data = await res.json();
            setResults(
                (data.results as Station[]).filter((s) => s.station_code !== excludeCode)
            );
        } catch {
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, [excludeCode]);

    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const q = e.target.value;
        setQuery(q);
        onChange(null);      // clear selection on typing
        setOpen(true);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => search(q), 200);
    };

    const handleSelect = (s: Station) => {
        onChange(s);
        setQuery("");
        setOpen(false);
        setResults([]);
    };

    // Close dropdown on outside click
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
        <div ref={containerRef} className={styles.autocomplete}>
            <input
                id={id}
                type="text"
                className="input"
                placeholder={placeholder}
                value={displayValue}
                onChange={handleInput}
                onFocus={() => { if (results.length > 0) setOpen(true); }}
                autoComplete="off"
                spellCheck={false}
                required
            />
            {open && (loading || results.length > 0) && (
                <ul className={styles.dropdown} role="listbox">
                    {loading && (
                        <li className={styles.dropdownLoading}>Searching…</li>
                    )}
                    {!loading && results.map((s) => (
                        <li
                            key={s.station_code}
                            className={styles.dropdownItem}
                            role="option"
                            onMouseDown={() => handleSelect(s)}
                        >
                            <span className={styles.dropdownCode}>{s.station_code}</span>
                            <span className={styles.dropdownName}>{s.station_name}</span>
                            {s.state && <span className={styles.dropdownState}>{s.state}</span>}
                        </li>
                    ))}
                    {!loading && results.length === 0 && query.length >= 2 && (
                        <li className={styles.dropdownEmpty}>No stations found</li>
                    )}
                </ul>
            )}
        </div>
    );
}
