import { createReadStream } from 'fs';
import OsmPbfParser from 'osm-pbf-parser';
import path from 'path';

const pbfPath = path.join(process.cwd(), '..', 'india-260326.osm.pbf');

async function checkStations() {
  const stream = createReadStream(pbfPath);
  const parser = new OsmPbfParser();
  let stationCount = 0;
  let refCount = 0;
  
  stream.pipe(parser);
  
  parser.on('data', (items: any[]) => {
    for (const item of items) {
      if (item.type === 'node' && (item.tags?.railway === 'station' || item.tags?.railway === 'halt')) {
        stationCount++;
        if (item.tags.ref) {
          refCount++;
          if (refCount <= 10) {
            console.log('Sample station:', item.tags.ref, item.tags.name, [item.lon, item.lat]);
          }
        }
      }
    }
  });

  parser.on('end', () => {
    console.log(`\nTotal railway=station/halt nodes: ${stationCount}`);
    console.log(`Total with 'ref' tag: ${refCount}`);
  });
}

checkStations();
