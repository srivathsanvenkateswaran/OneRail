import fs from 'fs';
import path from 'path';

const dir = path.resolve('.tmp/silver/trains');
const files = fs.readdirSync(dir);
const types = new Set();

for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
    if (data.rake_composition) {
        for (const obj of data.rake_composition) {
            types.add(obj.type);
        }
    }
}

console.log(Array.from(types));
