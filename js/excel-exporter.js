class ExcelExporter {
    constructor(materialData) {
        this.materialData = materialData || [];
        this.materialMap = this._buildMaterialMap();
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

    _createWorksheet(data, columns) {
        const ws_data = [];
        
        ws_data.push(columns.map(c => c.name));
        
        for (const row of data) {
            const rowData = [];
            for (const col of columns) {
                if (col.key === 'index') {
                    rowData.push(ws_data.length);
                } else if (col.value !== undefined) {
                    rowData.push(col.value);
                } else if (col.formula) {
                    try {
                        const vars = { ...row };
                        const cleaned = col.formula.replace(/\{(\w+)\}/g, (_, key) => {
                            return key in vars ? vars[key] : `vars['${key}']`;
                        });
                        const fn = new Function('vars', `return ${cleaned};`);
                        const val = fn(vars);
                        rowData.push(col.round !== undefined 
                            ? Math.round(val * Math.pow(10, col.round)) / Math.pow(10, col.round)
                            : val);
                    } catch (e) {
                        rowData.push('');
                    }
                } else {
                    const val = row[col.key];
                    rowData.push(val !== undefined && val !== null && val !== '' ? val : '');
                }
            }
            ws_data.push(rowData);
        }

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
                rowData.push(val !== undefined && val !== null && val !== '' ? val : '');
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
                    rowData.push(val !== undefined && val !== null && val !== '' ? val : '');
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
        
        for (const wsConfig of worksheets) {
            const wsName = wsConfig.name;
            
            let filteredRows = [...bomResult.bomRows];
            
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
            
            if (wsConfig.summary && bomResult.groupedData) {
                filteredRows = [...bomResult.groupedData];
            }
            
            const ws = this._createWorksheet(filteredRows, wsConfig.columns);
            XLSX.utils.book_append_sheet(wb, ws, wsName);
        }
        
        const mainBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
        jszip.file(`${orderNo}_BOM.xlsx`, mainBuffer);
        
        if (bomResult.groupedData) {
            const supplierFiles = this._exportBOMBySupplier(bomResult.groupedData, orderNo);
            for (const sf of supplierFiles) {
                jszip.file(sf.fileName, sf.buffer);
            }
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
            let partNumber = row.partNumber || '';
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
            supplierGroups[supplier].push(row);
        }
        
        const supplierFiles = [];
        const columns = [
            { key: 'index', name: '序号', width: 8 },
            { key: 'partNumber', name: '物料编码', width: 20 },
            { key: 'name', name: '物料名称', width: 35 },
            { key: 'spec', name: '规格(mm)', width: 20 },
            { key: 'material', name: '材质', width: 15 },
            { key: 'type', name: '类型', width: 10 },
            { key: 'totalQty', name: '总数量', width: 12 },
            { key: 'unit', name: '单位', width: 10 },
            { key: 'totalLength', name: '总长度(m)', width: 15 },
            { key: 'totalArea', name: '总面积(m²)', width: 15 },
            { key: 'cabinets', name: '使用柜体', width: 25 }
        ];
        
        for (const [supplier, rows] of Object.entries(supplierGroups)) {
            const fileName = `${baseName}_BOMto供方【${supplier}】.xlsx`;
            const ws = this._createWorksheet(rows, columns);
            
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "物料清单");
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
                rowData.push(val !== undefined && val !== null && val !== '' ? val : '');
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

    exportBOM(bomResult, bomRules) {
        const wb = XLSX.utils.book_new();
        const worksheets = bomRules.worksheets || [];
        const bomRows = bomResult.bomRows;
        const groupedData = bomResult.groupedData;

        for (const wsConfig of worksheets) {
            const wsName = wsConfig.name;
            
            let filteredRows = [...bomRows];
            
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
            
            if (wsConfig.summary && groupedData) {
                filteredRows = [...groupedData];
            }
            
            const ws = this._createWorksheet(filteredRows, wsConfig.columns);
            XLSX.utils.book_append_sheet(wb, ws, wsName);
        }

        const orderNo = bomResult.orderInfo.OrderNo || 'UNKNOWN';
        const filename = `BOM_${orderNo}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        
        XLSX.writeFile(wb, filename);
        return filename;
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
}