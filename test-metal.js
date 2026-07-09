const fs = require('fs');
const xmlString = fs.readFileSync('d:/3vj-XML2EXCEL-chrome/MS9992600219KZ02-生产XML.xml', 'utf-8');

const fieldMapping = JSON.parse(fs.readFileSync('./config/field_mapping.json', 'utf-8'));
const bomRules = JSON.parse(fs.readFileSync('./config/bom_rules.json', 'utf-8'));
const materialData = fs.readFileSync('./config/material_data.json', 'utf-8').split('\n').filter(line => line.trim()).map(line => JSON.parse(line));

class XMLParser {
    constructor(config) {
        this.config = config || {};
        this.order_info = {};
        this.parent_map = new Map();
    }
    parse(xmlString) {
        const parser = new (require('xmldom').DOMParser)();
        const doc = parser.parseFromString(xmlString, 'application/xml');
        const root = doc.documentElement;
        this.buildParentMap(root);
        this.extractOrderInfo(root);
        return this.getAllRowElements(root);
    }
    buildParentMap(root) {
        this.parent_map = new Map();
        const stack = [[root, null]];
        while (stack.length > 0) {
            const [node, parent] = stack.pop();
            this.parent_map.set(node, parent);
            const children = Array.from(node.childNodes).filter(n => n.nodeType === 1).reverse();
            for (const child of children) {
                stack.push([child, node]);
            }
        }
    }
    extractOrderInfo(root) {
        const orderInfoSource = this.config.order_info_source || './/Cabinet[1]';
        let cabinetElem = null;
        try {
            const xpath = require('xpath');
            const elements = xpath.select(orderInfoSource, root);
            cabinetElem = elements[0];
        } catch (e) {}
        if (!cabinetElem) {
            const cabinets = root.getElementsByTagName('Cabinet');
            cabinetElem = cabinets[0];
        }
        if (cabinetElem) {
            this.order_info = this._elementToDict(cabinetElem);
        }
        return this.order_info;
    }
    _elementToDict(element) {
        const result = {};
        for (let i = 0; i < element.attributes.length; i++) {
            result[element.attributes[i].name] = element.attributes[i].value;
        }
        for (const child of element.childNodes) {
            if (child.nodeType === 1) {
                if (child.childNodes.length === 0 || child.childNodes.every(n => n.nodeType !== 1)) {
                    result[child.tagName] = child.textContent;
                } else {
                    result[child.tagName] = this._elementToDict(child);
                }
            }
        }
        return result;
    }
    extractParentData(rowElement, rowType) {
        const parentElem = this.findParentNode(rowElement, rowType);
        if (parentElem) {
            return this._elementToDict(parentElem);
        }
        return {};
    }
    findParentNode(element, rowType) {
        const sources = this.config.row_data_sources || {};
        const sourceConfig = sources[rowType] || {};
        if (sourceConfig.parent_xpath) {
            try {
                const xpath = require('xpath');
                const doc = element.ownerDocument || element;
                const result = xpath.select(sourceConfig.parent_xpath, doc);
                for (const node of result) {
                    if (node.contains && node.contains(element)) {
                        return node;
                    }
                }
            } catch (e) {}
        }
        return this.parent_map.get(element);
    }
    getAllRowElements(root) {
        const rowData = [];
        const sources = this.config.row_data_sources || {};
        const xpath = require('xpath');
        for (const [rowType, sourceConfig] of Object.entries(sources)) {
            const xpathExpr = typeof sourceConfig === 'string' ? sourceConfig : sourceConfig.xpath;
            try {
                const elements = xpath.select(xpathExpr, root);
                for (const element of elements) {
                    rowData.push({
                        type: rowType,
                        data: this._elementToDict(element),
                        parent_data: this.extractParentData(element, rowType),
                        element: element
                    });
                }
            } catch (e) {}
        }
        return rowData;
    }
}

