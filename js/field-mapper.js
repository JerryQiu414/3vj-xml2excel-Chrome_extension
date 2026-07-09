class FieldMapper {
    constructor(mappingConfig, defaultConfig, productionPlans, processRoutes) {
        this.mapping_config = mappingConfig || {};
        this.default_config = defaultConfig || {};
        this.columns = this.mapping_config.columns || [];
        this.order_info = {};
        
        this.planMatcher = productionPlans ? new PlanMatcher(productionPlans) : null;
        this.routeMatcher = processRoutes ? new ProcessRouteMatcher(processRoutes) : null;
    }

    getColumnNames() {
        return this.columns.map(col => col.name || '');
    }

    _evalUnitCabinetDesc(rowType, rowData, parentData) {
        if (rowType === 'Panel' || rowType === 'Metal') {
            const craftMark = (parentData.CraftMark || '').trim();
            if (craftMark) return craftMark;
            return parentData.Name || '';
        } else if (rowType === 'Line') {
            return rowData.name || '';
        } else if (rowType === 'SubTable') {
            return parentData.name || '';
        }
        return '';
    }

    _evalCabinetNo(rowType, rowData, parentData) {
        if (rowType === 'Panel') {
            const cabinetPanelNo = rowData.CabinetPanelNo || '';
            if (cabinetPanelNo) {
                const parts = cabinetPanelNo.split('-');
                if (parts.length > 0) return parts[0];
            }
            return parentData.CabinetNo || '';
        } else if (rowType === 'Metal') {
            let cabinetNo = parentData.CabinetNo || '';
            if (cabinetNo.includes(';')) {
                const parts = cabinetNo.split(';');
                if (parts.length > 0) return parts[0].trim();
            }
            return cabinetNo;
        } else if (rowType === 'Line') {
            return 'LINE_TEMP';
        } else if (rowType === 'SubTable') {
            return 'SUBTABLE_TEMP';
        }
        return '';
    }

    _evalSystemType(rowType) {
        return rowType === 'Panel' ? '3' : '8';
    }

    _evalCutLength(rowType, rowData) {
        if (rowType === 'Panel') {
            if (rowData.ActualLength !== undefined && rowData.ActualLength !== null) {
                return rowData.ActualLength;
            }
            if (rowData.ActualLength2 !== undefined && rowData.ActualLength2 !== null) {
                return rowData.ActualLength2;
            }
            return rowData.Length || '';
        } else if (rowType === 'Metal') {
            const metal_length = rowData.length !== undefined && rowData.length !== null && rowData.length !== '' ? rowData.length : '';
            if (metal_length === '' || metal_length === '0') {
                const sub_type = rowData.subType || '';
                if (sub_type === 'wooden_tenon') {
                    return rowData.width || '';
                }
            }
            return metal_length;
        } else if (rowType === 'Line') {
            return rowData.width !== undefined && rowData.width !== null && rowData.width !== '' ? rowData.width : '';
        } else if (rowType === 'SubTable') {
            return rowData.width !== undefined && rowData.width !== null && rowData.width !== '' ? rowData.width : '';
        }
        return '';
    }

    _evalCompletedLength(rowType, rowData) {
        if (rowType === 'Panel') {
            return rowData.Length || '';
        } else if (rowType === 'Metal') {
            const metal_length = rowData.length !== undefined && rowData.length !== null && rowData.length !== '' ? rowData.length : '';
            if (metal_length === '' || metal_length === '0') {
                const sub_type = rowData.subType || '';
                if (sub_type === 'wooden_tenon') {
                    return rowData.width || '';
                }
            }
            return metal_length;
        } else if (rowType === 'Line') {
            return rowData.width !== undefined && rowData.width !== null && rowData.width !== '' ? rowData.width : '';
        } else if (rowType === 'SubTable') {
            return rowData.width !== undefined && rowData.width !== null && rowData.width !== '' ? rowData.width : '';
        }
        return '';
    }

    _evalCutWidth(rowType, rowData) {
        if (rowType === 'Panel') {
            if (rowData.ActualWidth !== undefined && rowData.ActualWidth !== null) {
                return rowData.ActualWidth;
            }
            if (rowData.ActualWidth2 !== undefined && rowData.ActualWidth2 !== null) {
                return rowData.ActualWidth2;
            }
            return rowData.Width || '';
        } else if (rowType === 'Metal') {
            return rowData.width !== undefined && rowData.width !== null && rowData.width !== '' ? rowData.width : '';
        } else if (rowType === 'Line') {
            return rowData.depth !== undefined && rowData.depth !== null && rowData.depth !== '' ? rowData.depth : '';
        } else if (rowType === 'SubTable') {
            return rowData.depth !== undefined && rowData.depth !== null && rowData.depth !== '' ? rowData.depth : '';
        }
        return '';
    }

    _evalMaterialDesc1(rowType, rowData, parentData) {
        if (rowType === 'Panel') {
            return (rowData.Material || '') + '+' + (rowData.BasicMaterial || '');
        } else if (rowType === 'Metal') {
            return 'null';
        } else if (rowType === 'Line') {
            return rowData.materialName || '';
        } else if (rowType === 'SubTable') {
            return (parentData.materialName || '') + '+' + (parentData.materialCategoryName || '');
        }
        return '';
    }

    _evalMaterialWCCName(rowType, rowData) {
        return rowType === 'Panel' ? (rowData.BasicMaterialMCode || '') : 'null';
    }

    _evalMaterialGrain(rowType, rowData, parentData) {
        const pData = parentData || {};
        let grain = rowData.Grain || rowData.TextureDirection || rowData.textureDirection || rowData.grain || pData.Grain || pData.TextureDirection || pData.textureDirection || pData.grain || 'N';
        if (grain === 'N') return '0';
        if (grain === 'H') return '2';
        if (grain === 'V') return '1';
        return '0';
    }

    _evalQty(rowType, rowData) {
        if (['Panel', 'Line', 'SubTable'].includes(rowType)) {
            return 1;
        }
        return parseFloat(rowData.Num || 1);
    }

    _evalFrontBarcode(rowType, rowData) {
        if (rowType === 'Panel') {
            const machines = rowData.Machines || {};
            if (machines && typeof machines === 'object' && machines.Machining) {
                return rowData.ID || '';
            }
            return 'null';
        }
        return 'null';
    }

    _evalBackBarcode(rowType, rowData, rowElement) {
        if (rowType === 'Line') return 'null';
        
        let hasFace5 = false;
        let hasFace6 = false;
        
        if (rowElement) {
            const machinings = rowElement.querySelectorAll('Machining');
            machinings.forEach(m => {
                const face = m.getAttribute('Face');
                if (face === '5') hasFace5 = true;
                if (face === '6') hasFace6 = true;
            });
        }
        
        if (hasFace5 && hasFace6) {
            const originalId = rowData.ID || '';
            if (originalId.length >= 17) {
                return originalId.substring(0, 16) + '2' + originalId.substring(17);
            }
            return originalId;
        }
        return '';
    }

    _evalEdgeName(rowType, rowData) {
        if (rowType === 'Panel') {
            return rowData.EdgeThickName || 'null';
        }
        return 'null';
    }

    _evalEdgeThickness(rowType, rowData, rowElement, faceIndex) {
        if (rowType === 'Panel') {
            if (rowElement) {
                const edgeGroups = rowElement.querySelectorAll('EdgeGroup');
                for (const eg of edgeGroups) {
                    const edges = eg.querySelectorAll('Edge');
                    for (const edge of edges) {
                        const face = edge.getAttribute('Face');
                        if (face === String(faceIndex)) {
                            const thickness = edge.getAttribute('Thickness');
                            return thickness && thickness !== '0' ? parseFloat(thickness) : 'null';
                        }
                    }
                }
            }
            return 'null';
        }
        return 'null';
    }

    _evalMaterialDesc2(rowType, rowData) {
        return rowType === 'Panel' ? (rowData.BasicMaterialMCode || '') : 'null';
    }

    _evalPackagingPlan(rowType) {
        return rowType === 'Panel' ? 'GS' : 'null';
    }

    _evalHardwareID(rowType, rowData, parentData) {
        if (rowType === 'Metal') {
            return rowData.PartNumber || '';
        } else if (rowType === 'Line') {
            return rowData.partNumber || '';
        } else if (rowType === 'SubTable') {
            return parentData.partNumber || '';
        }
        return 'null';
    }

    _evalInfo(rowType, rowData, parentData, infoNum) {
        const key = 'info' + infoNum;
        if (rowType === 'Panel') {
            const produceValues = rowData.ProduceValues || {};
            return produceValues[key] || '';
        } else if (rowType === 'Metal') {
            return rowData[key] || '';
        } else if (rowType === 'Line') {
            return rowData[key] || '';
        } else if (rowType === 'SubTable') {
            return parentData[key] || '';
        }
        return '';
    }

    evaluateCustomCode(fieldName, code, rowType, rowData, parentData, rowElement) {
        const codeMap = {
            '单元柜描述': () => this._evalUnitCabinetDesc(rowType, rowData, parentData),
            '分柜号': () => this._evalCabinetNo(rowType, rowData, parentData),
            '系统类型': () => this._evalSystemType(rowType),
            '开料长': () => this._evalCutLength(rowType, rowData),
            '开料宽': () => this._evalCutWidth(rowType, rowData),
            '材料描述1': () => this._evalMaterialDesc1(rowType, rowData, parentData),
            '材质WCC名称': () => this._evalMaterialWCCName(rowType, rowData),
            '材料纹理': () => this._evalMaterialGrain(rowType, rowData, parentData),
            '完工长': () => this._evalCompletedLength(rowType, rowData),
            '数量': () => this._evalQty(rowType, rowData),
            '正面条码': () => this._evalFrontBarcode(rowType, rowData),
            '反面条码': () => this._evalBackBarcode(rowType, rowData, rowElement),
            '封边1WCC名称': () => this._evalEdgeName(rowType, rowData),
            '封边2WCC名称': () => this._evalEdgeName(rowType, rowData),
            '封边3WCC名称': () => this._evalEdgeName(rowType, rowData),
            '封边4WCC名称': () => this._evalEdgeName(rowType, rowData),
            '封边1厚度': () => this._evalEdgeThickness(rowType, rowData, rowElement, 1),
            '封边2厚度': () => this._evalEdgeThickness(rowType, rowData, rowElement, 2),
            '封边3厚度': () => this._evalEdgeThickness(rowType, rowData, rowElement, 3),
            '封边4厚度': () => this._evalEdgeThickness(rowType, rowData, rowElement, 4),
            '材料描述2': () => this._evalMaterialDesc2(rowType, rowData),
            '包装方案': () => this._evalPackagingPlan(rowType),
            '五金ID': () => this._evalHardwareID(rowType, rowData, parentData),
            '信息1': () => this._evalInfo(rowType, rowData, parentData, 1),
            '信息2': () => this._evalInfo(rowType, rowData, parentData, 2),
            '信息3': () => this._evalInfo(rowType, rowData, parentData, 3),
            '信息4': () => this._evalInfo(rowType, rowData, parentData, 4)
        };

        if (codeMap[fieldName]) {
            return codeMap[fieldName]();
        }

        return '';
    }

    getMappingValue(mappingType, mappingPath, rowType, rowData, parentData) {
        if (mappingType === 'order_info') {
            const pathParts = mappingPath.replace('order_info.', '').split('.');
            return this.traversePath(this.order_info, pathParts);
        }

        if (mappingType === 'parent') {
            const pathParts = mappingPath.replace('parent.', '').split('.');
            return this.traversePath(parentData, pathParts);
        }

        if (mappingType === 'row') {
            const pathParts = mappingPath.replace('row.', '').split('.');
            return this.traversePath(rowData, pathParts);
        }

        if (mappingType === 'config') {
            return this.default_config[mappingPath] || '';
        }

        return '';
    }

    traversePath(data, pathParts) {
        let result = data;
        for (const part of pathParts) {
            if (result && typeof result === 'object' && part in result) {
                result = result[part];
            } else {
                return '';
            }
        }
        return result;
    }

    mapRow(rowType, rowData, parentData, rowElement, orderInfo) {
        this.order_info = orderInfo;
        const rowResult = {};

        for (const col of this.columns) {
            const colName = col.name;
            let mapping = col.mapping;
            const dataType = col.data_type || 'string';
            const defaultValue = col.default_value || '';

            const typeMappings = col.type_mappings || {};
            if (typeMappings[rowType]) {
                mapping = typeMappings[rowType];
            }

            let value;
            if (!mapping) {
                value = defaultValue;
            } else if (mapping === 'custom_code') {
                const code = col.custom_code || '';
                value = this.evaluateCustomCode(col.name, code, rowType, rowData, parentData, rowElement);
            } else if (mapping === 'config') {
                const configKey = col.config_key || '';
                value = this.default_config[configKey] || '';
            } else if (mapping === 'plan_matcher') {
                if (this.planMatcher) {
                    value = this.planMatcher.matchPlan(rowType, rowData, parentData);
                } else {
                    value = 'DEFAULT_PLAN';
                }
            } else if (mapping === 'route_matcher') {
                if (this.routeMatcher) {
                    const routeData = Object.assign({}, rowData, { type: rowType });
                    value = this.routeMatcher.matchRoute(routeData, rowElement);
                } else {
                    value = 'DEFAULT_ROUTE';
                }
            } else if (typeof mapping === 'string' && mapping.startsWith('custom:')) {
                value = mapping.split(':', 1)[1];
            } else if (typeof mapping === 'string') {
                const mappingType = mapping.split('.')[0];
                value = this.getMappingValue(mappingType, mapping, rowType, rowData, parentData);
            } else {
                value = defaultValue;
            }

            if (value === '' && defaultValue !== '') {
                value = defaultValue;
            }

            if (colName !== '信息1' && colName !== '信息2' && colName !== '信息3' && colName !== '信息4') {
                value = this.convertType(value, dataType);
            }

            const decimalPlaces = col.decimal_places;
            if (decimalPlaces !== undefined && typeof value === 'number') {
                value = Math.round(value * Math.pow(10, decimalPlaces)) / Math.pow(10, decimalPlaces);
            }

            rowResult[colName] = value;
        }

        rowResult['_row_type'] = rowType;
        rowResult['_parent_id'] = parentData['Id'] || parentData['id'] || '';
        rowResult['_row_id'] = rowData['Id'] || rowData['id'] || rowData['realUID'] || '';

        return this.postProcess(rowResult);
    }

    _columnLetterToIndex(columnLetter) {
        let result = 0;
        for (const char of columnLetter.toUpperCase()) {
            result = result * 26 + (char.charCodeAt(0) - 'A'.charCodeAt(0) + 1);
        }
        return result - 1;
    }

    _getFieldNameByColumn(columnLetter) {
        const index = this._columnLetterToIndex(columnLetter);
        if (index >= 0 && index < this.columns.length) {
            return this.columns[index].name;
        }
        return null;
    }

    postProcess(rowResult) {
        const rules = this.mapping_config.post_process_rules || {};

        for (const [ruleKey, ruleConfig] of Object.entries(rules)) {
            const enabled = ruleConfig.enabled;
            if (!enabled) continue;

            const ruleType = ruleConfig.rule_type;

            if (ruleType === 'conditional_replace') {
                const sourceCol = ruleConfig.source_column;
                const targetCol = ruleConfig.target_column;
                const matchPatterns = ruleConfig.match_patterns || [];
                const originalValue = ruleConfig.original_value;
                const newValue = ruleConfig.new_value;
                const matchType = ruleConfig.match_type || 'contains';

                const sourceField = this._getFieldNameByColumn(sourceCol);
                const targetField = this._getFieldNameByColumn(targetCol);

                if (sourceField && targetField && sourceField in rowResult && targetField in rowResult) {
                    const sourceValue = String(rowResult[sourceField]);
                    const targetValue = String(rowResult[targetField]);

                    if (targetValue === originalValue) {
                        let matchFound = false;
                        for (const pattern of matchPatterns) {
                            if (matchType === 'contains' && sourceValue.includes(pattern)) {
                                matchFound = true;
                                break;
                            } else if (matchType === 'startswith' && sourceValue.startsWith(pattern)) {
                                matchFound = true;
                                break;
                            } else if (matchType === 'endswith' && sourceValue.endsWith(pattern)) {
                                matchFound = true;
                                break;
                            }
                        }

                        if (matchFound) {
                            rowResult[targetField] = newValue;
                        }
                    }
                }

                continue;
            }

            let columnLetters = ruleConfig.column_letters || [];
            if (!columnLetters.length) {
                const columnLetter = ruleConfig.column_letter;
                if (columnLetter) {
                    columnLetters = [columnLetter];
                }
            }

            const fieldNames = [];
            for (const colLetter of columnLetters) {
                const fieldName = this._getFieldNameByColumn(colLetter);
                if (fieldName) {
                    fieldNames.push(fieldName);
                }
            }

            for (const fieldName of fieldNames) {
                if (!(fieldName in rowResult)) continue;

                if (ruleType === 'suffix_remove') {
                    const suffixes = ruleConfig.suffixes_to_remove || [];
                    rowResult[fieldName] = this._cleanupPartNumber(rowResult[fieldName], suffixes);
                } else if (ruleType === 'empty_replace') {
                    const defaultValue = ruleConfig.default_value || 'null';
                    if (!rowResult[fieldName] || rowResult[fieldName] === '') {
                        rowResult[fieldName] = defaultValue;
                    }
                }
            }
        }

        return rowResult;
    }

    _cleanupPartNumber(partNumber, suffixes) {
        if (!partNumber) return partNumber;
        const str = String(partNumber);
        for (const suffix of suffixes) {
            if (str.endsWith(suffix)) {
                return str.substring(0, str.length - suffix.length);
            }
        }
        return str;
    }

    convertType(value, dataType) {
        if (value === null || value === '') {
            if (dataType === 'number') return 0;
            if (dataType === 'string') return 'null';
            return '';
        }

        try {
            if (dataType === 'number') {
                const num = parseFloat(value);
                if (Number.isInteger(num)) return Math.round(num);
                return num;
            } else if (dataType === 'date') {
                return String(value).replace(/-/g, '/');
            } else if (dataType === 'string') {
                return String(value);
            }
        } catch (e) {
            return String(value);
        }

        return value;
    }
}