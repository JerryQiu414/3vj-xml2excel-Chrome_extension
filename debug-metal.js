const fs = require('fs');

const xmlContent = fs.readFileSync('../MS9992600219KZ02-生产XML.xml', 'utf-8');
const bomRules = JSON.parse(fs.readFileSync('./config/bom_rules.json', 'utf-8'));

const materialData = fs.readFileSync('./config/material_data.json', 'utf-8')
    .split('\n').filter(line => line.trim()).map(line => JSON.parse(line));

console.log('========== 测试GRHH030000101计算流程 ==========');

const materialMap = {};
for (const item of materialData) {
    if (item.part_number) {
        materialMap[item.part_number] = item;
    }
}

console.log('\n1. 物料映射检查:');
console.log(`GRHH030000101 在materialMap中: ${!!materialMap['GRHH030000101']}`);
if (materialMap['GRHH030000101']) {
    console.log(`  usage_formula: ${materialMap['GRHH030000101'].usage_formula}`);
    console.log(`  quote_unit: ${materialMap['GRHH030000101'].quote_unit}`);
    console.log(`  min_usage: ${materialMap['GRHH030000101'].min_usage}`);
}

console.log('\n2. XML解析检查 - 查找Metal元素:');
const parser = new (require('xmldom').DOMParser)();
const doc = parser.parseFromString(xmlContent, 'application/xml');
const metalElements = doc.getElementsByTagName('Metal');

let targetMetal = null;
for (let i = 0; i < metalElements.length; i++) {
    const elem = metalElements[i];
    const partNumber = elem.getAttribute('PartNumber');
    if (partNumber === 'GRHH030000101') {
        targetMetal = elem;
        break;
    }
}

if (!targetMetal) {
    console.log('ERROR: 未找到GRHH030000101的Metal元素');
    process.exit(1);
}

console.log('找到GRHH030000101元素');
console.log(`  Name: ${targetMetal.getAttribute('Name')}`);
console.log(`  PartNumber: ${targetMetal.getAttribute('PartNumber')}`);
console.log(`  Num: ${targetMetal.getAttribute('Num')}`);
console.log(`  length: ${targetMetal.getAttribute('length')}`);
console.log(`  width: ${targetMetal.getAttribute('width')}`);
console.log(`  height: ${targetMetal.getAttribute('height')}`);

console.log('\n3. 字段映射检查:');
const metalMappings = bomRules.field_mappings.Metal;
console.log(`partNumber映射: ${metalMappings.partNumber}`);
console.log(`length映射: ${metalMappings.length}`);
console.log(`width映射: ${metalMappings.width}`);
console.log(`qty映射: ${metalMappings.qty}`);
console.log(`metalMatchKey映射: ${metalMappings.materialMatchKey || '未配置'}`);

console.log('\n4. 模拟BOM转换流程:');

const rowData = {};
for (let i = 0; i < targetMetal.attributes.length; i++) {
    const attr = targetMetal.attributes[i];
    rowData[attr.name] = attr.value;
}

console.log(`rowData keys: ${Object.keys(rowData).slice(0, 15).join(', ')}`);
console.log(`rowData.length: ${rowData.length}`);
console.log(`rowData.width: ${rowData.width}`);
console.log(`rowData.Num: ${rowData.Num}`);

const originalPartNumber = rowData[metalMappings.partNumber];
const basicMaterialMCode = rowData['BasicMaterialMCode'] || rowData['BasicMaterialCode'];
const rawQty = rowData[metalMappings.qty];
const rawLength = rowData[metalMappings.length];

console.log(`\noriginalPartNumber: ${originalPartNumber}`);
console.log(`basicMaterialMCode (materialMatchKey): ${basicMaterialMCode}`);
console.log(`rawQty: ${rawQty}, parsed: ${parseInt(rawQty)}`);
console.log(`rawLength: ${rawLength}, parsed: ${parseFloat(rawLength)}`);

let matchKey = basicMaterialMCode || originalPartNumber;
console.log(`\nmatchKey: ${matchKey}`);

const materialInfo = materialMap[matchKey];
console.log(`materialInfo找到: ${!!materialInfo}`);

if (materialInfo) {
    console.log(`\n5. 公式计算: ${materialInfo.usage_formula}`);
    
    const sets = bomRules.sets || 1;
    const qty = parseInt(rawQty) || 1;
    const length = parseFloat(rawLength) || 0;
    const width = parseFloat(rowData[metalMappings.width]) || 0;
    const thickness = parseFloat(rowData[metalMappings.thickness]) || 0;
    
    const vars = {
        rowType: 'Metal',
        totalQty: qty,
        length: length,
        width: width,
        thickness: thickness,
        sets: sets,
        totalLength: length * qty,
        totalArea: (length * width / 1000000) * qty
    };
    
    console.log(`变量: ${JSON.stringify(vars, null, 2)}`);
    
    let formula = materialInfo.usage_formula;
    console.log(`原始公式: ${formula}`);
    
    const keys = Object.keys(vars).sort((a, b) => b.length - a.length);
    let replaced = formula;
    
    for (const key of keys) {
        const regex = new RegExp(`\\b${key}\\b`, 'g');
        const before = replaced;
        replaced = replaced.replace(regex, vars[key]);
        if (before !== replaced) {
            console.log(`  替换 ${key}=${vars[key]}: ${before} -> ${replaced}`);
        }
    }
    
    console.log(`替换后公式: ${replaced}`);
    
    try {
        const result = eval(replaced);
        console.log(`计算结果: ${result}`);
        console.log(`向上取整两位小数: ${Math.ceil(result * 100) / 100}`);
    } catch (e) {
        console.log(`公式计算失败: ${e.message}`);
    }
} else {
    console.log('\nERROR: 未找到物料信息!');
    console.log('回退到默认计算...');
    const sets = bomRules.sets || 1;
    const qty = parseInt(rawQty) || 1;
    const defaultUsage = qty * sets;
    console.log(`默认用量 (qty * sets): ${qty} * ${sets} = ${defaultUsage}`);
}

console.log('\n========== 测试结束 ==========');