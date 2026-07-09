class XMLParser {
    constructor(config) {
        this.config = config || {};
        this.order_info = {};
        this.parent_map = new Map();
    }

    parse(xmlString) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlString, 'application/xml');
        
        const parseError = doc.querySelector('parsererror');
        if (parseError) {
            console.error('XML解析错误:', parseError.textContent);
        }
        
        const root = doc.documentElement;
        console.log('XML根节点:', root.tagName);
        console.log('子节点数:', root.children.length);
        
        for (let i = 0; i < root.children.length; i++) {
            console.log('子节点', i + 1, ':', root.children[i].tagName);
        }
        
        const cabinetElements = root.getElementsByTagName('Cabinet');
        console.log('直接查找Cabinet元素数量:', cabinetElements.length);
        
        const panelElements = root.getElementsByTagName('Panel');
        console.log('直接查找Panel元素数量:', panelElements.length);
        
        this.buildParentMap(root);
        this.extractOrderInfo(root);
        return this.getAllRowElements(root);
    }

    parseXml(xmlString) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlString, 'application/xml');
        const root = doc.documentElement;
        this.buildParentMap(root);
        return root;
    }

    buildParentMap(root) {
        this.parent_map = new Map();
        const stack = [[root, null]];
        while (stack.length > 0) {
            const [node, parent] = stack.pop();
            this.parent_map.set(node, parent);
            const children = Array.from(node.children).reverse();
            for (const child of children) {
                stack.push([child, node]);
            }
        }
    }

    extractOrderInfo(root) {
        const orderInfoSource = this.config.order_info_source || './/Cabinet[1]';
        console.log('order_info_source:', orderInfoSource);
        
        let cabinetElem = null;
        
        try {
            const elements = this._queryXPath(root, orderInfoSource);
            cabinetElem = elements[0];
            console.log('XPath找到Cabinet元素:', !!cabinetElem);
        } catch (e) {
            console.error('XPath查询失败，尝试getElementsByTagName:', e);
        }
        
        if (!cabinetElem) {
            const cabinets = root.getElementsByTagName('Cabinet');
            cabinetElem = cabinets[0];
            console.log('getElementsByTagName找到Cabinet元素:', !!cabinetElem);
        }
        
        if (cabinetElem) {
            this.order_info = this._elementToDict(cabinetElem);
            console.log('order_info:', this.order_info);
        }
        return this.order_info;
    }

    _elementToDict(element) {
        const result = {};
        for (const attr of element.attributes) {
            result[attr.name] = attr.value;
        }
        
        for (const child of element.children) {
            if (child.children.length === 0) {
                result[child.tagName] = child.textContent;
            } else {
                result[child.tagName] = this._elementToDict(child);
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
                const doc = element.ownerDocument || element;
                const result = doc.evaluate(sourceConfig.parent_xpath, element, null, XPathResult.ANY_TYPE, null);
                let node = result.iterateNext();
                while (node) {
                    if (node.contains(element)) {
                        return node;
                    }
                    node = result.iterateNext();
                }
            } catch (e) {
                console.error('parent_xpath查询错误:', sourceConfig.parent_xpath, e);
            }
        }

        const parentTags = {
            'Panel': 'Cabinet',
            'Metal': 'Cabinet',
            'Line': 'baseLine',
            'SubTable': 'Table'
        };

        const targetTag = parentTags[rowType];
        if (!targetTag) {
            return null;
        }

        let current = element;
        while (current) {
            const parent = this.parent_map.get(current);
            if (!parent) {
                return null;
            }

            if (parent.tagName === targetTag) {
                return parent;
            }

            current = parent;
        }

        return null;
    }

    extractRowData(rowElement) {
        return this._elementToDict(rowElement);
    }

    getAllRowElements(root) {
        const rowData = [];
        const sources = this.config.row_data_sources || {};
        
        console.log('row_data_sources:', sources);

        for (const [rowType, xpath] of Object.entries(sources)) {
            console.log(`查询 ${rowType}, XPath: ${xpath}`);
            
            let elements = [];
            
            try {
                elements = this._queryXPath(root, xpath);
                console.log(`XPath找到 ${elements.length} 个 ${rowType} 元素`);
            } catch (e) {
                console.error('XPath查询失败:', e);
            }
            
            if (elements.length === 0) {
                let tagName = xpath.split('/').pop();
                tagName = tagName.replace(/\[.*?\]/g, '');
                console.log(`XPath未找到，尝试getElementsByTagName: ${tagName}`);
                elements = Array.from(root.getElementsByTagName(tagName));
                console.log(`getElementsByTagName找到 ${elements.length} 个 ${rowType} 元素`);
                
                if (rowType === 'Line') {
                    elements = elements.filter(elem => {
                        let parent = elem.parentNode;
                        while (parent) {
                            if (parent.tagName === 'baseLine') {
                                return true;
                            }
                            parent = parent.parentNode;
                        }
                        return false;
                    });
                    console.log(`过滤后找到 ${elements.length} 个 ${rowType} 元素`);
                }
            }
            
            for (const elem of elements) {
                rowData.push({
                    'type': rowType,
                    'element': elem,
                    'data': this.extractRowData(elem),
                    'parent_data': this.extractParentData(elem, rowType)
                });
            }
        }

        console.log('总行数:', rowData.length);
        return rowData;
    }

    _queryXPath(root, xpath) {
        try {
            const doc = root.ownerDocument || root;
            const result = doc.evaluate(xpath, root, null, XPathResult.ANY_TYPE, null);
            const nodes = [];
            let node = result.iterateNext();
            while (node) {
                nodes.push(node);
                node = result.iterateNext();
            }
            return nodes;
        } catch (e) {
            console.error('XPath查询错误:', xpath, e);
            return [];
        }
    }
}