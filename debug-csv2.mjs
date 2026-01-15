import * as fs from 'fs';

const content = fs.readFileSync('/home/ubuntu/upload/8061584_1.csv', 'utf-8');
const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
const separator = ';';

// Find header
const headerPatterns = ["data do evento", "codigo do procedimento", "descrição do procedimento", "quantidade", "valor"];
let headerIndex = -1;

for (let i = 0; i < Math.min(10, lines.length); i++) {
  const lowerLine = lines[i].toLowerCase();
  const matchCount = headerPatterns.filter(p => lowerLine.includes(p)).length;
  console.log(`Line ${i}: matchCount = ${matchCount}`);
  if (matchCount >= 2) {
    headerIndex = i;
    break;
  }
}

console.log('Header index:', headerIndex);

if (headerIndex !== -1) {
  // Check for hierarchical
  const testLines = lines.slice(headerIndex + 1, headerIndex + 10);
  console.log('Test lines for hierarchical:');
  testLines.forEach((line, i) => {
    const vals = line.split(separator);
    const hasDate = vals[0]?.match(/\d{2}\/\d{2}\/\d{4}/);
    const hasCode = vals[2]?.match(/^\d{5,}$/);
    console.log(`  ${i}: date=${!!hasDate}, code=${!!hasCode}, vals[0]="${vals[0]?.substring(0,20)}", vals[2]="${vals[2]?.substring(0,20)}"`);
  });
}
