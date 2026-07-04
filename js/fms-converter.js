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

        rows = this._processCabinetNumbers(rows);

        return {
            rows,
            orderInfo,
            stats,
            totalRowCount: rows.length
        };
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