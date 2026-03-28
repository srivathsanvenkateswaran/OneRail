# Tool Architecture: Auditing & Rescue System

## Executive Summary
When ingesting metadata for thousands of trains across vast legacy networks, intermittent HTTP failures, dropped headers, and cloud-provider traffic blocks are inevitable. Rather than constantly checking every ID and blowing up execution times, the Auditing suite acts as an offline validator. It checks the integrity of the data store, generating targeted retry manifests.

## 1. `audit_ids.mjs` (The Validating Architect)

**Purpose:** Scans the local `.tmp/raw` filing system against an expected maximum limit limit to compile an intelligence list of missing elements.

**Logic Flow:**
1. Loads the exact filenames in `.tmp/raw` into an instantly accessible `Set (fs.readdirSync)`.
2. Initiates a rigid integer loop `(startId to endId)`.
3. Checks if the `{id}.json` filename exists in the `Set`. 
    - If `false`, flags ID as `missing`.
4. If it does exist, it loads the JSON. 
    - It evaluates the interior flags. Is it a validated `exists=false`? Keep it logged as successful (meaning we checked and confirmed it legitimately doesn't exist). 
    - Is it a `503 Service Unavailable` JSON write error? Flag it as a `transientError`.
5. Outputs a strict `missing_ids.txt` text document with ascending failure vectors.

## 2. `scrape_missing.mjs` (The Rescue Team)

**Purpose:** Consumes the specific `missing_ids.txt` manifest outputted by the auditor and aggressively re-engages the network targets.

**Logic Flow:**
1. Reads `missing_ids.txt` natively, stripping blank lines and formatting integers.
2. Generates parallelized micro-batches based on the rescue array.
3. Fires an identical `fetch` and `cheerio` parsing sweep comparable to `scrape_all_trains.mjs`.
4. Executes an intentional hard-overwrite logic; if the network comes back `200 OK`, it violently overrides the previous transient failures cached in the `.tmp/raw` system permanently correcting that node.
5. Implements extreme exponential back-off on `failed` states. If a rescue run fails the first time, it enforces a 3,000ms halt on that thread to bypass temporary cloud-flare rate barriers before attempting one final extraction.

## Symbiotic Execution Pattern
They are intrinsically designed to operate back-to-back:

```bash
# Analyze holes in the 0 -> 25,000 range map
node tools/audit_ids.mjs 1 25000

# Aggressively patch the holes utilizing the generated .txt
node tools/scrape_missing.mjs
```
