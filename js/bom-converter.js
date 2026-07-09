console.log('BOM_CONVERTER_V2.1_LOADED');

class BOMConverter {
    constructor(xmlParser, bomRules, materialData) {
        this.xmlParser = xmlParser;
        this.bomRules = bomRules || {};
        this.materialData = materialData || [];
        this.materialMap = this._buildMaterialMap();
    }

    _buildMaterialMap() {
        const map = {};
        console.log(`DEBUG_BUILD_MAP: materialData length=${this.materialData.length}`);
        console.log(`DEBUG_BUILD_MAP: materialData[0]=${this.materialData.length > 0 ? JSON.stringify(this.materialData[0]).substring(0, 100) : 'empty'}`);
        
        let foundGRHH = false;
        for (const item of this.materialData) {
            if (item.part_number) {
                map[item.part_number] = item;
                if (item.part_number === 'GRHH030000101') {
                    foundGRHH = true;
                    console.log(`DEBUG_BUILD_MAP_FOUND: part_number=${item.part_number}, name=${item.name}, usage_formula=${item.usage_formula}, quote_unit=${item.quote_unit}`);
                }
            }
        }
        
        console.log(`DEBUG_BUILD_MAP: map keys count=${Object.keys(map).length}`);
        
        if (map['GRHH030000101']) {
            console.log(`DEBUG_BUILD_MAP: GRHH030000101 in map! usage_formula=${map['GRHH030000101'].usage_formula}`);
        } else {
            console.log(`DEBUG_BUILD_MAP: GRHH030000101 NOT in map! foundGRHH=${foundGRHH}`);
            console.log(`DEBUG_BUILD_MAP: first 10 map keys=${Object.keys(map).slice(0, 10).join(', ')}`);
        }
        
        return map;
    }

