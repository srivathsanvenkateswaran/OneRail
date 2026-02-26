"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Navbar.module.css";
import GlobalSearch from "./GlobalSearch";

export default function Navbar() {
    const pathname = usePathname();

    return (
        <header className={styles.header}>
            <div className={`container ${styles.inner}`}>
                {/* Logo */}
                <Link href="/" className={styles.logo}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ filter: 'drop-shadow(0 0 8px rgba(224,123,57,0.5))' }}>
                        <defs>
                            <linearGradient id="logoGrad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                                <stop stopColor="#e07b39" />
                                <stop offset="1" stopColor="#ff5e00" />
                            </linearGradient>
                        </defs>
                        <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#logoGrad)" />
                        <path d="M7 17V10M12 17V7M17 17V13" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                    <span>OneRail</span>
                </Link>

                <div className={styles.searchWrapper}>
                    <GlobalSearch />
                </div>


            </div>
        </header>
    );
}
