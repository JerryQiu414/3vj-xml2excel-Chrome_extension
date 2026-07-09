const fs = require('fs');

const materialDataRaw = fs.readFileSync('./config/material_data.json', 'utf-8');
console.log('========== 测试配置文件加载流程 ==========');

console.log('\n1. 原始文件内容:');
console.log(`   文件长度: ${materialDataRaw.length}`);
console.log(`   前200字符: ${materialDataRaw.substring(0, 200)}`);
console.log(`   后200字符: ${materialDataRaw.substring(materialDataRaw.length - 200)}`);

console.log('\n2. 模拟构建过程 - Base64编码:');
const encoded = Buffer.from(materialDataRaw).toString('base64');
console.log(`   Base64编码长度: ${encoded.length}`);
console.log(`   前100字符: ${encoded.substring(0, 100)}`);

console.log('\n3. 模拟popup.js中的解码过程:');
const b = Buffer.from(encoded, 'base64').toString('binary');
const u = new Uint8Array(b.length);
for (let i = 0; i < b.length; i++) {
    u[i] = b.charCodeAt(i);
}
const decoded = new TextDecoder().decode(u);
console.log(`   解码后长度: ${decoded.length}`);
console.log(`   前200字符: ${decoded.substring(0, 200)}`);

console.log('\n4. 模拟popup.js中的解析过程:');
try {
    const materialLines = decoded.trim().split('\n');
    console.log(`   行数: ${materialLines.length}`);
    
    const materialData = materialLines.map(line => JSON.parse(line));
    console.log(`   解析后的物料数据长度: ${materialData.length}`);
    
    console.log(`   GRHH030000101存在: ${materialData.some(item => item.part_number === 'GRHH030000101')}`);
    
    const grhhItem = materialData.find(item => item.part_number === 'GRHH030000101');
    if (grhhItem) {
        console.log(`   GRHH030000101.usage_formula: ${grhhItem.usage_formula}`);
        console.log(`   GRHH030000101.quote_unit: ${grhhItem.quote_unit}`);
    }
    
    console.log('\n✅ 配置文件加载流程测试通过!');
} catch (e) {
    console.log(`❌ 配置文件加载流程测试失败: ${e.message}`);
    console.log(`   错误发生在第 ${e.lineNumber} 行`);
}

console.log('\n========== 测试结束 ==========');