    _findMaterialByName(materialName) {
        if (!materialName) return null;
        
        const searchName = String(materialName).toLowerCase();
        let bestMatch = null;
        let bestScore = 0;
        
        for (const item of this.materialData) {
            if (!item.name) continue;
            
            const itemName = String(item.name).toLowerCase();
            
            if (itemName.includes(searchName)) {
                const score = searchName.length / itemName.length;
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = item;
                }
            } else if (searchName.includes(itemName)) {
                const score = itemName.length / searchName.length;
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = item;
                }
            }
        }
        
        return bestMatch;
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

    _classifyDoor(partNumber, material, color) {
        const rules = this.bomRules.door_classification?.rules || [];
        const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);

        for (const rule of sortedRules) {
            let match = rule.logic === 'AND';
            for (const condition of rule.conditions) {
                let fieldValue = '';
                if (condition.field === 'partNumber') {
                    fieldValue = String(partNumber || '');
                } else if (condition.field === 'material') {
                    fieldValue = String(material || '');
                } else if (condition.field === 'color') {
                    fieldValue = String(color || '');
                }
                const prefixMatch = condition.prefixes?.some(p => fieldValue.startsWith(p));
                if (rule.logic === 'AND') {
                    match = match && prefixMatch;
                    if (!match) break;
                } else {
                    match = match || prefixMatch;
                    if (match) break;
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
            const rowElement = row.element;
            const mappings = fieldMappings[rowType] || {};

            const originalPartNumber = this._extractField(rowData, parentData, mappings.partNumber);
            const basicMaterialMCode = this._extractField(rowData, parentData, ['BasicMaterialMCode', 'BasicMaterialCode']);
            
            let color = '';
            const colorFieldVal = this._extractField(rowData, parentData, mappings.color);
            color = String(colorFieldVal || rowData.Material || '');
            const colorMatch = color.match(/^(GR[A-Z]?\d+)/);
            const colorCode = colorMatch ? colorMatch[1] : '';
            
            const material = this._extractField(rowData, parentData, mappings.material);
            
            const rawQty = this._extractField(rowData, parentData, mappings.qty);
            const parsedQty = parseFloat(rawQty);
            const finalQty = parsedQty || 1;
            
            const rawLength = this._extractField(rowData, parentData, mappings.length);
            const parsedLength = parseFloat(rawLength);
            const finalLength = parsedLength || 0;
            
            const rawWidth = this._extractField(rowData, parentData, mappings.width);
            const parsedWidth = parseFloat(rawWidth);
            const finalWidth = parsedWidth || 0;
            
            console.log(`DEBUG_PANEL_INPUT: rowType=${rowType}, partNumber=${originalPartNumber}, rawQty=${rawQty}, parsedQty=${parsedQty}, finalQty=${finalQty}, rawLength=${rawLength}, parsedLength=${parsedLength}, finalLength=${finalLength}, rawWidth=${rawWidth}, parsedWidth=${parsedWidth}, finalWidth=${finalWidth}, materialMatchKey=${basicMaterialMCode}`);
            if (originalPartNumber === 'GRHH030000101') {
                console.log(`========== GRHH030000101 DEBUG START ==========`);
                console.log(`rowType=${rowType}, rowData keys=${Object.keys(rowData).slice(0, 10).join(',')}`);
                console.log(`rowData.length=${rowData.length}, rowData.width=${rowData.width}, rowData.Num=${rowData.Num}`);
                console.log(`rowData.PartNumber=${rowData.PartNumber}`);
                console.log(`mappings.length=${mappings.length}, mappings.partNumber=${mappings.partNumber}`);
                console.log(`========== GRHH030000101 DEBUG END ==========`);
            }
            
            const bomRow = {
                type: rowType,
                typeCode: this.bomRules.type_display?.[rowType] || rowType,
                partNumber: originalPartNumber,
                originalPartNumber: originalPartNumber,
                materialMatchKey: basicMaterialMCode,
                materialNameForMatch: material,
                name: this._extractField(rowData, parentData, mappings.name),
                material: this._extractField(rowData, parentData, mappings.material),
                color: color,
                length: finalLength,
                width: finalWidth,
                thickness: parseFloat(this._extractField(rowData, parentData, mappings.thickness)) || 0,
                qty: finalQty,
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
                const doorPartNumber = bomRow.originalPartNumber || bomRow.partNumber;
                bomRow.isDoor = this._isDoor(doorPartNumber, bomRow.name);
                if (bomRow.isDoor) {
                    console.log(`DEBUG DOOR: originalPartNumber=${doorPartNumber}, partNumber=${bomRow.partNumber}, material=${bomRow.material}, color=${bomRow.color}`);
                    bomRow.doorCategory = this._classifyDoor(doorPartNumber, bomRow.material, bomRow.color);
                    console.log(`DEBUG DOOR: doorCategory=${bomRow.doorCategory}`);
                }
                
                let hasGrooveType = false;
                if (rowElement) {
                    const machinesElements = rowElement.getElementsByTagName('Machines');
                    for (let i = 0; i < machinesElements.length; i++) {
                        const machinings = machinesElements[i].getElementsByTagName('Machining');
                        for (let j = 0; j < machinings.length; j++) {
                            if (machinings[j].hasAttribute('GrooveType')) {
                                hasGrooveType = true;
                                break;
                            }
                        }
                        if (hasGrooveType) break;
                    }
                }
                bomRow.isSpecial = hasGrooveType ? '是' : '否';
            } else {
                bomRow.isSpecial = '否';
            }

            let matchKey = bomRow.materialMatchKey || bomRow.partNumber;
            let originalMatchKey = matchKey;
            if (matchKey) {
                const suffixes = ['TZ', 'Z', 'T'];
                for (const suffix of suffixes) {
                    if (matchKey.endsWith(suffix)) {
                        matchKey = matchKey.substring(0, matchKey.length - suffix.length);
                        break;
                    }
                }
            }
            
            console.log(`DEBUG_MATCH_KEY_DEBUG: rowType=${bomRow.type}, partNumber=${bomRow.partNumber}, materialMatchKey=${bomRow.materialMatchKey}, originalMatchKey=${originalMatchKey}, matchKey=${matchKey}`);
            
            if (bomRow.partNumber === 'GRHH030000101') {
                console.log(`========== GRHH030000101 MATCH DEBUG ==========`);
                console.log(`bomRow.partNumber=${bomRow.partNumber}`);
                console.log(`bomRow.materialMatchKey=${bomRow.materialMatchKey}`);
                console.log(`matchKey=${matchKey}`);
                console.log(`materialMap has GRHH030000101: ${!!this.materialMap['GRHH030000101']}`);
                console.log(`materialMap has ${matchKey}: ${!!this.materialMap[matchKey]}`);
                console.log(`materialMap keys count: ${Object.keys(this.materialMap).length}`);
                if (this.materialMap['GRHH030000101']) {
                    console.log(`GRHH030000101 in map: ${JSON.stringify(this.materialMap['GRHH030000101'])}`);
                }
                console.log(`========== GRHH030000101 MATCH DEBUG END ==========`);
            }
            
            let materialInfo = this.materialMap[matchKey];
            let matchMethod = 'map';
            
            if (!materialInfo && bomRow.materialNameForMatch) {
                materialInfo = this._findMaterialByName(bomRow.materialNameForMatch);
                matchMethod = 'name';
            }
            const sets = this.bomRules.sets || 1;
            
            console.log(`DEBUG_MATERIAL_MATCH: rowType=${bomRow.type}, partNumber=${bomRow.partNumber}, materialMatchKey=${bomRow.materialMatchKey}, matchKey=${matchKey}, matchMethod=${matchMethod}, found=${!!materialInfo}`);
            
            if (materialInfo) {
                console.log(`DEBUG_MATCH_SUCCESS: materialMatchKey=${bomRow.materialMatchKey}, found_part_number=${materialInfo.part_number}, name=${materialInfo.name}`);
                console.log(`DEBUG_FORMULA_CONFIG: usage_formula=${materialInfo.usage_formula}, min_usage=${materialInfo.min_usage}, quote_unit=${materialInfo.quote_unit}`);
                
                bomRow.supplier = materialInfo.supplier;
                bomRow.supplier_code = materialInfo.supplier_code;
                bomRow.quoteUnit = materialInfo.quote_unit || '';
                bomRow.usage_formula = materialInfo.usage_formula;
                bomRow.min_usage = materialInfo.min_usage;
                
                let usage;
                if (materialInfo.usage_formula) {
                    console.log(`DEBUG_FORMULA: rowType=${bomRow.type}, partNumber=${bomRow.partNumber}, formula=${materialInfo.usage_formula}`);
                    console.log(`DEBUG_FORMULA_BOMROW: bomRow=${bomRow ? 'object' : 'undefined'}, bomRow.length=${bomRow ? bomRow.length : 'N/A'}, bomRow.qty=${bomRow ? bomRow.qty : 'N/A'}`);
                    
                    try {
                        console.log(`DEBUG_FORMULA_TRY_ENTER: entering try block`);
                        const length = Number(bomRow.length) || 0;
                        const qty = Number(bomRow.qty) || 0;
                        const width = Number(bomRow.width) || 0;
                        const thickness = Number(bomRow.thickness) || 0;
                        
                        console.log(`DEBUG_FORMULA_PRE_VARS: type=${bomRow.type}, qty=${qty}, length=${length}, width=${width}, thickness=${thickness}, sets=${sets}`);
                        
                        const vars = { 
                            rowType: bomRow.type,
                            totalQty: qty, 
                            length: length, 
                            width: width, 
                            thickness: thickness, 
                            sets: sets || 1,
                            totalLength: length * qty,
                            totalArea: (length * width / 1000000) * qty
                        };
                        console.log(`DEBUG_FORMULA_VARS: ${JSON.stringify(vars)}`);
                        
                        const formulaResult = this._evaluateFormula(materialInfo.usage_formula, vars);
                        console.log(`DEBUG_FORMULA_RESULT: formulaResult=${formulaResult}`);
                        
                        if (isNaN(formulaResult) || !isFinite(formulaResult)) {
                            console.log(`DEBUG_FORMULA_NAN: formulaResult is NaN or infinite, fallback to default`);
                            usage = this._calculateDefaultUsage(bomRow, sets);
                        } else {
                            usage = formulaResult;
                        }
                    } catch (e) {
                        console.log(`DEBUG_FORMULA_ERROR: error=${e.message}, stack=${e.stack}`);
                        usage = this._calculateDefaultUsage(bomRow, sets);
                    }
                } else {
                    usage = this._calculateDefaultUsage(bomRow, sets);
                    console.log(`DEBUG_DEFAULT_USAGE: rowType=${bomRow.type}, partNumber=${bomRow.partNumber}, usage=${usage}`);
                }
                
                if (materialInfo.min_usage !== undefined && materialInfo.min_usage !== null) {
                    console.log(`DEBUG_MIN_CHECK: usage=${usage}, min_usage=${materialInfo.min_usage}`);
                    if (usage < materialInfo.min_usage) {
                        usage = materialInfo.min_usage;
                        console.log(`DEBUG_MIN_APPLIED: clamped to ${usage}`);
                    }
                }
                
                bomRow.usage = typeof usage === 'number' ? Math.ceil(usage * 100) / 100 : usage;
                console.log(`DEBUG_ROW_OUTPUT: rowType=${bomRow.type}, partNumber=${bomRow.partNumber}, qty=${bomRow.qty}, length=${bomRow.length}, width=${bomRow.width}, final_usage=${bomRow.usage}, quoteUnit=${bomRow.quoteUnit}`);
            } else {
                console.log(`DEBUG_NO_MATERIAL_FOUND: rowType=${bomRow.type}, partNumber=${bomRow.partNumber}, materialMatchKey=${bomRow.materialMatchKey}, materialName=${bomRow.materialNameForMatch}`);
                
                bomRow.supplier = '';
                bomRow.supplier_code = '';
                
                let usage = this._calculateDefaultUsage(bomRow, sets);
                
                if (bomRow.type === 'Metal') {
                    bomRow.quoteUnit = bomRow.unit || '个';
                } else if (bomRow.type === 'SubTable') {
                    bomRow.quoteUnit = '㎡';
                } else {
                    bomRow.quoteUnit = '';
                }
                
                bomRow.usage = typeof usage === 'number' ? Math.ceil(usage * 100) / 100 : usage;
                console.log(`DEBUG_FALLBACK_OUTPUT: rowType=${bomRow.type}, partNumber=${bomRow.partNumber}, qty=${bomRow.qty}, length=${bomRow.length}, width=${bomRow.width}, usage=${bomRow.usage}, quoteUnit=${bomRow.quoteUnit}`);
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
        const groups = {};
        console.log(`DEBUG_GROUP_START: total bomRows=${bomRows.length}`);

        for (const row of bomRows) {
            const key = String(row.materialMatchKey || row.partNumber || 'UNKNOWN');
            if (!row.partNumber || row.partNumber === 'null') {
                continue;
            }
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(row);
        }
        
        console.log(`DEBUG_GROUP_MIDDLE: groups count=${Object.keys(groups).length}`);

        const result = [];
        for (const [key, items] of Object.entries(groups)) {
            const first = items[0];
            
            let totalQty = 0;
            let totalLength = 0;
            let totalArea = 0;
            let totalUsage = 0;
            
            console.log(`DEBUG_GROUP_ITEM_START: key=${key}, partNumber=${first.partNumber}, itemCount=${items.length}`);
            
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const itemArea = (item.length * item.width / 1000000) * item.qty;
                totalQty += item.qty;
                totalLength += item.length * item.qty;
                totalArea += itemArea;
                totalUsage += item.usage || 0;
                
                console.log(`DEBUG_GROUP_ITEM_${i}: partNumber=${item.partNumber}, qty=${item.qty}, length=${item.length}, width=${item.width}, usage=${item.usage}, area=${itemArea}`);
            }
            
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

            let usage = totalUsage;
            console.log(`DEBUG_GROUP_AGGREGATE: partNumber=${first.partNumber}, type=${first.type}, totalQty=${totalQty}, totalUsage=${totalUsage}, totalArea=${totalArea}, quoteUnit=${first.quoteUnit}`);

            const groupedRow = {
                partNumber: first.partNumber,
                name: first.name,
                material: first.material,
                color: first.color,
                type: first.type,
                typeCode: first.typeCode,
                category: first.category,
                spec: spec,
                length: first.length,
                width: first.width,
                thickness: first.thickness,
                totalQty: totalQty,
                unit: first.unit,
                totalLength: typeof totalLength === 'number' ? Math.ceil((totalLength / 1000) * 100) / 100 : totalLength,
                totalArea: typeof totalArea === 'number' ? Math.ceil(totalArea * 100) / 100 : totalArea,
                cabinets: this._sortCabinets([...allCabinets].join(', ')),
                cabinetNames: items.map(i => i.cabinetName).filter(Boolean).join(', '),
                barcode: first.barcode,
                edgeBand: first.edgeBand,
                module: first.module,
                doorCategory: first.doorCategory,
                isDoor: first.isDoor,
                supplier: first.supplier,
                supplier_code: first.supplier_code,
                quoteUnit: first.quoteUnit,
                usage: typeof usage === 'number' ? Math.ceil(usage * 100) / 100 : usage,
                totalUsage: typeof totalUsage === 'number' ? Math.ceil(totalUsage * 100) / 100 : totalUsage
            };
            
            console.log(`DEBUG_GROUP_OUTPUT: partNumber=${groupedRow.partNumber}, final_usage=${groupedRow.usage}, final_totalUsage=${groupedRow.totalUsage}`);
            
            result.push(groupedRow);
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

        console.log(`DEBUG_GROUP_END: total grouped rows=${result.length}`);
        return result;
    }

    _calculateDefaultUsage(bomRow, sets) {
        const rowType = bomRow.type;
        const qty = bomRow.qty;
        const length = bomRow.length || 0;
        const width = bomRow.width || 0;
        
        switch (rowType) {
            case 'Metal':
                return qty * sets;
            case 'Line':
                return (length / 1000) * qty * sets;
            case 'SubTable':
                return (length * width / 1000000) * sets;
            case 'Panel':
            default:
                if (length > 0 && width > 0) {
                    return (length * width / 1000000) * qty;
                }
                return qty * sets;
        }
    }

    _evaluateFormula(formula, vars) {
        console.log(`DEBUG_EVAL_FORMULA_START: formula=${formula}, vars=${JSON.stringify(vars)}`);
        
        let cleaned = formula;
        const matches = formula.match(/\{([^}]+)\}/g);
        console.log(`DEBUG_EVAL_FORMULA_MATCHES: matches=${JSON.stringify(matches)}`);
        
        cleaned = formula.replace(/\{([^}]+)\}/g, (_, expr) => {
            const keys = Object.keys(vars).sort((a, b) => b.length - a.length);
            let replaced = expr;
            console.log(`DEBUG_EVAL_FORMULA_REPLACE: expr=${expr}, initial_replaced=${replaced}`);
            
            for (const key of keys) {
                const regex = new RegExp(`\\b${key}\\b`, 'g');
                const before = replaced;
                replaced = replaced.replace(regex, vars[key]);
                if (before !== replaced) {
                    console.log(`DEBUG_EVAL_FORMULA_KEY_REPLACED: key=${key}, before=${before}, after=${replaced}, value=${vars[key]}`);
                }
            }
            const result = `(${replaced})`;
            console.log(`DEBUG_EVAL_FORMULA_EXPR_RESULT: expr=${expr}, result=${result}`);
            return result;
        });
        
        console.log(`DEBUG_EVAL_FORMULA_CLEANED: cleaned=${cleaned}`);
        const evalResult = this._safeEval(cleaned, vars);
        console.log(`DEBUG_EVAL_FORMULA_FINAL: formula=${formula}, cleaned=${cleaned}, result=${evalResult}`);
        return evalResult;
    }

    _safeEval(expr, vars) {
        const allowedOps = ['+', '-', '*', '/', '%', '(', ')', '.'];
        const sanitized = expr.split('').filter(c => {
            return /[0-9]/.test(c) || allowedOps.includes(c);
        }).join('');
        
        console.log(`DEBUG_SAFE_EVAL: original_expr=${expr}, sanitized=${sanitized}`);
        
        try {
            const result = this._parseExpression(sanitized);
            console.log(`DEBUG_SAFE_EVAL_RESULT: result=${result}`);
            return result;
        } catch (e) {
            console.log(`DEBUG_SAFE_EVAL_ERROR: error=${e.message}`);
            const rowType = vars.rowType;
            const qty = vars.totalQty || 1;
            const sets = vars.sets || 1;
            
            switch (rowType) {
                case 'Metal':
                    console.log(`DEBUG_SAFE_EVAL_FALLBACK: rowType=${rowType}, using qty*sets=${qty}*${sets}`);
                    return qty * sets;
                case 'Line':
                    if (vars.totalLength !== undefined && vars.totalLength !== null && vars.totalLength > 0) {
                        const result = (vars.totalLength / 1000) * sets;
                        console.log(`DEBUG_SAFE_EVAL_FALLBACK: rowType=${rowType}, using totalLength/1000*sets=${vars.totalLength}/1000*${sets}=${result}`);
                        return result;
                    }
                    break;
                case 'SubTable':
                    if (vars.totalArea !== undefined && vars.totalArea !== null && vars.totalArea > 0) {
                        const result = (vars.totalArea / qty) * sets;
                        console.log(`DEBUG_SAFE_EVAL_FALLBACK: rowType=${rowType}, using totalArea/qty*sets=${vars.totalArea}/${qty}*${sets}=${result}`);
                        return result;
                    }
                    break;
                case 'Panel':
                default:
                    if (vars.totalArea !== undefined && vars.totalArea !== null && vars.totalArea > 0) {
                        console.log(`DEBUG_SAFE_EVAL_FALLBACK: rowType=${rowType}, using totalArea=${vars.totalArea}`);
                        return vars.totalArea;
                    }
                    break;
            }
            
            if (vars.totalArea !== undefined && vars.totalArea !== null && vars.totalArea > 0) {
                console.log(`DEBUG_SAFE_EVAL_FALLBACK: using totalArea=${vars.totalArea}`);
                return vars.totalArea;
            }
            if (vars.totalLength !== undefined && vars.totalLength !== null && vars.totalLength > 0) {
                console.log(`DEBUG_SAFE_EVAL_FALLBACK: using totalLength=${vars.totalLength}`);
                return vars.totalLength / 1000;
            }
            console.log(`DEBUG_SAFE_EVAL_FALLBACK: using totalQty=${vars.totalQty}`);
            return vars.totalQty || 0;
        }
    }
    
    _parseExpression(expr) {
        expr = expr.replace(/\s+/g, '');
        
        const tokens = [];
        let num = '';
        
        for (let i = 0; i < expr.length; i++) {
            const c = expr[i];
            
            if (/\d/.test(c) || c === '.') {
                num += c;
            } else {
                if (num) {
                    tokens.push(parseFloat(num));
                    num = '';
                }
                tokens.push(c);
            }
        }
        if (num) {
            tokens.push(parseFloat(num));
        }
        
        return this._parseAdditive(tokens);
    }
    
    _parseAdditive(tokens) {
        let result = this._parseMultiplicative(tokens);
        
        while (tokens.length > 0 && (tokens[0] === '+' || tokens[0] === '-')) {
            const op = tokens.shift();
            const right = this._parseMultiplicative(tokens);
            
            if (op === '+') {
                result += right;
            } else {
                result -= right;
            }
        }
        
        return result;
    }
    
    _parseMultiplicative(tokens) {
        let result = this._parsePrimary(tokens);
        
        while (tokens.length > 0 && (tokens[0] === '*' || tokens[0] === '/' || tokens[0] === '%')) {
            const op = tokens.shift();
            const right = this._parsePrimary(tokens);
            
            if (op === '*') {
                result *= right;
            } else if (op === '/') {
                if (right === 0) {
                    throw new Error('Division by zero');
                }
                result /= right;
            } else {
                result %= right;
            }
        }
        
        return result;
    }
    
    _parsePrimary(tokens) {
        if (tokens.length === 0) {
            throw new Error('Unexpected end of expression');
        }
        
        const token = tokens.shift();
        
        if (typeof token === 'number') {
            return token;
        }
        
        if (token === '(') {
            const result = this._parseAdditive(tokens);
            
            if (tokens.length === 0 || tokens.shift() !== ')') {
                throw new Error('Mismatched parentheses');
            }
            
            return result;
        }
        
        throw new Error(`Unexpected token: ${token}`);
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