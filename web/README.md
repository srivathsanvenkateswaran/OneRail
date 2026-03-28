# OneRail — Web App

This is the Next.js application that powers the OneRail frontend and API. It contains the UI, all API routes, the Prisma schema, and data processing scripts.

For the full project overview, see the [root README](../README.md).

## Getting Started

See [`docs/getting_started.md`](../docs/getting_started.md) for the complete setup guide.

Quick start:

```bash
# Install dependencies
npm install

# Set up environment — fill in your DATABASE_URL
cp .env.example .env

# Push schema to your local database
npx prisma db push

# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Structure

```
web/
├── src/
│   ├── app/
│   │   ├── api/                # REST API routes
│   │   │   ├── atlas/          # /api/atlas/geojson, /api/atlas/zones
│   │   │   ├── trains/         # /api/trains/search
│   │   │   ├── train/[number]/ # /api/train/:number
│   │   │   ├── stations/       # /api/stations/search
│   │   │   ├── station/[code]/ # /api/station/:code
│   │   │   └── search/         # /api/search (global)
│   │   ├── atlas/              # Interactive map page
│   │   ├── train/[number]/     # Train detail page
│   │   ├── station/[code]/     # Station detail page
│   │   ├── search/             # Search results page
│   │   ├── layout.tsx          # Root layout
│   │   └── page.tsx            # Home page
│   ├── components/
│   │   ├── GlobalSearch.tsx    # Nav search dropdown
│   │   ├── SearchForm.tsx      # Train search form
│   │   └── Navbar.tsx          # Navigation bar
│   └── lib/
│       ├── prisma.ts           # Prisma client singleton (always import from here)
│       ├── clientCache.ts      # IndexedDB cache for Atlas GeoJSON
│       └── utils.ts            # Shared utilities
├── prisma/
│   ├── schema.prisma           # Database schema (source of truth)
│   └── migrations/             # Migration history
└── scripts/                    # Data processing scripts (run with npx tsx)
```

## Key Notes

- **Prisma 7:** Uses `@prisma/adapter-pg` driver adapter. Always use the client from `src/lib/prisma.ts` — never instantiate `PrismaClient` directly.
- **Atlas cache:** After updating geographic data, bump the `cacheKey` version in `src/app/atlas/page.tsx` to invalidate the client-side IndexedDB cache.
- **Scripts:** Run with `npx tsx scripts/<name>.ts` from the `web/` directory with your `.env` loaded.
