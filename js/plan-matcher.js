class PlanMatcher {
    constructor(plansConfig) {
        this.plans = plansConfig ? plansConfig.plans || [] : [];
        this.plans.sort((a, b) => (a.priority || 999) - (b.priority || 999));
    }

    matchPlan(rowType, rowData, parentData) {
        if (!this.plans.length) {
            return 'DEFAULT_PLAN';
        }

        for (const plan of this.plans) {
            const planCode = plan.code || '';
            const rules = plan.rules || [];

            if (!rules.length) continue;

            const rulesLogic = plan.rulesLogic || 'OR';

            if (rulesLogic === 'OR') {
                for (const rule of rules) {
                    if (this._matchRule(rule, rowType, rowData, parentData)) {
                        return planCode;
                    }
                }
            } else {
                let allMatched = true;
                for (const rule of rules) {
                    if (!this._matchRule(rule, rowType, rowData, parentData)) {
                        allMatched = false;
                        break;
                    }
                }
                if (allMatched) {
                    return planCode;
                }
            }
        }

        return 'DEFAULT_PLAN';
    }

    _matchRule(rule, rowType, rowData, parentData) {
        const matchType = rule.matchType || '';

        if (matchType === 'Panel' && rowType !== 'Panel') return false;
        if (matchType === 'Metal' && rowType !== 'Metal') return false;
        if (matchType === 'Line' && rowType !== 'Line') return false;
        if (matchType === 'SubTable' && rowType !== 'SubTable') return false;

        const expression = rule.expression || '';
        if (!expression) return false;

        return this._evaluateExpression(expression, rowData, parentData);
    }

    _evaluateExpression(expression, data, parentData) {
        const conditions = expression.split('||');

        for (let condition of conditions) {
            condition = condition.trim();
            if (!condition) continue;

            if (condition.includes('&&')) {
                const subConditions = condition.split('&&');
                let allMatch = true;
                for (let subCond of subConditions) {
                    subCond = subCond.trim();
                    if (!this._checkSingleCondition(subCond, data, parentData)) {
                        allMatch = false;
                        break;
                    }
                }
                if (allMatch) return true;
            } else {
                if (this._checkSingleCondition(condition, data, parentData)) {
                    return true;
                }
            }
        }

        return false;
    }

    _checkSingleCondition(condition, data, parentData) {
        condition = condition.trim();
        if (!condition) return false;

        let match = condition.match(/(.+?)(==|<>=|<=|>=|<|>)(.+)/);
        if (!match) {
            match = condition.match(/(.+?)(=)(.+)/);
            if (match) {
                const fieldPath = match[1].trim();
                const valueStr = match[3].trim();
                return this._compareField(fieldPath, '==', valueStr, data, parentData);
            }
            return false;
        }

        const fieldPath = match[1].trim();
        const operator = match[2];
        const valueStr = match[3].trim();

        return this._compareField(fieldPath, operator, valueStr, data, parentData);
    }

    _compareField(fieldPath, operator, valueStr, data, parentData) {
        if (valueStr === '*') {
            const actualValue = this._getFieldValue(fieldPath, data, parentData);
            return actualValue !== '';
        }

        const actualValue = this._getFieldValue(fieldPath, data, parentData);
        const expectedValue = this._parseValue(valueStr);

        if (actualValue.includes(',')) {
            const values = actualValue.split(',');
            for (const val of values) {
                if (this._compareValues(val.trim(), operator, expectedValue)) {
                    return true;
                }
            }
            return false;
        }

        return this._compareValues(actualValue, operator, expectedValue);
    }

    _getFieldValue(fieldPath, data, parentData) {
        fieldPath = fieldPath.trim();

        let dataSource = data;
        let pathParts;

        if (fieldPath.startsWith('Panel.')) {
            pathParts = fieldPath.slice(6).split('.');
        } else if (fieldPath.startsWith('Metal.')) {
            pathParts = fieldPath.slice(6).split('.');
        } else if (fieldPath.startsWith('Line.')) {
            pathParts = fieldPath.slice(5).split('.');
        } else if (fieldPath.startsWith('SubTable.')) {
            pathParts = fieldPath.slice(9).split('.');
        } else if (fieldPath.startsWith('parent.')) {
            pathParts = fieldPath.slice(7).split('.');
            dataSource = parentData;
        } else {
            pathParts = fieldPath.split('.');
        }

        let sliceEnd = null;
        const sliceMatch = pathParts[pathParts.length - 1].match(/\[:(\d+)\]/);
        if (sliceMatch) {
            pathParts[pathParts.length - 1] = pathParts[pathParts.length - 1].slice(0, sliceMatch.index);
            sliceEnd = parseInt(sliceMatch[1], 10);
        }

        let value = dataSource;
        for (let i = 0; i < pathParts.length; i++) {
            const part = pathParts[i];
            if (Array.isArray(value)) {
                const matchedItems = [];
                for (const item of value) {
                    if (typeof item === 'object' && item !== null && part in item) {
                        matchedItems.push(item[part]);
                    }
                }
                if (matchedItems.length > 0) {
                    value = matchedItems.length === 1 ? matchedItems[0] : matchedItems;
                } else {
                    return '';
                }
            } else if (typeof value === 'object' && value !== null && part in value) {
                value = value[part];
            } else {
                return '';
            }
        }

        if (Array.isArray(value)) {
            value = value.join(',');
        }

        value = value !== null && value !== undefined ? String(value) : '';

        if (sliceEnd !== null) {
            value = value.slice(0, sliceEnd);
        }

        return value;
    }

    _parseValue(valueStr) {
        valueStr = valueStr.trim();

        if ((valueStr.startsWith("'") && valueStr.endsWith("'")) ||
            (valueStr.startsWith('"') && valueStr.endsWith('"'))) {
            return valueStr.slice(1, -1);
        }

        return valueStr;
    }

    _compareValues(actual, operator, expected) {
        actual = actual.trim();
        expected = expected.trim();

        const actualNum = parseFloat(actual);
        const expectedNum = parseFloat(expected);

        if (!isNaN(actualNum) && !isNaN(expectedNum)) {
            switch (operator) {
                case '==':
                case '=':
                    return actualNum === expectedNum;
                case '<>':
                    return actualNum !== expectedNum;
                case '<':
                    return actualNum < expectedNum;
                case '>':
                    return actualNum > expectedNum;
                case '<=':
                    return actualNum <= expectedNum;
                case '>=':
                    return actualNum >= expectedNum;
            }
        }

        switch (operator) {
            case '==':
            case '=':
                return actual === expected;
            case '<>':
                return actual !== expected;
        }

        return false;
    }
}