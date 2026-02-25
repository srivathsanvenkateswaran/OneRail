# OneRail — Project Constitution (`gemini.md`)
> This file is LAW. Only update when a schema changes, a rule is added, or the architecture is modified.

---

## 1. North Star
Build a modern, fast, mobile-friendly replacement for IndiaRailInfo — covering Train Search, Train Detail, and Station Detail pages — powered by a self-hosted database seeded from scraped data.

---

## 2. Architectural Invariants
- **No external runtime API dependency.** All train/station data is scraped once and stored locally in PostgreSQL.
- **Next.js App Router** is the frontend framework. API routes serve data from the local DB.
- **Prisma** is the ORM. All DB access goes through Prisma — raw SQL only for performance-critical read paths.
- **Scrapers are Python-only**, live in `tools/`, use `.tmp/` for intermediate files.
- **If logic changes, update `architecture/` SOPs before updating code.**

---

## 3. Technology Stack
| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Styling | Tailwind CSS |
| Database | PostgreSQL |
| ORM | Prisma |
| Maps | MapLibre GL |
| State | Zustand |
| Scraping | Python (BeautifulSoup + Playwright) |
| Hosting | TBD (Vercel + Railway / Supabase) |

---

## 4. Data Schema (v0.1 — CONFIRMED ✅)

### 4.1 `Zone`
```prisma
model Zone {
  zone_code    String    @id  // e.g. "CR", "NR"
  zone_name    String
  headquarters String
  stations     Station[]
  trains       Train[]
}
```

### 4.2 `Station`
```prisma
model Station {
  station_code      String   @id   // e.g. "NDLS", "BCT"
  station_name      String
  state             String
  zone_code         String
  zone              Zone     @relation(fields: [zone_code], references: [zone_code])
  latitude          Float
  longitude         Float
  elevation_m       Float?
  station_category  String?  // A1, A, B, C, D, E, F
  num_platforms     Int?
  has_retiring_room Boolean  @default(false)
  has_waiting_room  Boolean  @default(false)
  has_food_plaza    Boolean  @default(false)
  has_wifi          Boolean  @default(false)
  is_junction       Boolean  @default(false)
  is_terminus       Boolean  @default(false)
  stops             TrainStop[]
  track_from        TrackSegment[] @relation("TrackFrom")
  track_to          TrackSegment[] @relation("TrackTo")
}
```

### 4.3 `Train`
```prisma
model Train {
  train_number             String      @id   // e.g. "12301"
  train_name               String
  train_type               String      // Rajdhani, Shatabdi, Vande, Express, Passenger, EMU...
  source_station_code      String
  destination_station_code String
  total_distance_km        Float?
  total_duration_mins      Int?
  run_days                 Int         // bitmask: Mon=1,Tue=2,Wed=4,Thu=8,Fri=16,Sat=32,Sun=64
  zone_code                String?
  zone                     Zone?       @relation(fields: [zone_code], references: [zone_code])
  has_pantry               Boolean     @default(false)
  locomotive_type          String?     // Electric, Diesel, Hybrid
  classes_available        String[]
  stops                    TrainStop[]
  coach_configs            CoachConfig[]
  rake_memberships         RakeMember[]
}
```

### 4.4 `TrainStop` *(The central table)*
```prisma
model TrainStop {
  id                        Int      @id @default(autoincrement())
  train_number              String
  station_code              String
  stop_sequence             Int
  arrival_time_mins         Int?     // minutes from midnight of Day 1
  departure_time_mins       Int?
  halt_duration_mins        Int?
  day_number                Int      @default(1)
  distance_from_source_km   Float?
  platform_number           String?
  is_technical_halt         Boolean  @default(false)
  train                     Train    @relation(fields: [train_number], references: [train_number])
  station                   Station  @relation(fields: [station_code], references: [station_code])

  @@index([train_number])
  @@index([station_code])
  @@unique([train_number, stop_sequence])
}
```

### 4.5 `CoachConfig`
```prisma
model CoachConfig {
  id                Int    @id @default(autoincrement())
  train_number      String
  class_code        String  // 1A, 2A, 3A, SL, GN, CC, EC...
  coach_label       String  // A1, S5, B3...
  position_in_train Int
  num_seats         Int?
  train             Train  @relation(fields: [train_number], references: [train_number])
}
```

### 4.6 `RakeGroup` & `RakeMember`
```prisma
model RakeGroup {
  group_id Int          @id @default(autoincrement())
  notes    String?
  members  RakeMember[]
}

model RakeMember {
  id                 Int        @id @default(autoincrement())
  group_id           Int
  train_number       String
  sequence_in_group  Int
  group              RakeGroup  @relation(fields: [group_id], references: [group_id])
  train              Train      @relation(fields: [train_number], references: [train_number])
}
```

### 4.7 `TrackSegment`
```prisma
model TrackSegment {
  id                   Int      @id @default(autoincrement())
  from_station_code    String
  to_station_code      String
  distance_km          Float?
  track_type           String?  // Single, Double, Multi
  electrified          Boolean  @default(false)
  gauge                String?  // BG, MG, NG
  from_station         Station  @relation("TrackFrom", fields: [from_station_code], references: [station_code])
  to_station           Station  @relation("TrackTo", fields: [to_station_code], references: [station_code])
}
```

---

## 5. Behavioral Rules

### 5a. Data Visibility
- **Default:** Hide technical halts and obscure/heritage train types (MG, NG, special heritage trains) from primary UI.
- **On-Demand:** A clearly labeled "Show more details" / expand toggle must exist on Train pages to reveal hidden data.
- No data is ever **deleted** — only progressively disclosed.

### 5b. UI Tone
- **Minimalistic.** Clean whitespace, strong typography hierarchy, muted color palette.
- Inspired by Google Flights / Linear — information-dense but never cluttered.
- Avoid visual noise: no excessive borders, shadows, or decorative elements.
- Mobile-first. Every layout decision must pass a mobile sanity check.

### 5c. Data Seeding Priority
- **Phase 1 seed:** SR (Southern Railway) zone only — stations, trains, and schedules.
- **Phase 2:** Expand to adjacent zones (SWR, SCR) and eventually all 18 zones.
- Scrapers must be parameterized by zone so they can be re-run incrementally.

### 5d. Accessibility
- Publicly accessible web application.
- No authentication required for Phase 1 (read-only, no user accounts).
- Must be indexable by search engines (SSR/ISR pages, correct meta tags).

---

## 6. Do-Not Rules
- **Do NOT** call external APIs at runtime for train/station data.
- **Do NOT** store user data or PII of any kind (no auth, no accounts in Phase 1).
- **Do NOT** write scraper output directly to the DB — always stage to `.tmp/` first, validate, then import.

---

## 7. Maintenance Log
| Date | Change | Author |
|---|---|---|
| 2026-02-25 | v0.1 initialized | System Pilot |
| 2026-02-25 | v0.1 → CONFIRMED. Behavioral rules locked after Discovery Q&A. Scrape priority: SR zone first. | System Pilot |
