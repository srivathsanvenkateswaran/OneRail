# OneRail Deployment Guide (Vercel Hobby Plan)

This guide details how to deploy the OneRail Next.js application to Vercel's free tier (Hobby plan).

## 1. Prerequisites
- A [GitHub](https://github.com) account.
- A [Vercel](https://vercel.com) account.
- A PostgreSQL database (Vercel Postgres, [Supabase](https://supabase.com), or [Neon](https://neon.tech)).

## 2. Database Setup (Recommended: Neon or Vercel Postgres)
Since Vercel Hobby plan doesn't include a persistent database by default, you have two options:

### Option A: Vercel Postgres (Easiest)
1. Go to your Vercel Dashboard.
2. Select **Storage** > **Create Database** > **Postgres**.
3. Follow the wizard to create a new database.
4. Vercel will automatically add `POSTGRES_URL` and `DATABASE_URL` to your project environment variables.

### Option B: External Postgres (Neon / Supabase)
1. Create a project on [Neon](https://neon.tech) or [Supabase](https://supabase.com).
2. Get your connection string (e.g., `postgresql://user:password@host/dbname?sslmode=require`).
3. Note this down for the environment variables step.

## 3. Environment Variables
In your Vercel Project Settings > Environment Variables, add the following:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `DATABASE_URL` | Your Postgres connection string | `postgres://...` |
| `NEXT_PUBLIC_BASE_URL` | The URL of your deployment | `https://onerail.vercel.app` |

*Note: Ensure your `DATABASE_URL` includes `?sslmode=require` if using Neon or Supabase.*

## 4. Build Configuration
Vercel's default Next.js build settings work out of the box. However, ensure your `package.json` handles Prisma correctly during the build process.

Modify your `build` script in `package.json` to ensure the Prisma client is generated:
```json
"scripts": {
  "build": "prisma generate && next build"
}
```

## 5. Deployment Steps
1. Push your code to a GitHub repository.
2. In Vercel, click **New Project** and import your repository.
3. Select **Next.js** as the Framework Preset.
4. Configure the Environment Variables mentioned in Step 3.
5. Click **Deploy**.

## 6. Running Data Scripts
The scripts in `scripts/` (like `generate_sections.ts`) are **not** meant to be run during the Vercel build process. They often take a long time and require a direct database connection.

To run them against your production database:
1. Copy your production `DATABASE_URL` to a local `.env` file.
2. Run the script locally:
   ```bash
   npx tsx scripts/generate_sections.ts
   ```
*Warning: Running large data imports against a cloud database from your local machine may be slow depending on your internet connection.*

## 7. Vercel Hobby Plan Limitations
- **Serverless Function Timeout**: Default is **10 seconds**. If your API routes take longer, you may see 504 errors. Optimize your Prisma queries or use caching.
- **Edge Runtime**: If you need faster execution, consider using the [Edge Runtime](https://nextjs.org/docs/app/building-your-application/rendering/edge-and-nodejs-runtimes) for specific API routes.
- **Cold Starts**: Serverless functions may have a slight delay on the first request after being idle.

## 8. Troubleshooting
- **Prisma Engine Errors**: If you see "Prisma Client could not find the library", ensure you have `prisma generate` in your build command.
- **Database Connection**: Ensure your database allows connections from Vercel's IP ranges (usually achieved by enabling "Allow all IP addresses" in your DB provider's settings or using a connection pooler like PgBouncer).
