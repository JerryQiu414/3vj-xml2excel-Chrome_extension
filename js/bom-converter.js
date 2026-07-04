class BOMConverter {
    constructor(xmlParser, bomRules, materialData) {
        this.xmlParser = xmlParser;
        this.bomRules = bomRules || {};
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

    _getValueByPath(data, path) {
        if (!path) return null;
        
        if (Array.isArray(path)) {
            for (const p of path) {
                const val = this._getValueByPath(data, p);
                if (val) return val;
            }
            return null;
        }

        if (typeof path === 'string' && path.startsWith('parent.')) {
            const parentPath = path.replace('parent.', '');
            return this._getValueByPath(data.parent, parentPath);
        }

        const parts = path.split('.');
        let result = data;
        for (const part of parts) {
            if (result && typeof result === 'object' && part in result) {
                result = result[part];
            } else {
                return null;
            }
        }
        return result;
    }

    _extractField(rowData, parentData, mapping) {
        const data = { ...rowData, parent: parentData };
        
        if (Array.isArray(mapping)) {
            for (const m of mapping) {
                const val = this._getValueByPath(data, m);
                if (val !== null && val !== undefined) return val;
            }
            return null;
        }

        if (mapping === null) return null;
        if (typeof mapping === 'string' && mapping.startsWith('固定:')) return mapping.replace('固定:', '');

        return this._getValueByPath(data, mapping);
    }

    _removeSuffixes(str, suffixes) {
        if (!str || !suffixes || !suffixes.length) return str;
        const s = String(str);
        for (const suffix of suffixes) {
            if (s.endsWith(suffix)) {
                return s.substring(0, s.length - suffix.length);
            }
        }
        return s;
    }

    _isDoor(partNumber, name) {
        const keywords = this.bomRules.door_keywords || ['门', 'Door', 'door', 'GRD'];
        const str = String(partNumber || '') + String(name || '');
        return keywords.some(k => str.includes(k));
    }

    _classifyDoor(partNumber, material) {
        const rules = this.bomRules.door_classification?.rules || [];
        const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);

        for (const rule of sortedRules) {
            let match = false;
            for (const condition of rule.conditions) {
                const fieldValue = condition.field === 'partNumber' ? String(partNumber || '') : String(material || '');
                const prefixMatch = condition.prefixes?.some(p => fieldValue.startsWith(p));
                if (rule.logic === 'AND') {
                    match = prefixMatch;
                    if (!match) break;
                } else {
                    if (prefixMatch) {
                        match = true;
                        break;
                    }
                }
            }
            if (match) return rule.category;
        }
        return '免漆门板';
    }

    _sortCabinets(cabinetNos) {
        const config = this.bomRules.cabinet_sort || {};
        if (!config.enabled) return cabinetNos;

        const separator = config.separator || ', ';
        const nos = cabinetNos.split(separator).filter(n => n.trim());
        
        if (config.type === 'numeric') {
            nos.sort((a, b) => {
                const numA = parseFloat(a.trim()) || 0;
                const numB = parseFloat(b.trim()) || 0;
                return numA - numB;
            });
        } else {
            nos.sort();
        }

        return nos.join(separator);
    }

    async convert(xmlString) {
        const rows = this.xmlParser.parse(xmlString);
        const orderInfo = this.xmlParser.order_info;

        const bomRows = [];
        const stats = { Panel: 0, Metal: 0, Line: 0, SubTable: 0 };

        const fieldMappings = this.bomRules.field_mappings || {};
        const removeSuffixes = this.bomRules.remove_suffixes || { enabled: false, suffixes: [] };

        for (const row of rows) {
            const rowType = row.type;
            const rowData = row.data;
            const parentData = row.parent_data;
            const mappings = fieldMappings[rowType] || {};

            const bomRow = {
                type: rowType,
                typeCode: this.bomRules.type_display?.[rowType] || rowType,
                partNumber: this._extractField(rowData, parentData, mappings.partNumber),
                name: this._extractField(rowData, parentData, mappings.name),
                material: this._extractField(rowData, parentData, mappings.material),
                color: this._extractField(rowData, parentData, mappings.color),
                length: parseFloat(this._extractField(rowData, parentData, mappings.length)) || 0,
                width: parseFloat(this._extractField(rowData, parentData, mappings.width)) || 0,
                thickness: parseFloat(this._extractField(rowData, parentData, mappings.thickness)) || 0,
                qty: parseInt(this._extractField(rowData, parentData, mappings.qty)) || 1,
                unit: this._extractField(rowData, parentData, mappings.unit) || '件',
                cabinetNo: this._extractField(rowData, parentData, mappings.cabinetNo),
                cabinetName: this._extractField(rowData, parentData, mappings.cabinetName),
                barcode: this._extractField(rowData, parentData, mappings.barcode),
                category: this._extractField(rowData, parentData, mappings.category),
                edgeBand: this._extractField(rowData, parentData, mappings.edgeBand),
                module: this._extractField(rowData, parentData, mappings.module),
                actualLength: parseFloat(this._extractField(rowData, parentData, mappings.actualLength)) || 0,
                actualWidth: parseFloat(this._extractField(rowData, parentData, mappings.actualWidth)) || 0,
                cabinets: new Set()
            };

            if (bomRow.cabinetNo) {
                bomRow.cabinets.add(bomRow.cabinetNo);
            }

            if (removeSuffixes.enabled && bomRow.partNumber) {
                bomRow.partNumber = this._removeSuffixes(bomRow.partNumber, removeSuffixes.suffixes);
            }

            if (rowType === 'Panel') {
                bomRow.isDoor = this._isDoor(bomRow.partNumber, bomRow.name);
                if (bomRow.isDoor) {
                    bomRow.doorCategory = this._classifyDoor(bomRow.partNumber, bomRow.material);
                }
            }

            const materialInfo = this.materialMap[bomRow.partNumber];
            if (materialInfo) {
                bomRow.supplier = materialInfo.supplier;
                bomRow.supplier_code = materialInfo.supplier_code;
                bomRow.quote_unit = materialInfo.quote_unit;
                bomRow.usage_formula = materialInfo.usage_formula;
            }

            bomRows.push(bomRow);
            stats[rowType] = (stats[rowType] || 0) + 1;
        }

        const groupedData = this._groupByPartNumber(bomRows);

        return {
            bomRows,
            groupedData,
            orderInfo,
            stats,
            totalRowCount: bomRows.length
        };
    }

    _groupByPartNumber(bomRows) {
        const groupBy = this.bomRules.group_by || 'partNumber';
        const groups = {};

        for (const row of bomRows) {
            const key = String(row[groupBy] || 'UNKNOWN');
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(row);
        }

        const result = [];
        for (const [key, items] of Object.entries(groups)) {
            const first = items[0];
            const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
            const totalLength = items.reduce((sum, item) => sum + item.length * item.qty, 0);
            const totalArea = items.reduce((sum, item) => sum + (item.length * item.width / 1000000) * item.qty, 0);
            
            const allCabinets = new Set();
            items.forEach(item => {
                if (item.cabinetNo) allCabinets.add(item.cabinetNo);
                if (item.cabinets) item.cabinets.forEach(c => allCabinets.add(c));
            });

            const specFormat = this.bomRules.spec_formats?.[first.type] || '{length}x{width}x{thickness}';
            const spec = specFormat
                .replace('{length}', first.length)
                .replace('{width}', first.width)
                .replace('{thickness}', first.thickness);

            let usage = totalQty;
            if (first.usage_formula) {
                const vars = { totalQty, totalLength, totalArea, length: first.length, width: first.width, thickness: first.thickness };
                try {
                    usage = this._evaluateFormula(first.usage_formula, vars);
                } catch (e) {
                    usage = totalQty;
                }
            }

            result.push({
                partNumber: first.partNumber,
                name: first.name,
                material: first.material,
                color: first.color,
                type: first.type,
                typeCode: first.typeCode,
                spec: spec,
                length: first.length,
                width: first.width,
                thickness: first.thickness,
                totalQty: totalQty,
                unit: first.unit,
                totalLength: Math.round(totalLength * 1000) / 1000000,
                totalArea: Math.round(totalArea * 10000) / 10000,
                cabinets: this._sortCabinets([...allCabinets].join(', ')),
                cabinetNames: items.map(i => i.cabinetName).filter(Boolean).join(', '),
                barcode: first.barcode,
                edgeBand: first.edgeBand,
                module: first.module,
                doorCategory: first.doorCategory,
                isDoor: first.isDoor,
                supplier: first.supplier,
                supplier_code: first.supplier_code,
                quote_unit: first.quote_unit,
                usage: typeof usage === 'number' ? Math.round(usage * 10000) / 10000 : usage
            });
        }

        const sortBy = this.bomRules.sort_by || ['typeCode', 'partNumber'];
        result.sort((a, b) => {
            for (const field of sortBy) {
                const valA = String(a[field] || '');
                const valB = String(b[field] || '');
                if (valA !== valB) return valA.localeCompare(valB);
            }
            return 0;
        });

        return result;
    }

    _evaluateFormula(formula, vars) {
        const cleaned = formula.replace(/\{(\w+)\}/g, (_, key) => {
            if (key in vars) {
                return vars[key];
            }
            return `vars['${key}']`;
        });
        
        const fn = new Function('vars', `return ${cleaned};`);
        return fn(vars);
    }

    getWorksheetData(worksheetConfig, bomRows) {
        const result = [];
        
        for (const row of bomRows) {
            const outputRow = {};
            
            for (const col of worksheetConfig.columns) {
                const key = col.key;
                
                if (col.value !== undefined) {
                    outputRow[key] = col.value;
                } else if (col.formula) {
                    const vars = { ...row };
                    try {
                        const val = this._evaluateFormula(col.formula, vars);
                        outputRow[key] = col.round !== undefined 
                            ? Math.round(val * Math.pow(10, col.round)) / Math.pow(10, col.round)
                            : val;
                    } catch (e) {
                        outputRow[key] = '';
                    }
                } else {
                    outputRow[key] = row[key] || '';
                }
            }
            
            result.push(outputRow);
        }
        
        return result;
    }
}