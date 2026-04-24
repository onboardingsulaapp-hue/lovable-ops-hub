import { getCsvHeaderOffset } from './api/_utils/csv-helper.js';
import fs from 'fs';
import path from 'path';

async function test() {
    const buffer = fs.readFileSync('test.csv');
    const offset = await getCsvHeaderOffset(buffer);
    console.log(`Offset detected: ${offset}`);
}

test();
