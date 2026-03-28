# Tool Architecture: `silver_transform.mjs`

## Executive Summary
This script acts as the crucial "Data Washer" bridging the gap between raw, messy external internet DOM output (Bronze Level) and the strict structural database models needed by Prisma (Gold Level). Its sole job is executing math transformations and Regex linguistic sanitation entirely offline inside the `.tmp/` arrays.

## Architecture & Logic Flow

It operates in a fast synchronous `fs.readdirSync()` loop over the previously downloaded `.tmp/raw` folder.

**Logic Flow:**
1. **Target Evaluation:** Reads the unstructured `.json`. If `{exists: false}`, it skips it entirely.
2. **Text Sanitation (`parseTitle`)**: 
   - External platforms commonly merge Indian names, regional codes, and English variations into massive text headers for UI reasons (e.g., `12941/Parasnath Express (PT)पारसनाथ...`).
   - Using RegEx (`/[\u0900-\u097F].*/u`), it locates the first Devanagari Hindi dialect character and violently strips everything trailing it to isolate the English alphanumeric nomenclature.
3. **Time Normalization (`toMins`)**:
   - The UI shows "23:45" or "-".
   - Using basic modulus mathematics, the `Silver` transformer converts local clock strings into distinct integers representing `Minutes From Midnight` (e.g., 23:45 = 1425). 
   - *Why?* Because querying PostgreSQL integers for "Does Train A cross node before Train B across midnight borders?" is drastically faster than attempting complex POSIX timestamp string comparisons on the fly.
4. **Logic Integrity Matrix Check**:
   - The script enforces a sequence validation. It checks `km = parseFloat(stop.km)`. If KM progress goes *downwards* between sequential stops (indicating a corrupted DOM table), it tags the payload with a matrix flag `sequenceError: true` so the Next.js database importer can intelligently reject it.

## Transformation Highlights

* **Rake Mapping Correction:** Legacy platforms sometimes map "Economy AC" coaches (M1, M2) identically to "Chair Cars" (CC). The transformer forcefully overrides this tag, mapping them appropriately to `3e` classes.
* **Orphan Elimination:** The tool strips undefined variables and returns a flattened, strictly formatted standard interface guaranteeing that downstream `.map()` processes will not throw unexpected `null reference` faults.
