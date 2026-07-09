const fs = require('fs');

const xmlContent = fs.readFileSync('../MS9992600219KZ02-生产XML.xml', 'utf-8');
const bomRules = JSON.parse(fs.readFileSync('./config/bom_rules.json', 'utf-8'));

const materialData = fs.readFileSync('./config/material_data.json', 'utf-8')
    .split('\n').filter(line => line.trim()).map(line => JSON.parse(line));

console.log('========== 精确模拟GRHH030000101计算流程 ==========');

const materialMap = {};
for (const item of materialData) {
    if (item.part_number) {
        materialMap[item.part_number] = item;
    }
}

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

const rowData = {};
for (let i = 0; i < targetMetal.attributes.length; i++) {
    const attr = targetMetal.attributes[i];
    rowData[attr.name] = attr.value;
}

const metalMappings = bomRules.field_mappings.Metal;
const originalPartNumber = rowData[metalMappings.partNumber];
const rawQty = rowData[metalMappings.qty];
const rawLength = rowData[metalMappings.length];
const rawWidth = rowData[metalMappings.width];
const rawThickness = rowData[metalMappings.thickness];

const qty = parseInt(rawQty) || 1;
const length = parseFloat(rawLength) || 0;
const width = parseFloat(rawWidth) || 0;
const thickness = parseFloat(rawThickness) || 0;

const matchKey = originalPartNumber;
const materialInfo = materialMap[matchKey];

console.log(`\n关键数据:
  matchKey: ${matchKey}
  materialInfo存在: ${!!materialInfo}
  usage_formula: ${materialInfo?.usage_formula}
  qty: ${qty}
  length: ${length}
  width: ${width}`);

if (!materialInfo) {
    console.log('ERROR: 未找到物料信息');
    process.exit(1);
}

console.log('\n========== 模拟 _evaluateFormula ==========');

const formula = materialInfo.usage_formula;
const sets = bomRules.sets || 1;

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

console.log(`公式: ${formula}`);
console.log(`变量: ${JSON.stringify(vars)}`);

let cleaned = formula.replace(/\{([^}]+)\}/g, (_, expr) => {
    const keys = Object.keys(vars).sort((a, b) => b.length - a.length);
    let replaced = expr;
    console.log(`  提取表达式: ${expr}`);
    console.log(`  初始替换值: ${replaced}`);
    
    for (const key of keys) {
        const regex = new RegExp(`\\b${key}\\b`, 'g');
        const before = replaced;
        replaced = replaced.replace(regex, vars[key]);
        if (before !== replaced) {
            console.log(`  替换 ${key}=${vars[key]}: ${before} -> ${replaced}`);
        }
    }
    const result = `(${replaced})`;
    console.log(`  最终结果: ${result}`);
    return result;
});

console.log(`替换后公式: ${cleaned}`);

console.log('\n========== 模拟 _safeEval ==========');

function safeEval(expr, vars) {
    const allowedOps = ['+', '-', '*', '/', '%', '(', ')', '.', ',', '>', '<', '=', '!'];
    const sanitized = expr.split('').filter(c => {
        return /[a-zA-Z0-9]/.test(c) || allowedOps.includes(c);
    }).join('');
    
    console.log(`原始表达式: ${expr}`);
    console.log(`清理后表达式: ${sanitized}`);
    
    try {
        const fn = new (Function.prototype.bind.apply(Function, [null, ...Object.keys(vars), `return ${sanitized};`]))();
        const result = fn(...Object.values(vars));
        console.log(`计算结果: ${result}`);
        return result;
    } catch (e) {
        console.log(`计算失败: ${e.message}`);
        return null;
    }
}

const evalResult = safeEval(cleaned, vars);
console.log(`\n最终用量: ${evalResult}`);
if (evalResult !== null) {
    console.log(`向上取整两位小数: ${Math.ceil(evalResult * 100) / 100}`);
}

console.log('\n========== 测试结束 ==========');