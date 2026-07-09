const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');
const JSZip = require('jszip');

const srcDir = __dirname;
const distDir = path.join(__dirname, '../dist');
const watermark = '3VJ_XML2EXCEL_GOLDREIF_2024';

const jsFiles = [
    'popup.js',
    'sidepanel.js',
    'background.js',
    'js/xml-parser.js',
    'js/field-mapper.js',
    'js/fms-converter.js',
    'js/bom-converter.js',
    'js/excel-exporter.js',
    'js/plan-matcher.js',
    'js/route-matcher.js'
];

const configFiles = [
    'config/app_config.json',
    'config/bom_rules.json',
    'config/default_config.json',
    'config/field_mapping.json',
    'config/material_data.json',
    'config/process_routes.json',
    'config/production_plans.json',
    'config/scheme_rules.json',
    'config/scheme_rules_config.json',
    'config/supplier_mapping.json',
    'config/suppliers/SUP_ALUMINUM.json',
    'config/suppliers/SUP_HARDWARE.json',
    'config/suppliers/SUP_STONE.json'
];

const copyFiles = [
    'popup.html',
    'sidepanel.html',
    'manifest.json',
    'lib/jszip.min.js',
    'lib/xlsx.full.min.js',
    'icons/icon16.png',
    'icons/icon32.png',
    'icons/icon48.png',
    'icons/icon128.png'
];

function genVarName() {
    let name = Math.random().toString(36).substr(2, 9);
    if (/^\d/.test(name)) {
        name = '_' + name;
    }
    return name;
}

function embedWatermark(code) {
    const watermarkVar = `const ${genVarName()}="${watermark}";`;
    const watermarkCode = `
        function ${genVarName()}() {
            const w=[118,51,86,74,95,88,77,76,50,69,88,67,69,76,95,71,79,76,68,82,69,73,70,95,50,48,50,52];
            return String.fromCharCode(...w);
        }
    `;
    return watermarkVar + watermarkCode + code;
}

