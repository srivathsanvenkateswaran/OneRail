import sys
import json
import time
from bs4 import BeautifulSoup
from pathlib import Path
from playwright.sync_api import sync_playwright

TMP_DIR = Path(".tmp")
HTML_DIR = TMP_DIR / "raw" / "html"
HTML_DIR.mkdir(parents=True, exist_ok=True)
TRAINS_DIR = TMP_DIR / "raw" / "trains"
TRAINS_DIR.mkdir(parents=True, exist_ok=True)

def find_train_url(page, train_number):
    """Uses DuckDuckGo Dorking via Playwright to find the IndiaRailInfo URL for a train."""
    search_query = f"{train_number} site:indiarailinfo.com/train/"
    print(f"Searching DDG for: {search_query}")
    page.goto("https://duckduckgo.com", timeout=60000)
    page.wait_for_selector('input[name="q"]', timeout=15000)
    page.fill('input[name="q"]', search_query)
    page.keyboard.press("Enter")
    
    # Wait for search results
    page.wait_for_selector('a[data-testid="result-title-a"]', timeout=15000)
    
    # Extract links
    links = page.query_selector_all('a[data-testid="result-title-a"]')
    for link in links:
        href = link.get_attribute("href")
        if href and "indiarailinfo.com/train/" in href and "-train-" in href:
            return href
    return None

def fetch_and_parse_train(train_number: str):
    print(f"Starting browser to scrape train {train_number}...")
    
    with sync_playwright() as p:
        # Launching with headless=True. 
        # IndiaRailInfo sometimes flags bots, we can set headless=False if blocked.
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36")
        page = context.new_page()
        
        url = find_train_url(page, train_number)
        if not url:
            print(f"FAILED: Could not find an IndiaRailInfo URL for train {train_number} via Google.")
            browser.close()
            return

        print(f"FOUND URL: {url}")
        
        # Navigate to IndiaRailInfo URL
        print("Scraping IndiaRailInfo page...")
        page.goto(url, timeout=60000)
        
        # Optionally, wait for the schedule table to load
        # IndiaRailInfo is mostly server-rendered, so wait for <tbody>
        try:
            page.wait_for_selector("table", timeout=10000)
        except Exception:
            pass # fallback to full text
            
        html_content = page.content()
        html_path = HTML_DIR / f"train_{train_number}.html"
        html_path.write_text(html_content, encoding="utf-8")
        
        browser.close()
        
    print(f"SAVED HTML to {html_path}")
    
    # Parse HTML using BeautifulSoup
    soup = BeautifulSoup(html_content, "lxml")
    
    # Train Name/Number
    h1 = soup.find("h1")
    train_title = h1.text.strip() if h1 else ""
    
    # Look for Schedule Table
    tables = soup.find_all("table")
    schedule_table = None
    for tbl in tables:
        if "Station Name" in tbl.text or "Arr" in tbl.text or "Dep" in tbl.text or "Day" in tbl.text:
            schedule_table = tbl
            # Let's check headers
            headers = [th.text.strip() for th in tbl.find_all("th")]
            if headers:
                # Good candidate
                break

    if not schedule_table:
        print("FAILED: Could not identify Schedule Table in the HTML.")
        return
        
    rows = schedule_table.find_all("tr")
    
    print("\n" + "="*50)
    print(f"TRAIN: {train_title}")
    print("="*50)
    print(f"Found Schedule with {len(rows)-1} total rows.")
    
    # Dump the first few meaningful schedule rows
    for i, row in enumerate(rows[:6]):
        cols = [c.text.strip() for c in row.find_all(["td", "th"])]
        # Filter empty strings in lists to keep output clean
        clean_cols = [c for c in cols if c]
        if clean_cols:
            print(f"[{i}] {clean_cols}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scrape_train_playwright.py <train_number>")
        sys.exit(1)
    fetch_and_parse_train(sys.argv[1])
