import sys
import json
import requests
from bs4 import BeautifulSoup
from pathlib import Path

# Setup paths
TMP_DIR = Path(".tmp")
HTML_DIR = TMP_DIR / "raw" / "html"
HTML_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

def fetch_and_parse_train(train_number: str):
    print(f"Fetching train {train_number}...")
    
    # 1. Fetch HTML
    # IndiaRailInfo typically maps /train/{number} to the train's main schedule page
    url = f"https://indiarailinfo.com/train/{train_number}"
    resp = requests.get(url, headers=HEADERS)
    
    if resp.status_code != 200:
        print(f"Failed to fetch {url} - HTTP {resp.status_code}")
        return
        
    html_path = HTML_DIR / f"train_{train_number}.html"
    html_path.write_text(resp.text, encoding="utf-8")
    print(f"Saved HTML to {html_path}")
    
    # 2. Parse basic metadata
    soup = BeautifulSoup(resp.text, "lxml")
    
    # Extracting the Train Name and Number from the H1 or title
    title = soup.title.text if soup.title else ""
    h1 = soup.find("h1")
    h1_text = h1.text.strip() if h1 else ""
    
    print("\n--- Extracted Data ---")
    print(f"Page Title: {title}")
    print(f"H1 Element: {h1_text}")
    
    # Attempting to find the schedule table
    # Usually it's a table with class 'table' or having 'Station Name' in headers
    tables = soup.find_all("table")
    schedule_table = None
    for tbl in tables:
        if "Station Name" in tbl.text or "Arr" in tbl.text or "Dep" in tbl.text:
            schedule_table = tbl
            break
            
    if schedule_table:
        rows = schedule_table.find_all("tr")
        print(f"\nFound Schedule Table with {len(rows)} rows.")
        # Print the first few rows to see the structure
        for i, row in enumerate(rows[:5]):
            cols = [c.text.strip() for c in row.find_all(["td", "th"])]
            print(f"Row {i}: {cols}")
    else:
        print("\nCould not identify Schedule Table.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scrape_single_train.py <train_number>")
        sys.exit(1)
    fetch_and_parse_train(sys.argv[1])
