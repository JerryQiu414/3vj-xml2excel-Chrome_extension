const fs = require('fs');

const materialData = fs.readFileSync('./config/material_data.json', 'utf-8').split('\n').filter(line => line.trim()).map(line => JSON.parse(line));

console.log('=== Testing material map build ===');
console.log('materialData length:', materialData.length);

const map = {};
for (const item of materialData) {
    if (item.part_number) {
        map[item.part_number] = item;
    }
}

console.log('map keys count:', Object.keys(map).length);

if (map['GRHH030000101']) {
    console.log('GRHH030000101 FOUND!');
    console.log('  part_number:', map['GRHH030000101'].part_number);
    console.log('  name:', map['GRHH030000101'].name);
    console.log('  usage_formula:', map['GRHH030000101'].usage_formula);
    console.log('  quote_unit:', map['GRHH030000101'].quote_unit);
} else {
    console.log('GRHH030000101 NOT FOUND!');
    console.log('Searching for GRHH0300001...');
    for (const key of Object.keys(map).filter(k => k.startsWith('GRHH030000'))) {
        console.log('  Found:', key);
    }
}