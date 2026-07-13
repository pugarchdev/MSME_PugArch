import fs from 'fs';
import path from 'path';

const filePath = 'c:/Pugarch/jsgSMILE/MSME_PugArch/backend/src/routes/phase4.routes.ts';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('assertTenderAccess')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
