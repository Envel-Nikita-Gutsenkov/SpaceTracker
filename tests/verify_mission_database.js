import { resolveSatelliteInfo, MISSION_DATABASE } from '../src/utils/missionDatabase.js';

console.log('--- TESTING MISSION DATABASE RESOLUTION ---');

const testCases = [
  { id: 35491, noradId: 35491, name: 'LRO (Lunar Reconnaissance Orbiter)', category: 'science', agency: 'NASA' },
  { id: 44441, noradId: 44441, name: 'Chandrayaan-2 Orbiter', category: 'science', agency: 'ISRO' },
  { id: 53323, noradId: 53323, name: 'Danuri (KPLO)', category: 'science', agency: 'KARI' },
  { id: 52914, noradId: 52914, name: 'CAPSTONE (Near Rectilinear Halo Orbit)', category: 'science', agency: 'NASA' },
  { id: 25544, noradId: 25544, name: 'ISS (ZARYA)', category: 'iss' },
  { id: 20580, noradId: 20580, name: 'HST', category: 'science' },
  { id: 48800, noradId: 48800, name: 'STARLINK-2401', category: 'starlink' },
  { id: 41234, noradId: 41234, name: 'NAVSTAR 75 (USA 258)', category: 'gps' },
  { id: 43012, noradId: 43012, name: 'GSAT0219 (GALILEO 23)', category: 'galileo' },
  { id: 39155, noradId: 39155, name: 'COSMOS 2485', category: 'glonass' },
  { id: 99999, noradId: 99999, name: 'RANDOM DEBRIS SAT 123', category: 'other' }
];

let failed = 0;

for (const tc of testCases) {
  const res = resolveSatelliteInfo(tc);
  console.log(`[TEST] ${tc.name}:`);
  console.log(`       Official URL: ${res?.officialUrl || 'None (only wiki/radar)'}`);
  console.log(`       Source Name:  ${res?.sourceName || 'None'}`);
  console.log(`       Wiki Title:   ${res?.wikiTitle || 'None'}`);
  
  if (tc.id === 35491) {
    if (!res.officialUrl.includes('nasa.gov')) {
      console.error('FAIL: LRO must have NASA official URL!');
      failed++;
    }
    if (res.wikiTitle.includes('International Space Station')) {
      console.error('FAIL: LRO must NOT resolve to ISS!');
      failed++;
    }
  }
  if (tc.id === 25544) {
    if (!res.officialUrl.includes('nasa.gov')) {
      console.error('FAIL: ISS must have NASA official URL!');
      failed++;
    }
  }
}

if (failed > 0) {
  console.error(`FAILED: ${failed} tests failed`);
  process.exit(1);
} else {
  console.log('SUCCESS: All mission database resolution tests passed!');
}
