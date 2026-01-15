import * as fs from 'fs';

const content = fs.readFileSync('/home/ubuntu/upload/8061584_1.csv', 'utf-8');
const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);

console.log('Total lines:', lines.length);
console.log('First 15 lines:');
lines.slice(0, 15).forEach((line, i) => {
  const values = line.split(';');
  console.log(`Line ${i}: [${values.length} cols]`, values.slice(0, 6).map(v => v.substring(0, 30)));
});
