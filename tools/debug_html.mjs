import fs from 'fs';
import * as cheerio from 'cheerio';

function extract(id) {
    const html = fs.readFileSync(`.tmp/raw/${id}.html`, 'utf-8');
    const $ = cheerio.load(html);

    console.log(`\n--- Train ${id} ---`);

    // Let's print out the exact text content of the div that contains "Pantry/Catering"
    const pantryDiv = $('div:contains("Pantry/Catering")').last();
    console.log('Pantry/Catering Div:', pantryDiv.text().replace(/\s+/g, ' '));
    // The pantry section usually has spans or sub-divs. Let's look at its parent or siblings.

    // Let's print out the exact text for "Inaugural Run" or "First Run"
    const inauguralDiv = $('div:contains("Inaugural Run")').last();
    console.log('Inaugural Run Div:', inauguralDiv.text().replace(/\s+/g, ' '));

    const firstRunDiv = $('div:contains("First Run")').last();
    console.log('First Run Div:', firstRunDiv.text().replace(/\s+/g, ' '));

    // Let's print out "Max Permissible Speed"
    const maxSpeedDiv = $('div:contains("Max Permissible Speed")').last();
    console.log('Max Speed Div:', maxSpeedDiv.text().replace(/\s+/g, ' '));
}

extract(1611); // Tamil Nadu
extract(851);  // Janta
