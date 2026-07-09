const fs = require('fs');
const path = require('path');

const srcDir = '.';
const distDir = '../dist';

const jsFiles = [
    'popup.js',
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
    'manifest.json',
    'lib/jszip.min.js',
    'lib/xlsx.full.min.js',
    'icons/icon16.png',
    'icons/icon32.png',
    'icons/icon48.png',
    'icons/icon128.png'
];

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

function build() {
    const outputDir = path.join(distDir, 'test');
    
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
        if (file === 'popup.js') {
            finalCode = configCode + content;
        }
        
        const dest = path.join(outputDir, file);
        const destDir = path.dirname(dest);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        fs.writeFileSync(dest, finalCode);
    });
    
    console.log('✅ Test build completed: ' + outputDir);
}

build();