class BOMConverter {
    constructor() {
        this.fieldMapping = fieldMapping;
        this.bomRules = bomRules;
        this.materialData = materialData;
        this.xmlParser = new XMLParser({
            row_data_sources: bomRules.data_sources || bomRules.row_data_sources,
            order_info_source: bomRules.order_info_source
        });
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
    _calculateDefaultUsage(bomRow, sets) {
        const rowType = bomRow.type;
        const qty = bomRow.qty;
        const length = bomRow.length || 0;
        const width = bomRow.width || 0;
        switch (rowType) {
            case 'Metal': return qty * sets;
            case 'Line': return (length / 1000) * qty * sets;
            case 'SubTable': return (length * width / 1000000) * sets;
            case 'Panel': return (length * width / 1000000) * qty;
            default: return qty * sets;
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
        const allowedOps = ['+', '-', '*', '/', '%', '(', ')', '.', ',', '>', '<', '=', '!'];
        const sanitized = expr.split('').filter(c => {
            return /[a-zA-Z0-9]/.test(c) || allowedOps.includes(c);
        }).join('');
        const keys = Object.keys(vars);
        const values = keys.map(k => vars[k]);
        console.log(`DEBUG_SAFE_EVAL: original_expr=${expr}, sanitized=${sanitized}, keys=${keys.join(',')}, values=${values.join(',')}`);
        try {
            const fn = new (Function.prototype.bind.apply(Function, [null, ...keys, `return ${sanitized};`]))();
            const result = fn(...values);
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
                    return (vars.totalLength / 1000) * sets;
                case 'SubTable':
                    return (vars.totalArea / qty) * sets;
                case 'Panel':
                    return vars.totalArea;
                default:
                    return qty * sets;
            }
        }
    }
    async convert(xmlString) {
        const rows = this.xmlParser.parse(xmlString);
        const orderInfo = this.xmlParser.order_info;
        const bomRows = [];
        const fieldMappings = this.bomRules.field_mappings || {};
        for (const row of rows) {
            const rowType = row.type;
            const rowData = row.data;
            const parentData = row.parent_data;
            const mappings = fieldMappings[rowType] || {};
            const originalPartNumber = this._extractField(rowData, parentData, mappings.partNumber);
            const basicMaterialMCode = this._extractField(rowData, parentData, ['BasicMaterialMCode', 'BasicMaterialCode']);
            const rawQty = this._extractField(rowData, parentData, mappings.qty);
            const parsedQty = parseInt(rawQty);
            const finalQty = parsedQty || 1;
            const rawLength = this._extractField(rowData, parentData, mappings.length);
            const parsedLength = parseFloat(rawLength);
            const finalLength = parsedLength || 0;
            const rawWidth = this._extractField(rowData, parentData, mappings.width);
            const parsedWidth = parseFloat(rawWidth);
            const finalWidth = parsedWidth || 0;
            console.log(`DEBUG_INPUT: rowType=${rowType}, partNumber=${originalPartNumber}, rawQty=${rawQty}, finalQty=${finalQty}, rawLength=${rawLength}, finalLength=${finalLength}`);
            const bomRow = {
                type: rowType,
                partNumber: originalPartNumber,
                materialMatchKey: basicMaterialMCode,
                length: finalLength,
                width: finalWidth,
                qty: finalQty
            };
            let matchKey = bomRow.materialMatchKey || bomRow.partNumber;
            if (matchKey) {
                const suffixes = ['TZ', 'Z', 'T'];
                for (const suffix of suffixes) {
                    if (matchKey.endsWith(suffix)) {
                        matchKey = matchKey.substring(0, matchKey.length - suffix.length);
                        break;
                    }
                }
            }
            console.log(`DEBUG_MATCH_KEY: matchKey=${matchKey}, partNumber=${bomRow.partNumber}, materialMatchKey=${bomRow.materialMatchKey}`);
            let materialInfo = this.materialMap[matchKey];
            if (materialInfo) {
                console.log(`DEBUG_MATCH_SUCCESS: part_number=${materialInfo.part_number}, usage_formula=${materialInfo.usage_formula}`);
                const sets = this.bomRules.sets || 1;
                if (materialInfo.usage_formula) {
                    const vars = { 
                        rowType: bomRow.type,
                        totalQty: bomRow.qty, 
                        length: bomRow.length, 
                        width: bomRow.width, 
                        sets,
                        totalLength: bomRow.length * bomRow.qty,
                        totalArea: (bomRow.length * bomRow.width / 1000000) * bomRow.qty
                    };
                    console.log(`DEBUG_FORMULA_VARS: ${JSON.stringify(vars)}`);
                    try {
                        const usage = this._evaluateFormula(materialInfo.usage_formula, vars);
                        console.log(`DEBUG_USAGE_RESULT: usage=${usage}`);
                        bomRow.usage = Math.ceil(usage * 100) / 100;
                    } catch (e) {
                        console.log(`DEBUG_FORMULA_ERROR: ${e.message}`);
                    }
                }
            }
            if (rowType === 'Metal' && originalPartNumber === 'GRHH030000101') {
                console.log('FINAL RESULT:', JSON.stringify(bomRow, null, 2));
            }
        }
    }
}

const converter = new BOMConverter();
converter.convert(xmlString);