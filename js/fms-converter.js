class FMSConverter {
    constructor(xmlParser, fieldMapper) {
        this.xmlParser = xmlParser;
        this.fieldMapper = fieldMapper;
    }

    async convert(xmlString) {
        const rowElements = this.xmlParser.parse(xmlString);
        const orderInfo = this.xmlParser.order_info;
        
        let rows = [];
        const stats = { Panel: 0, Metal: 0, Line: 0, SubTable: 0 };

        for (const rowElem of rowElements) {
            const rowType = rowElem.type;
            const rowData = rowElem.data;
            const parentData = rowElem.parent_data || rowElem.parentData || {};
            const element = rowElem.element;

            const partNumber = rowData['PartNumber'] || rowData['partNumber'] || parentData['PartNumber'] || parentData['partNumber'] || '';
            if (!partNumber || partNumber === '' || partNumber === 'null') {
                continue;
            }

            const mappedRow = this.fieldMapper.mapRow(
                rowType, 
                rowData, 
                parentData, 
                element, 
                orderInfo
            );

            rows.push(mappedRow);
            stats[rowType] = (stats[rowType] || 0) + 1;
        }

        rows = this._mergeMetalRows(rows);
        rows = this._processCabinetNumbers(rows);

        return {
            rows,
            orderInfo,
            stats,
            totalRowCount: rows.length
        };
    }

    _mergeMetalRows(data) {
        const metalMergeRule = this.fieldMapper.mapping_config?.post_process_rules?.['Metal数据合并'];
        if (!metalMergeRule || !metalMergeRule.enabled) {
            return data;
        }

        const removeSuffixes = metalMergeRule.remove_suffixes || ['TZ', 'Z', 'T'];
        const requireHardwareType = metalMergeRule.require_hardware_type;
        const hardwareTypeValue = metalMergeRule.hardware_type_value || 'hardware';

        const metalRows = [];
        const nonMetalRows = [];

        for (const row of data) {
            if (row['_row_type'] === 'Metal') {
                metalRows.push(row);
            } else {
                nonMetalRows.push(row);
            }
        }

        console.log(`DEBUG_METAL_MERGE: metalRows=${metalRows.length}, nonMetalRows=${nonMetalRows.length}`);
        
        if (metalRows.length > 0) {
            console.log(`DEBUG_METAL_MERGE_ROW0_KEYS: ${Object.keys(metalRows[0]).slice(0, 20).join(', ')}`);
            console.log(`DEBUG_METAL_MERGE_ROW0: ${JSON.stringify(metalRows[0], null, 2).slice(0, 500)}`);
        }

        const mergedMap = {};

        for (const row of metalRows) {
            if (requireHardwareType) {
                const type = row['type'] || row['subType'] || row['五金类型'] || '';
                if (type !== hardwareTypeValue) {
                    console.log(`DEBUG_METAL_MERGE_SKIP: partNumber=${row['编号']||row['PartNumber']}, type=${type}, expected=${hardwareTypeValue}`);
                    nonMetalRows.push(row);
                    continue;
                }
            } else {
                console.log(`DEBUG_METAL_MERGE_NO_TYPE_CHECK: partNumber=${row['编号']||row['PartNumber']}`);
            }

            let partNumber = row['单个部件名称'] || row['编号'] || row['PartNumber'] || row['partNumber'] || '';
            
            for (const suffix of removeSuffixes) {
                if (partNumber.endsWith(suffix)) {
                    partNumber = partNumber.substring(0, partNumber.length - suffix.length);
                    break;
                }
            }

            if (!partNumber) {
                nonMetalRows.push(row);
                continue;
            }

            const length = row['开料长'] || row['length'] || row['Length'] || '';
            const width = row['开料宽'] || row['width'] || row['Width'] || '';
            const height = row['完工厚'] || row['完工高'] || row['height'] || row['Height'] || '';
            const cabinetName = row['单元柜描述'] || row['cabinetName'] || row['CabinetName'] || '';

            const mergeKey = `${partNumber}_${length}_${width}_${height}_${cabinetName}`;

            console.log(`DEBUG_METAL_MERGE_ROW: partNumber=${partNumber}, length=${length}, width=${width}, height=${height}, cabinet=${cabinetName}, key=${mergeKey}, qty=${row['数量']}`);

            if (!mergedMap[mergeKey]) {
                mergedMap[mergeKey] = { ...row };
                mergedMap[mergeKey]['数量'] = parseFloat(row['数量'] || 0);
            } else {
                mergedMap[mergeKey]['数量'] += parseFloat(row['数量'] || 0);
                console.log(`DEBUG_METAL_MERGE_MERGED: key=${mergeKey}, newQty=${mergedMap[mergeKey]['数量']}`);
            }
        }

        console.log(`DEBUG_METAL_MERGE_RESULT: mergedRows=${Object.keys(mergedMap).length}, totalRows=${nonMetalRows.length + Object.keys(mergedMap).length}`);

        return [...nonMetalRows, ...Object.values(mergedMap)];
    }

    _processCabinetNumbers(data) {
        const cabinetNumbers = new Set();
        
        for (const row of data) {
            const cabNo = row['分柜号'] || '';
            if (cabNo && cabNo !== 'LINE_TEMP' && cabNo !== 'SUBTABLE_TEMP') {
                const num = parseInt(cabNo, 10);
                if (!isNaN(num)) {
                    cabinetNumbers.add(num);
                }
            }
        }
        
        const maxCabinetNo = cabinetNumbers.size > 0 ? Math.max(...cabinetNumbers) : 0;
        
        const subtableGroups = {};
        for (const row of data) {
            if (row['_row_type'] === 'SubTable') {
                const parentId = row['_parent_id'] || '';
                if (!subtableGroups[parentId]) {
                    subtableGroups[parentId] = [];
                }
                subtableGroups[parentId].push(row);
            }
        }
        
        let subtableCabinetNo = maxCabinetNo + 1;
        for (const parentId in subtableGroups) {
            for (const row of subtableGroups[parentId]) {
                row['分柜号'] = String(subtableCabinetNo);
            }
            subtableCabinetNo++;
        }
        
        let lineCabinetNo = subtableCabinetNo;
        for (const row of data) {
            if (row['_row_type'] === 'Line') {
                row['分柜号'] = String(lineCabinetNo);
                lineCabinetNo++;
            }
        }
        
        for (const row of data) {
            delete row['_row_type'];
            delete row['_parent_id'];
            delete row['_row_id'];
        }
        
        return data;
    }
}