function xorEncode(str, key) {
    let result = [];
    for (let i = 0; i < str.length; i++) {
        result.push(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
}

function createXorDecoder(key) {
    const encodedKey = xorEncode(key, 'GOLDREIF');
    const decoder = `
        function ${genVarName()}(d,k){
            for(var r='',i=0;i<d.length;i++)r+=String.fromCharCode(d[i]^k.charCodeAt(i%k.length));
            return r;
        }
        var ${genVarName()}=[${encodedKey.join(',')}];
    `;
    return decoder;
}

function codeMutation(code) {
    code = code.replace(/===/g, '==');
    code = code.replace(/!==/g, '!=');
    code = code.replace(/\btrue\b/g, '!!1');
    code = code.replace(/\bfalse\b/g, '!!0');
    return code;
}

function addAntiDebug(code) {
    const antiDebug = `
        (function(){
            var ${genVarName()}=new Date();
            debugger;
            var ${genVarName()}=new Date();
            if(${genVarName()}-${genVarName()}>100){
                while(1);
            }
        })();
        (function(){
            var ${genVarName()}=Function.prototype.toString.call(Function);
            if(${genVarName()}.indexOf('native code')===-1){
                while(1);
            }
        })();
        (function(){
            if(window.outerWidth===0||window.outerHeight===0){
                while(1);
            }
        })();
    `;
    return antiDebug + code;
}

function buildConfigCode() {
    const entries = [];
    configFiles.forEach(file => {
        const content = fs.readFileSync(file, 'utf8');
        const encoded = Buffer.from(content).toString('base64');
        entries.push(`"${file}":"${encoded}"`);
    });
    
    return `
        window.__CFG_DATA__={${entries.join(',')}};
        window.__LOAD_CFG__=function(f){
            const b=atob(window.__CFG_DATA__[f]);
            const u=new Uint8Array(b.length);
            for(let i=0;i<b.length;i++) u[i]=b.charCodeAt(i);
            return JSON.parse(new TextDecoder().decode(u));
        };
    `;
}

function obfuscateNone(code) {
    return code;
}

function obfuscateLight(code) {
    return JavaScriptObfuscator.obfuscate(code, {
        compact: true,
        simplify: true,
        stringArray: false,
        deadCodeInjection: false,
        log: false,
        reservedNames: ['__CFG_DATA__', '__LOAD_CFG__', '__MATERIAL_DATA__'],
        reservedStrings: configFiles
    }).getObfuscatedCode();
}

function obfuscateMedium(code) {
    return JavaScriptObfuscator.obfuscate(code, {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.5,
        numbersToExpressions: false,
        simplify: true,
        stringArray: true,
        stringArrayEncoding: ['base64'],
        stringArrayThreshold: 0.6,
        rotateStringArray: true,
        shuffleStringArray: true,
        stringArrayWrappersType: 'function',
        stringArrayWrappersCount: 2,
        stringArrayWrappersChainedCalls: true,
        stringArrayIndexShift: true,
        stringArrayCompression: true,
        reservedNames: ['__CFG_DATA__', '__LOAD_CFG__', '__MATERIAL_DATA__'],
        reservedStrings: configFiles.concat(['__CFG_DATA__', '__LOAD_CFG__', '__MATERIAL_DATA__'])
    }).getObfuscatedCode();
}

function obfuscateHeavy(code) {
    code = codeMutation(code);
    code = addAntiDebug(code);
    return JavaScriptObfuscator.obfuscate(code, {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.9,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.5,
        numbersToExpressions: true,
        simplify: true,
        stringArray: true,
        stringArrayEncoding: ['base64', 'rc4'],
        stringArrayThreshold: 0.9,
        rotateStringArray: true,
        shuffleStringArray: true,
        stringArrayWrappersType: 'function',
        stringArrayWrappersCount: 3,
        stringArrayWrappersChainedCalls: true,
        stringArrayIndexShift: true,
        stringArrayCompression: true,
        splitStrings: true,
        splitStringsChunkLength: 5,
        selfDefending: true,
        reservedNames: ['__CFG_DATA__', '__LOAD_CFG__', '__MATERIAL_DATA__'],
        reservedStrings: configFiles
    }).getObfuscatedCode();
}

function obfuscateExtreme(code) {
    code = codeMutation(code);
    code = addAntiDebug(code);
    
    return JavaScriptObfuscator.obfuscate(code, {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.9,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.5,
        numbersToExpressions: true,
        simplify: true,
        stringArray: true,
        stringArrayEncoding: ['base64', 'rc4'],
        stringArrayThreshold: 0.9,
        rotateStringArray: true,
        shuffleStringArray: true,
        stringArrayWrappersType: 'function',
        stringArrayWrappersCount: 3,
        stringArrayWrappersChainedCalls: true,
        stringArrayIndexShift: true,
        stringArrayCompression: true,
        splitStrings: true,
        splitStringsChunkLength: 5,
        selfDefending: true,
        reservedNames: ['__CFG_DATA__', '__LOAD_CFG__', '__MATERIAL_DATA__'],
        reservedStrings: configFiles
    }).getObfuscatedCode();
}

function build(level) {
    const outputDir = path.join(distDir, `level-${level}`);
    
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    copyFiles.forEach(file => {
        const src = path.join(srcDir, file);
        const dest = path.join(outputDir, file);
        const destDir = path.dirname(dest);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        fs.copyFileSync(src, dest);
    });
    
    const configCode = buildConfigCode();
    
    jsFiles.forEach(file => {
        const src = path.join(srcDir, file);
        const content = fs.readFileSync(src, 'utf8');
        
        let finalCode = content;
        if (file === 'popup.js' || file === 'sidepanel.js') {
            finalCode = configCode + content;
        }
        
        let obfuscated = embedWatermark(finalCode);
        
        switch (level) {
            case 0:
                obfuscated = obfuscateNone(obfuscated);
                break;
            case 1:
                obfuscated = obfuscateLight(obfuscated);
                break;
            case 2:
                obfuscated = obfuscateMedium(obfuscated);
                break;
            case 3:
                obfuscated = obfuscateHeavy(obfuscated);
                break;
            case 4:
                obfuscated = obfuscateExtreme(obfuscated);
                break;
        }
        
        const dest = path.join(outputDir, file);
        const destDir = path.dirname(dest);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        fs.writeFileSync(dest, obfuscated);
    });
    
    const popupHtmlPath = path.join(outputDir, 'popup.html');
    let popupHtml = fs.readFileSync(popupHtmlPath, 'utf8');
    fs.writeFileSync(popupHtmlPath, popupHtml);
    
    console.log(`✅ Level ${level} build completed: ${outputDir}`);
}

async function zipBuild(level) {
    const dir = path.join(distDir, `level-${level}`);
    const zip = new JSZip();
    const zipPath = path.join(distDir, `extension-level-${level}.zip`);
    
    try {
        if (fs.existsSync(zipPath)) {
            fs.unlinkSync(zipPath);
        }
    } catch (e) {
        console.warn(`Warning: Could not delete existing zip file: ${e.message}`);
    }
    
    function addFile(filePath) {
        const relativePath = path.relative(dir, filePath);
        const content = fs.readFileSync(filePath);
        zip.file(relativePath, content);
    }
    
    function addDir(dirPath) {
        const files = fs.readdirSync(dirPath);
        files.forEach(file => {
            const filePath = path.join(dirPath, file);
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
                addDir(filePath);
            } else {
                addFile(filePath);
            }
        });
    }
    
    addDir(dir);
    
    const zipContent = await zip.generateAsync({ type: 'nodebuffer' });
    let attempts = 0;
    const maxAttempts = 5;
    while (attempts < maxAttempts) {
        try {
            fs.writeFileSync(zipPath, zipContent);
            console.log(`📦 Level ${level} zip created: ${zipPath}`);
            break;
        } catch (e) {
            attempts++;
            if (attempts >= maxAttempts) {
                console.warn(`Warning: Could not create zip file after ${maxAttempts} attempts: ${e.message}`);
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
}

async function main() {
    const level = process.argv[2] !== undefined ? parseInt(process.argv[2]) : 2;
    
    if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
    }
    
    console.log(`Building with protection level: ${level}`);
    build(level);
    await zipBuild(level);
    
    console.log('\nBuild completed successfully!');
}

main().catch(e => {
    console.error('Build failed:', e);
    process.exit(1);
});