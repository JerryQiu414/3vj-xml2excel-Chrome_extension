let uploadedFile = null;
let selectedConversion = 'fms';
let conversionResult = null;
let configs = {};

document.addEventListener('DOMContentLoaded', async () => {
    await loadConfigs();
    bindEvents();
});

function bindEvents() {
    document.getElementById('uploadZone').addEventListener('click', triggerFileSelect);
    document.getElementById('fileInput').addEventListener('change', handleFileSelect);
    document.getElementById('optFms').addEventListener('click', () => selectConversion('fms'));
    document.getElementById('optBom').addEventListener('click', () => selectConversion('bom'));
    document.getElementById('convertBtn').addEventListener('click', convertAndDownload);
}

async function loadConfigs() {
    try {
        const [fieldMapping, defaultConfig, bomRules, materialData, productionPlans, processRoutes] = await Promise.all([
            fetch('config/field_mapping.json').then(r => r.json()),
            fetch('config/default_config.json').then(r => r.json()),
            fetch('config/bom_rules.json').then(r => r.json()),
            fetch('config/material_data.json').then(r => r.text()),
            fetch('config/production_plans.json').then(r => r.json()),
            fetch('config/process_routes.json').then(r => r.json())
        ]);
        
        const materialLines = materialData.trim().split('\n');
        configs.materialData = materialLines.map(line => JSON.parse(line));
        configs.fieldMapping = fieldMapping;
        configs.defaultConfig = defaultConfig;
        configs.bomRules = bomRules;
        configs.productionPlans = productionPlans;
        configs.processRoutes = processRoutes;
        
        console.log('配置加载成功:');
        console.log('fieldMapping.columns:', fieldMapping.columns?.length || 0);
        console.log('fieldMapping.row_data_sources:', fieldMapping.row_data_sources ? Object.keys(fieldMapping.row_data_sources) : 'undefined');
        console.log('productionPlans:', productionPlans.plans?.length || 0, 'plans');
        console.log('processRoutes:', processRoutes.process_steps?.length || 0, 'steps');
        
        updateConvertButtonState();
    } catch (e) {
        console.error('Failed to load configs:', e);
        showStatus('❌ 配置文件加载失败', 'error');
    }
}

function triggerFileSelect() {
    document.getElementById('fileInput').click();
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        if (!file.name.endsWith('.xml')) {
            showStatus('❌ 请上传XML文件', 'error');
            return;
        }
        
        uploadedFile = file;
        document.getElementById('uploadZone').classList.add('has-file');
        document.getElementById('fileInfo').classList.add('show');
        document.getElementById('fileName').textContent = file.name;
        
        updateConvertButtonState();
    }
}

function selectConversion(type) {
    selectedConversion = type;
    
    document.getElementById('optFms').classList.toggle('selected', type === 'fms');
    document.getElementById('optBom').classList.toggle('selected', type === 'bom');
}

function updateConvertButtonState() {
    const btn = document.getElementById('convertBtn');
    btn.disabled = !uploadedFile || !configs.fieldMapping;
}

function showStatus(message, type) {
    const statusBar = document.getElementById('statusBar');
    statusBar.textContent = message;
    statusBar.className = `status-bar show status-${type}`;
    
    if (type !== 'processing') {
        setTimeout(() => {
            statusBar.classList.remove('show');
        }, 5000);
    }
}

async function convertAndDownload() {
    if (!uploadedFile || !configs.fieldMapping) {
        return;
    }
    
    const btn = document.getElementById('convertBtn');
    const btnText = document.getElementById('convertBtnText');
    const btnLoader = document.getElementById('convertBtnLoader');
    
    btn.disabled = true;
    btnText.style.display = 'none';
    btnLoader.style.display = 'block';
    
    showStatus('正在处理文件，请稍候...', 'processing');
    
    try {
        const xmlString = await readFileAsText(uploadedFile);
        
        let result;
        if (selectedConversion === 'fms') {
            result = await convertFMS(xmlString);
        } else {
            result = await convertBOM(xmlString);
        }
        
        conversionResult = result;
        
        document.getElementById('totalRows').textContent = result.totalRowCount || 0;
        document.getElementById('panelCount').textContent = result.stats?.Panel || 0;
        document.getElementById('metalCount').textContent = result.stats?.Metal || 0;
        document.getElementById('lineCount').textContent = result.stats?.Line || 0;
        
        document.getElementById('statsContainer').style.display = 'grid';
        
        const exporter = new ExcelExporter(configs.materialData);
        
        if (selectedConversion === 'fms') {
            const columnNames = configs.fieldMapping.columns.map(col => col.name);
            await exporter.exportFMSWithSupplier(result.rows, columnNames, result.orderInfo, xmlString);
        } else {
            await exporter.exportBOMWithSupplier(result, configs.bomRules, xmlString);
        }
        
        btnText.style.display = 'block';
        btnLoader.style.display = 'none';
        btn.disabled = false;
        
        const typeName = selectedConversion === 'fms' ? 'FMS' : 'BOM';
        showStatus(`✅ ${typeName}转换完成，ZIP文件已开始下载！`, 'success');
        
    } catch (error) {
        btnText.style.display = 'block';
        btnLoader.style.display = 'none';
        btn.disabled = false;
        
        console.error('转换错误:', error);
        showStatus('❌ 转换失败: ' + error.message, 'error');
    }
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(new Error('文件读取失败'));
        reader.readAsText(file, 'UTF-8');
    });
}

async function convertFMS(xmlString) {
    const xmlParser = new XMLParser(configs.fieldMapping);
    const fieldMapper = new FieldMapper(
        configs.fieldMapping, 
        configs.defaultConfig,
        configs.productionPlans,
        configs.processRoutes
    );
    const fmsConverter = new FMSConverter(xmlParser, fieldMapper);
    
    return await fmsConverter.convert(xmlString);
}

async function convertBOM(xmlString) {
    const xmlParser = new XMLParser(configs.fieldMapping);
    const bomConverter = new BOMConverter(xmlParser, configs.bomRules, configs.materialData);
    
    return await bomConverter.convert(xmlString);
}