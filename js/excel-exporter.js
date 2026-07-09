class ExcelExporter {
    constructor(materialData) {
        this.materialData = materialData || [];
        this.materialMap = this._buildMaterialMap();
    }

    _formatNumber(value, decimals = 2) {
        if (value === undefined || value === null || value === '' || isNaN(value)) {
            return '';
        }
        const num = parseFloat(value);
        return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
    }

    _buildMaterialMap() {
        const map = {};
        for (const item of this.materialData) {
            if (item.part_number) {
                map[item.part_number] = item;
            }
        }
        return map;
    }

    _removeSuffix(value, suffixes) {
        if (!suffixes) suffixes = ['TZ', 'Z', 'T'];
        if (!value) return value;
        const str = String(value);
        for (const suffix of suffixes) {
            if (str.endsWith(suffix)) {
                return str.substring(0, str.length - suffix.length);
            }
        }
        return str;
    }

    _safeEval(expr, vars) {
        const allowedOps = ['+', '-', '*', '/', '%', '(', ')', '.', ',', '>', '<', '=', '!'];
        const sanitized = expr.split('').filter(c => {
            return /[a-zA-Z0-9]/.test(c) || allowedOps.includes(c);
        }).join('');
        const keys = Object.keys(vars);
        const values = keys.map(k => vars[k]);
        try {
            const fn = new (Function.prototype.bind.apply(Function, [null, ...keys, `return ${sanitized};`]))();
            return fn(...values);
        } catch (e) {
            return 0;
        }
    }

    _createWorksheet(data, columns) {
        const ws_data = [];
        
        ws_data.push(columns.map(c => c.name));
        
        console.log(`DEBUG_CREATE_WORKSHEET: data.length=${data.length}, columns=${columns.map(c => c.key).join(',')}`);
        
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const rowData = [];
            
            if (i < 5 || i === data.length - 1) {
                console.log(`DEBUG_CREATE_WORKSHEET_ROW_${i}: partNumber=${row.partNumber}, qty=${row.qty}, usage=${row.usage}, totalQty=${row.totalQty}, quoteUnit=${row.quoteUnit}`);
            }
            
            for (const col of columns) {
                if (col.key === 'index') {
                    rowData.push(ws_data.length);
                } else if (col.value !== undefined) {
                    rowData.push(col.value);
                } else if (col.formula) {
                    try {
                        const vars = { ...row };
                        const cleaned = col.formula.replace(/\{([^}]+)\}/g, (_, expr) => {
                            const keys = Object.keys(vars);
                            let replaced = expr;
                            for (const key of keys) {
                                const regex = new RegExp(`\\b${key}\\b`, 'g');
                                replaced = replaced.replace(regex, vars[key]);
                            }
                            return `(${replaced})`;
                        });
                        const val = this._safeEval(cleaned, vars);
                        rowData.push(col.round !== undefined 
                            ? Math.round(val * Math.pow(10, col.round)) / Math.pow(10, col.round)
                            : val);
                    } catch (e) {
                        rowData.push('');
                    }
                } else {
                        let val = row[col.key];
                        
                        if (col.key === 'totalQty' && (val === undefined || val === null || val === '')) {
                            val = row['qty'];
                        }
                        
                        if (col.key === 'usage' && i < 5) {
                            console.log(`DEBUG_CREATE_WORKSHEET_USAGE_${i}: col.key=${col.key}, raw_val=${row[col.key]}, final_val=${val !== undefined && val !== null && val !== '' ? val : ''}`);
                        }
                        
                        if (col.data_type === 'number') {
                            val = this._formatNumber(val, col.decimal_places || 2);
                        }
                        
                        rowData.push(val !== undefined && val !== null && val !== '' ? val : '');
                    }
            }
            ws_data.push(rowData);
        }

        console.log(`DEBUG_CREATE_WORKSHEET_END: ws_data rows=${ws_data.length - 1}`);
        const ws = XLSX.utils.aoa_to_sheet(ws_data);
        
        for (let i = 0; i < columns.length; i++) {
            const colLetter = XLSX.utils.encode_col(i);
            ws[`${colLetter}1`].s = {
                fill: { fgColor: { rgb: "4472C4" } },
                font: { color: { rgb: "FFFFFF" }, bold: true },
                alignment: { horizontal: "center", vertical: "center" },
                border: {
                    top: { style: "thin" },
                    bottom: { style: "thin" },
                    left: { style: "thin" },
                    right: { style: "thin" }
                }
            };
        }

        const colWidths = columns.map(c => ({ wch: c.width || 10 }));
        ws['!cols'] = colWidths;

        return ws;
    }

    async exportFMSWithSupplier(rows, columnNames, orderInfo, xmlString) {
        const orderNo = orderInfo.OrderNo || 'UNKNOWN';
        
        const jszip = new JSZip();
        
        const mainWsData = [];
        mainWsData.push(columnNames);
        for (const row of rows) {
            const rowData = [];
            for (const col of columnNames) {
                const val = row[col];
                if (val === 0 || val === '0') {
                    rowData.push('0');
                } else if (val !== undefined && val !== null && val !== '') {
                    rowData.push(val);
                } else {
                    rowData.push('');
                }
            }
            mainWsData.push(rowData);
        }
        
        const mainWs = XLSX.utils.aoa_to_sheet(mainWsData);
        for (let i = 0; i < columnNames.length; i++) {
            const colLetter = XLSX.utils.encode_col(i);
            mainWs[`${colLetter}1`].s = {
                fill: { fgColor: { rgb: "4472C4" } },
                font: { color: { rgb: "FFFFFF" }, bold: true },
                alignment: { horizontal: "center", vertical: "center" },
                border: {
                    top: { style: "thin" },
                    bottom: { style: "thin" },
                    left: { style: "thin" },
                    right: { style: "thin" }
                }
            };
        }
        
        const mainWb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(mainWb, mainWs, "生产数据");
        const mainBuffer = XLSX.write(mainWb, { type: 'array', bookType: 'xlsx' });
        jszip.file(`${orderNo}_FMS.xlsx`, mainBuffer);
        
        const supplierFiles = this._exportToExcelBySupplier(rows, columnNames, orderNo);
        for (const sf of supplierFiles) {
            jszip.file(sf.fileName, sf.buffer);
        }
        
        if (xmlString) {
            jszip.file(`${orderNo}.xml`, xmlString);
        }
        
        const zipContent = await jszip.generateAsync({ type: 'blob' });
        this._downloadBlob(zipContent, `${orderNo}_FMS.zip`);
        
        return `${orderNo}_FMS.zip`;
    }

    _exportToExcelBySupplier(data, columns, baseName) {
        const supplierGroups = {};
        
        if (data.length > 0) {
            console.log('DEBUG: Row keys:', Object.keys(data[0]));
            console.log('DEBUG: First row:', JSON.stringify(data[0]));
        }
        
        for (const rowData of data) {
            const systemType = rowData['系统类型'] || '';
            let partNumber = '';
            
            if (systemType === '3') {
                partNumber = rowData['材质WCC名称'] || rowData['材料描述2'] || rowData['材料描述1'] || '';
            } else {
                partNumber = rowData['单个部件名称'] || rowData['五金ID'] || '';
            }
            
            let supplier = '未匹配';
            
            if (partNumber && partNumber !== 'null') {
                const partNumberClean = this._removeSuffix(partNumber);
                
                if (partNumberClean in this.materialMap) {
                    supplier = this.materialMap[partNumberClean].supplier || '';
                } else {
                    for (const key of Object.keys(this.materialMap)) {
                        if (key.startsWith(partNumberClean)) {
                            supplier = this.materialMap[key].supplier || '';
                            break;
                        }
                    }
                }
                
                supplier = supplier || '未匹配';
            }
            
            if (!supplierGroups[supplier]) {
                supplierGroups[supplier] = [];
            }
            supplierGroups[supplier].push(rowData);
        }
        
        const supplierFiles = [];
        for (const [supplier, rows] of Object.entries(supplierGroups)) {
            const fileName = `${baseName}_FMSto供方【${supplier}】.xlsx`;
            
            const wsData = [];
            wsData.push(columns);
            
            for (const row of rows) {
                const rowData = [];
                for (const col of columns) {
                    const val = row[col];
                    if (val === 0 || val === '0') {
                        rowData.push('0');
                    } else if (val !== undefined && val !== null && val !== '') {
                        rowData.push(val);
                    } else {
                        rowData.push('');
                    }
                }
                wsData.push(rowData);
            }
            
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            for (let i = 0; i < columns.length; i++) {
                const colLetter = XLSX.utils.encode_col(i);
                ws[`${colLetter}1`].s = {
                    fill: { fgColor: { rgb: "4472C4" } },
                    font: { color: { rgb: "FFFFFF" }, bold: true },
                    alignment: { horizontal: "center", vertical: "center" },
                    border: {
                        top: { style: "thin" },
                        bottom: { style: "thin" },
                        left: { style: "thin" },
                        right: { style: "thin" }
                    }
                };
            }
            
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "生产数据");
            const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
            
            supplierFiles.push({
                supplier,
                fileName,
                buffer
            });
        }
        
        return supplierFiles;
    }

    async exportBOMWithSupplier(bomResult, bomRules, xmlString) {
        const orderNo = bomResult.orderInfo.OrderNo || 'UNKNOWN';
        
        const jszip = new JSZip();
        
        const wb = XLSX.utils.book_new();
        const worksheets = bomRules.worksheets || [];
        
        const detailRows = [];
        
        for (const wsConfig of worksheets) {
            const wsName = wsConfig.name;
            
            let filteredRows;
            
            if (wsConfig.summary) {
                filteredRows = this._groupDetailRows(detailRows);
            } else {
                filteredRows = [...bomResult.bomRows];
                
                if (wsConfig.type_filter) {
                    filteredRows = filteredRows.filter(row => wsConfig.type_filter.includes(row.type));
                }
                
                if (wsConfig.category_filter) {
                    filteredRows = filteredRows.filter(row => wsConfig.category_filter.includes(row.category));
                }
                
                if (wsConfig.door_category_filter && wsConfig.door_category_filter.length) {
                    filteredRows = filteredRows.filter(row => {
                        if (!row.isDoor) return false;
                        return wsConfig.door_category_filter.includes(row.doorCategory);
                    });
                }
                
                detailRows.push(...filteredRows);
            }
            
            const ws = this._createWorksheet(filteredRows, wsConfig.columns);
            XLSX.utils.book_append_sheet(wb, ws, wsName);
        }
        
        const mainBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
        jszip.file(`${orderNo}_BOM.xlsx`, mainBuffer);
        
        const groupedData = this._groupDetailRows(detailRows);
        console.log(`DEBUG_EXPORT_BOM_WITH_SUPPLIER: groupedData rows=${groupedData.length}`);
        
        const supplierFiles = this._exportBOMBySupplier(groupedData, orderNo);
        console.log(`DEBUG_EXPORT_BOM_WITH_SUPPLIER: supplierFiles count=${supplierFiles.length}`);
        
        for (const sf of supplierFiles) {
            jszip.file(sf.fileName, sf.buffer);
            console.log(`DEBUG_EXPORT_BOM_WITH_SUPPLIER_FILE: ${sf.fileName}`);
        }
        
        if (xmlString) {
            jszip.file(`${orderNo}.xml`, xmlString);
        }
        
        const zipContent = await jszip.generateAsync({ type: 'blob' });
        this._downloadBlob(zipContent, `${orderNo}_BOM.zip`);
        
        return `${orderNo}_BOM.zip`;
    }

    _exportBOMBySupplier(groupedData, baseName) {
        const supplierGroups = {};
        
        for (const row of groupedData) {
            let matchKey = row.type === 'Panel' && row.materialMatchKey ? row.materialMatchKey : row.partNumber;
            let supplier = '未匹配';
            
            if (matchKey && matchKey !== 'null') {
                const matchKeyClean = this._removeSuffix(matchKey);
                
                if (matchKeyClean in this.materialMap) {
                    supplier = this.materialMap[matchKeyClean].supplier || '';
                } else {
                    for (const key of Object.keys(this.materialMap)) {
                        if (key.startsWith(matchKeyClean)) {
                            supplier = this.materialMap[key].supplier || '';
                            break;
                        }
                    }
                }
                
                supplier = supplier || '未匹配';
            }
            
            if (!supplierGroups[supplier]) {
                supplierGroups[supplier] = [];
            }
            supplierGroups[supplier].push(row);
        }
        
        const supplierFiles = [];
        const columns = [
            { key: 'index', name: '序号' },
            { key: 'type', name: '类型' },
            { key: 'partNumber', name: '物料编码' },
            { key: 'name', name: '物料名称' },
            { key: 'doorCategory', name: '门板分类' },
            { key: 'usage', name: '用量' },
            { key: 'quoteUnit', name: '报价单位' },
            { key: 'color', name: '颜色' },
            { key: 'material', name: '基材' },
            { key: 'supplier', name: '供方处理' },
            { key: 'supplier_code', name: '供方编码' }
        ];
        
        for (const [supplier, rows] of Object.entries(supplierGroups)) {
            const fileName = `${baseName}_BOMto供方【${supplier}】.xlsx`;
            const ws = this._createWorksheet(rows, columns);
            
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "物料汇总");
            const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
            
            supplierFiles.push({
                supplier,
                fileName,
                buffer
            });
        }
        
        return supplierFiles;
    }

    _downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    exportFMS(rows, columnNames, orderInfo) {
        const ws_data = [];
        ws_data.push(columnNames);
        
        for (const row of rows) {
            const rowData = [];
            for (const col of columnNames) {
                const val = row[col];
                if (val === 0 || val === '0') {
                    rowData.push('0');
                } else if (val !== undefined && val !== null && val !== '') {
                    rowData.push(val);
                } else {
                    rowData.push('');
                }
            }
            ws_data.push(rowData);
        }

        const ws = XLSX.utils.aoa_to_sheet(ws_data);
        
        for (let i = 0; i < columnNames.length; i++) {
            const colLetter = XLSX.utils.encode_col(i);
            ws[`${colLetter}1`].s = {
                fill: { fgColor: { rgb: "4472C4" } },
                font: { color: { rgb: "FFFFFF" }, bold: true },
                alignment: { horizontal: "center", vertical: "center" },
                border: {
                    top: { style: "thin" },
                    bottom: { style: "thin" },
                    left: { style: "thin" },
                    right: { style: "thin" }
                }
            };
        }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "生产数据");

        const orderNo = orderInfo.OrderNo || 'UNKNOWN';
        const filename = `FMS_${orderNo}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        
        XLSX.writeFile(wb, filename);
        return filename;
    }

    async exportBOM(bomResult, bomRules) {
        const wb = XLSX.utils.book_new();
        const worksheets = bomRules.worksheets || [];
        const bomRows = bomResult.bomRows;
        
        console.log(`DEBUG_EXPORT_START: total bomRows=${bomRows.length}`);
        
        const detailRows = [];

        for (const wsConfig of worksheets) {
            const wsName = wsConfig.name;
            
            let filteredRows;
            
            if (wsConfig.summary) {
                filteredRows = this._groupDetailRows(detailRows);
                console.log(`DEBUG_EXPORT_WORKSHEET: name=${wsName}, summary=true, filteredRows=${filteredRows.length}`);
            } else {
                filteredRows = [...bomRows];
                
                if (wsConfig.type_filter) {
                    filteredRows = filteredRows.filter(row => wsConfig.type_filter.includes(row.type));
                }
                
                if (wsConfig.category_filter) {
                    filteredRows = filteredRows.filter(row => wsConfig.category_filter.includes(row.category));
                }
                
                if (wsConfig.door_category_filter && wsConfig.door_category_filter.length) {
                    filteredRows = filteredRows.filter(row => {
                        if (!row.isDoor) return false;
                        return wsConfig.door_category_filter.includes(row.doorCategory);
                    });
                }
                
                detailRows.push(...filteredRows);
                console.log(`DEBUG_EXPORT_WORKSHEET: name=${wsName}, type_filter=${wsConfig.type_filter}, category_filter=${wsConfig.category_filter}, filteredRows=${filteredRows.length}`);
            }
            
            if (filteredRows.length > 0) {
                console.log(`DEBUG_EXPORT_WORKSHEET_FIRST_ROW: name=${wsName}, partNumber=${filteredRows[0].partNumber}, qty=${filteredRows[0].qty}, usage=${filteredRows[0].usage}, totalQty=${filteredRows[0].totalQty}`);
                if (filteredRows.length > 1) {
                    console.log(`DEBUG_EXPORT_WORKSHEET_LAST_ROW: name=${wsName}, partNumber=${filteredRows[filteredRows.length - 1].partNumber}, qty=${filteredRows[filteredRows.length - 1].qty}, usage=${filteredRows[filteredRows.length - 1].usage}, totalQty=${filteredRows[filteredRows.length - 1].totalQty}`);
                }
            }
            
            const ws = this._createWorksheet(filteredRows, wsConfig.columns);
            XLSX.utils.book_append_sheet(wb, ws, wsName);
        }

        const orderNo = bomResult.orderInfo.OrderNo || 'UNKNOWN';
        
        const groupedData = this._groupDetailRows(detailRows);
        console.log(`DEBUG_EXPORT_SUPPLIER: groupedData rows=${groupedData.length}`);
        
        const supplierFiles = this._exportBOMBySupplier(groupedData, orderNo);
        console.log(`DEBUG_EXPORT_SUPPLIER: supplierFiles count=${supplierFiles.length}`);
        
        if (supplierFiles.length > 0) {
            const jszip = new JSZip();
            
            const mainBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
            jszip.file(`BOM_${orderNo}_${new Date().toISOString().slice(0, 10)}.xlsx`, mainBuffer);
            
            for (const sf of supplierFiles) {
                jszip.file(sf.fileName, sf.buffer);
                console.log(`DEBUG_EXPORT_SUPPLIER_FILE: ${sf.fileName}, rows=${sf.rowsCount}`);
            }
            
            const zipContent = await jszip.generateAsync({ type: 'blob' });
            this._downloadBlob(zipContent, `${orderNo}_BOM.zip`);
            
            return `${orderNo}_BOM.zip`;
        } else {
            const filename = `BOM_${orderNo}_${new Date().toISOString().slice(0, 10)}.xlsx`;
            XLSX.writeFile(wb, filename);
            return filename;
        }
    }

    exportCSV(rows, columnNames, filename) {
        const headers = columnNames.join(',');
        const lines = rows.map(row => 
            columnNames.map(col => {
                const val = row[col] || '';
                return `"${String(val).replace(/"/g, '""')}"`;
            }).join(',')
        );
        
        const csv = [headers, ...lines].join('\n');
        
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    _groupDetailRows(detailRows) {
        const groups = {};
        
        for (const row of detailRows) {
            const key = String(row.materialMatchKey || row.partNumber || 'UNKNOWN');
            if (!key || key === 'null') continue;
            
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(row);
        }
        
        const result = [];
        for (const [key, items] of Object.entries(groups)) {
            const first = items[0];
            const totalQty = items.reduce((sum, item) => sum + (item.qty || 0), 0);
            const totalUsage = items.reduce((sum, item) => sum + (item.usage || 0), 0);
            
            const allCabinets = new Set();
            items.forEach(item => {
                if (item.cabinetNo) allCabinets.add(item.cabinetNo);
                if (item.cabinets) {
                    if (Array.isArray(item.cabinets)) {
                        item.cabinets.forEach(c => allCabinets.add(c));
                    } else {
                        allCabinets.add(item.cabinets);
                    }
                }
            });
            
            const isPanel = first.type === 'Panel';
            const finalPartNumber = isPanel && first.materialMatchKey ? first.materialMatchKey : first.partNumber;
            const finalName = isPanel ? `${first.color || ''} ${first.material || ''}`.trim() : first.name;
            
            result.push({
                partNumber: finalPartNumber,
                name: finalName,
                material: first.material,
                color: first.color,
                type: first.type,
                typeCode: first.typeCode,
                category: first.category,
                length: first.length,
                width: first.width,
                thickness: first.thickness,
                totalQty: totalQty,
                unit: first.unit,
                cabinets: [...allCabinets].join(', '),
                cabinetNames: items.map(i => i.cabinetName).filter(Boolean).join(', '),
                barcode: first.barcode,
                edgeBand: first.edgeBand,
                module: first.module,
                doorCategory: first.doorCategory,
                isDoor: first.isDoor,
                supplier: first.supplier,
                supplier_code: first.supplier_code,
                quoteUnit: first.quoteUnit,
                usage: typeof totalUsage === 'number' ? Math.ceil(totalUsage * 100) / 100 : totalUsage,
                totalUsage: typeof totalUsage === 'number' ? Math.ceil(totalUsage * 100) / 100 : totalUsage,
                materialMatchKey: first.materialMatchKey
            });
        }
        
        return result.sort((a, b) => {
            if (a.typeCode !== b.typeCode) return a.typeCode.localeCompare(b.typeCode);
            return a.partNumber.localeCompare(b.partNumber);
        });
    }
}