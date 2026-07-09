const fs = require('fs');

const content = fs.readFileSync('config/material_data.json', 'utf8');
const encoded = Buffer.from(content).toString('base64');
const decoded = Buffer.from(encoded, 'base64').toString('utf8');

console.log('Original first 500 chars:');
console.log(content.substring(0, 500));
console.log('\nDecoded first 500 chars:');
console.log(decoded.substring(0, 500));
console.log('\nMatch:', content === decoded);

const lines = decoded.trim().split('\n');
console.log('\nNumber of lines:', lines.length);
if (lines.length > 0) {
    try {
        const first = JSON.parse(lines[0]);
        console.log('First line parsed:', JSON.stringify(first).substring(0, 100));
    } catch (e) {
        console.log('Parse error:', e.message);
    }
}