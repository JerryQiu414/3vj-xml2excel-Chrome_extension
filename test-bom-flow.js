const fs = require('fs');

const xmlContent = fs.readFileSync('../MS9992600219KZ02-生产XML.xml', 'utf-8');
const bomRules = JSON.parse(fs.readFileSync('./config/bom_rules.json', 'utf-8'));

const materialDataRaw = fs.readFileSync('./config/material_data.json', 'utf-8');
const materialLines = materialDataRaw.trim().split('\n');
const materialData = materialLines.map(line => JSON.parse(line));

console.log('========== 完整BOM转换流程测试 ==========');

console.log('\n1. 加载物料数据:');
console.log(`   materialData长度: ${materialData.length}`);
console.log(`   GRHH030000101在物料数据中: ${materialData.some(item => item.part_number === 'GRHH030000101')}`);

const materialMap = {};
for (const item of materialData) {
    if (item.part_number) {
        materialMap[item.part_number] = item;
    }
}

console.log(`   materialMap键数量: ${Object.keys(materialMap).length}`);
console.log(`   GRHH030000101在materialMap中: ${!!materialMap['GRHH030000101']}`);
if (materialMap['GRHH030000101']) {
    console.log(`   GRHH030000101.usage_formula: ${materialMap['GRHH030000101'].usage_formula}`);
}

console.log('\n2. 解析XML - 查找Metal元素:');
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
    console.log('ERROR: 未找到GRHH030000101');
    process.exit(1);
}

console.log('   找到GRHH030000101元素');

const rowData = {};
for (let i = 0; i < targetMetal.attributes.length; i++) {
    const attr = targetMetal.attributes[i];
    rowData[attr.name] = attr.value;
}

console.log(`   rowData.length: ${rowData.length}`);
console.log(`   rowData.PartNumber: ${rowData.PartNumber}`);
console.log(`   rowData.Num: ${rowData.Num}`);

console.log('\n3. 模拟BOM转换 - 字段提取:');
const metalMappings = bomRules.field_mappings.Metal;

const originalPartNumber = rowData[metalMappings.partNumber];
const rawQty = rowData[metalMappings.qty];
const rawLength = rowData[metalMappings.length];
const rawWidth = rowData[metalMappings.width];

const qty = parseInt(rawQty) || 1;
const length = parseFloat(rawLength) || 0;
const width = parseFloat(rawWidth) || 0;

console.log(`   originalPartNumber: ${originalPartNumber}`);
console.log(`   qty: ${qty}`);
console.log(`   length: ${length}`);
console.log(`   width: ${width}`);

console.log('\n4. 模拟BOM转换 - 物料匹配:');
const matchKey = originalPartNumber;
const materialInfo = materialMap[matchKey];

console.log(`   matchKey: ${matchKey}`);
console.log(`   materialInfo存在: ${!!materialInfo}`);

if (materialInfo) {
    console.log(`   usage_formula: ${materialInfo.usage_formula}`);
    console.log(`   quote_unit: ${materialInfo.quote_unit}`);
    
    console.log('\n5. 模拟BOM转换 - 公式计算:');
    const sets = bomRules.sets || 1;
    
    const vars = {
        rowType: 'Metal',
        totalQty: qty,
        length: length,
        width: width,
        sets: sets,
        totalLength: length * qty,
        totalArea: (length * width / 1000000) * qty
    };
    
    let formula = materialInfo.usage_formula;
    console.log(`   原始公式: ${formula}`);
    
    const keys = Object.keys(vars).sort((a, b) => b.length - a.length);
    let replaced = formula.replace(/\{([^}]+)\}/g, (_, expr) => {
        let innerReplaced = expr;
        for (const key of keys) {
            const regex = new RegExp(`\\b${key}\\b`, 'g');
            innerReplaced = innerReplaced.replace(regex, vars[key]);
        }
        return `(${innerReplaced})`;
    });
    
    console.log(`   替换后公式: ${replaced}`);
    
    try {
        const result = eval(replaced);
        console.log(`   计算结果: ${result}`);
        const finalUsage = Math.ceil(result * 100) / 100;
        console.log(`   最终用量: ${finalUsage}`);
        console.log(`   报价单位: ${materialInfo.quote_unit}`);
    } catch (e) {
        console.log(`   公式计算失败: ${e.message}`);
        console.log(`   回退到默认值: ${qty * sets}`);
    }
} else {
    console.log('\n5. 物料未找到 - 使用默认计算:');
    const sets = bomRules.sets || 1;
    const defaultUsage = qty * sets;
    console.log(`   默认用量 (qty * sets): ${qty} * ${sets} = ${defaultUsage}`);
}

console.log('\n========== 测试结束 ==========');