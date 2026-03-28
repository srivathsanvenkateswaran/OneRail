# Tool Architecture: `scrape_all_trains.mjs`

## Executive Summary
`scrape_all_trains.mjs` is an aggressive, highly parallelized web scraper designed to crawl legacy rail portals (such as IndiaRailInfo). It circumvents modern API limitations by loading entire HTML DOM blocks, searching them using `cheerio` (a jQuery-like implementation), and archiving the raw, unstructured "Bronze-level" intelligence for offline processing. 

*(For a comprehensive review of the entire ingestion timeline using this tool, see the [IRI ETL Pipeline Guide](./iri_etl_pipeline.md).)*

## Architecture & Logic Flow

**Logic Flow:**
1.  **Parameter Passing:** Evaluates CLI arguments (`startId`, `endId`, `batchSize`) to create constrained integer bounds. 
2.  **Concurrency Generation:** Splits the bounds into arrays sized by `batchSize`. Each subset array is processed via `Promise.all()` to fire off concurrent HTTP connection headers mimicking standard Chrome browsers.
3.  **Local State Verification:** Checks `.tmp/raw/trains_by_id/{id}.json`. If the JSON object exists locally (meaning a previous run pulled it), it completely aborts the network request saving time and bandwidth.
4.  **DOM Node Extraction:** 
    * Passes the successful fetch to `cheerio.load(html)`.
    * Utilizes highly specific CSS selectors (e.g., `$('div:contains("Bedroll/Linen")')`, or `$('.rake > div')`) to isolate individual UI panels representing Train Types, Speeds, or Rake composition sequences.
5.  **Stop Sequencing Check:** Iterates over the CSS class `.newschtable.newbg.inline` row block, mapping `div` contents (Arrival Times, Platforms, Kilometers) into an unstructured `stops[]` array.
6.  **Persistence:** Saves the raw scrape result to `.tmp/raw`.

## Edge Cases Guarded

| Scenario | Handled By | Outcome |
| :--- | :--- | :--- |
| **Server Timeout / HTTP 503** | AbortSignal (15s limit) | Promotes to Retry Array up to 3 times before abandoning block locally as a failure. |
| **"Page Not Found" / Deprecated** | H1 / title checking | Gracefully creates a `{exists: false}` JSON so future audits do not re-scrape it forever. |
| **Imaginary Network Data** | String matching | Marks `{is_imaginary: true}` internally so downstream DB operators can drop it without crashing logic. |
| **Rate Limit / DDOS Ban** | `setTimeout(1000)` | Enforces strict, unskippable Politeness Delays between `batchSize` Promise groupings. |
