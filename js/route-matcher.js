class ProcessRouteMatcher {
    constructor(routesConfig) {
        this.processSteps = routesConfig ? routesConfig.process_steps || [] : [];
    }

    matchRoute(data, element) {
        const resultCodes = [];
        const currentType = data.type || '';

        for (const step of this.processSteps) {
            const prerequisites = step.prerequisites || [];
            const prerequisiteTypes = step.prerequisite_types || [];

            if (!this._checkPrerequisites(data, prerequisites, prerequisiteTypes, element)) {
                continue;
            }

            const conditions = step.conditions || [];
            const matchedCodes = this._matchConditions(data, conditions, currentType, element);

            if (matchedCodes.length > 0) {
                resultCodes.push(matchedCodes[0]);
            }
        }

        return resultCodes.join('_');
    }

    _checkPrerequisites(data, prerequisites, prerequisiteTypes, element) {
        const currentType = data.type || '';

        if (prerequisiteTypes.length > 0 && !prerequisiteTypes.includes(currentType)) {
            return true;
        }

        if (prerequisites.length === 0) {
            return true;
        }

        for (const rule of prerequisites) {
            if (!this._matchRule(data, rule, element)) {
                return false;
            }
        }

        return true;
    }

    _matchConditions(data, conditions, currentType, element) {
        const matchedCodes = [];

        for (const condition of conditions) {
            const targetTypes = condition.target_types || [];

            if (targetTypes.length > 0 && currentType && !targetTypes.includes(currentType)) {
                continue;
            }

            const rules = condition.rules || [];
            const logic = condition.logic || 'AND';
            const code = condition.code;

            if (!rules.length) {
                if (targetTypes.length > 0 && targetTypes.includes(currentType)) {
                    matchedCodes.push(code);
                }
                continue;
            }

            if (logic === 'AND') {
                const allMatch = this._matchRulesAll(data, rules, element);
                if (allMatch) {
                    matchedCodes.push(code);
                }
            } else if (logic === 'OR') {
                const anyMatch = this._matchRulesAny(data, rules, element);
                if (anyMatch) {
                    matchedCodes.push(code);
                }
            }
        }

        return matchedCodes;
    }

    _matchRulesAll(data, rules, element) {
        const listFields = {};

        for (const rule of rules) {
            const field = rule.field;
            if (field && field.includes('.')) {
                const parts = field.split('.');
                const containerPath = parts.slice(0, -1).join('.');
                if (containerPath) {
                    const containerValue = this._getFieldValue(data, field, element);
                    if (Array.isArray(containerValue) && containerValue.length > 0) {
                        listFields[containerPath] = containerValue;
                    }
                }
            }
        }

        if (Object.keys(listFields).length === 0) {
            for (const rule of rules) {
                if (!this._matchRule(data, rule, element)) {
                    return false;
                }
            }
            return true;
        }

        for (const [containerPath, items] of Object.entries(listFields)) {
            for (const item of items) {
                const tempData = JSON.parse(JSON.stringify(data));
                let current = tempData;
                const parts = containerPath.split('.');
                for (let i = 0; i < parts.length; i++) {
                    if (i === parts.length - 1) {
                        current[parts[i]] = item;
                    } else {
                        if (!(parts[i] in current)) {
                            current[parts[i]] = {};
                        }
                        current = current[parts[i]];
                    }
                }

                let allMatch = true;
                for (const rule of rules) {
                    if (!this._matchRule(tempData, rule, element)) {
                        allMatch = false;
                        break;
                    }
                }
                if (allMatch) {
                    return true;
                }
            }
        }

        return false;
    }

    _matchRulesAny(data, rules, element) {
        const listFields = {};

        for (const rule of rules) {
            const field = rule.field;
            if (field && field.includes('.')) {
                const parts = field.split('.');
                const containerPath = parts.slice(0, -1).join('.');
                if (containerPath) {
                    const containerValue = this._getFieldValue(data, field, element);
                    if (Array.isArray(containerValue) && containerValue.length > 0) {
                        listFields[containerPath] = containerValue;
                    }
                }
            }
        }

        if (Object.keys(listFields).length === 0) {
            for (const rule of rules) {
                if (this._matchRule(data, rule, element)) {
                    return true;
                }
            }
            return false;
        }

        for (const [containerPath, items] of Object.entries(listFields)) {
            for (const item of items) {
                for (const rule of rules) {
                    const field = rule.field;
                    if (field && field.startsWith(containerPath + '.')) {
                        const tempData = JSON.parse(JSON.stringify(data));
                        let current = tempData;
                        const parts = containerPath.split('.');
                        for (let i = 0; i < parts.length; i++) {
                            if (i === parts.length - 1) {
                                current[parts[i]] = item;
                            } else {
                                if (!(parts[i] in current)) {
                                    current[parts[i]] = {};
                                }
                                current = current[parts[i]];
                            }
                        }

                        if (this._matchRule(tempData, rule, element)) {
                            return true;
                        }
                    }
                }
            }
        }

        return false;
    }

    _matchRule(data, rule, element) {
        const field = rule.field;
        const operator = rule.operator;
        const value = rule.value;

        let fieldValue = this._getFieldValue(data, field, element);

        if (fieldValue === null || fieldValue === undefined) {
            fieldValue = '';
        }

        if (fieldValue === '' && operator === 'not_empty') {
            return false;
        }

        try {
            switch (operator) {
                case 'equals':
                    return String(fieldValue) === String(value);
                case 'not_equals':
                    return String(fieldValue) !== String(value);
                case 'startswith':
                    return String(fieldValue).startsWith(String(value));
                case 'not_startswith':
                    return !String(fieldValue).startsWith(String(value));
                case 'contains':
                    return String(fieldValue).includes(String(value));
                case 'not_contains':
                    return !String(fieldValue).includes(String(value));
                case 'greater_than':
                    return parseFloat(fieldValue) > parseFloat(value);
                case 'greater_or_equal':
                    return parseFloat(fieldValue) >= parseFloat(value);
                case 'less_than':
                    return parseFloat(fieldValue) < parseFloat(value);
                case 'less_or_equal':
                    return parseFloat(fieldValue) <= parseFloat(value);
                case 'not_empty':
                    return fieldValue !== null && String(fieldValue).trim() !== '';
                case 'any_not_equals': {
                    if (Array.isArray(fieldValue)) {
                        const lastKey = field.split('.').pop();
                        return fieldValue.some(item => {
                            if (typeof item === 'object' && item !== null) {
                                return String(item[lastKey] || '') !== String(value);
                            }
                            return false;
                        });
                    } else if (typeof fieldValue === 'object' && fieldValue !== null) {
                        const lastKey = field.split('.').pop();
                        return String(fieldValue[lastKey] || '') !== String(value);
                    } else {
                        return String(fieldValue) !== String(value);
                    }
                }
                case 'not_in': {
                    if (Array.isArray(value)) {
                        return !value.some(v => String(fieldValue) === String(v));
                    } else {
                        return String(fieldValue) !== String(value);
                    }
                }
                default:
                    return false;
            }
        } catch (e) {
            return false;
        }
    }

    _getFieldValue(data, fieldPath, element) {
        if (!fieldPath) return null;

        const dictValue = this._getFieldValueFromDict(data, fieldPath);
        if (dictValue !== null) {
            return dictValue;
        }

        if (element) {
            return this._getFieldValueFromElement(element, fieldPath);
        }

        return null;
    }

    _getFieldValueFromDict(data, fieldPath) {
        const keys = fieldPath.split('.');
        let value = data;

        for (const key of keys) {
            if (typeof value === 'object' && value !== null && key in value) {
                value = value[key];
            } else if (typeof value === 'object' && value !== null) {
                const keyLower = key.toLowerCase();
                let found = false;
                for (const [k, v] of Object.entries(value)) {
                    if (k.toLowerCase() === keyLower) {
                        value = v;
                        found = true;
                        break;
                    }
                }
                if (!found) return null;
            } else if (Array.isArray(value) && value.length > 0) {
                let found = false;
                for (const item of value) {
                    if (typeof item === 'object' && item !== null && key in item) {
                        value = item[key];
                        found = true;
                        break;
                    } else if (typeof item === 'object' && item !== null) {
                        const keyLower = key.toLowerCase();
                        for (const [k, v] of Object.entries(item)) {
                            if (k.toLowerCase() === keyLower) {
                                value = v;
                                found = true;
                                break;
                            }
                        }
                        if (found) break;
                    }
                }
                if (!found) return null;
            } else {
                return null;
            }
        }

        return value;
    }

    _getFieldValueFromElement(element, fieldPath) {
        const keys = fieldPath.split('.');
        let current = element;

        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (i === 0) {
                if (current.hasAttribute(key)) {
                    return current.getAttribute(key);
                } else {
                    const keyLower = key.toLowerCase();
                    if (current.hasAttribute(keyLower)) {
                        return current.getAttribute(keyLower);
                    } else {
                        const children = current.getElementsByTagName(key);
                        if (children.length > 0) {
                            current = children[0];
                        } else {
                            return null;
                        }
                    }
                }
            } else {
                const children = current.getElementsByTagName(key);
                if (children.length > 0) {
                    current = children[0];
                } else {
                    return null;
                }
            }
        }

        if (current.getAttribute) {
            const lastKey = keys[keys.length - 1];
            if (current.hasAttribute(lastKey)) {
                return current.getAttribute(lastKey);
            } else if (current.hasAttribute(lastKey.toLowerCase())) {
                return current.getAttribute(lastKey.toLowerCase());
            }
            return null;
        }

        return current.textContent || null;
    }
}