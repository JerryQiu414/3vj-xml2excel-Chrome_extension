class BOMConverter {
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
}

const converter = new BOMConverter();

const vars = {
    rowType: 'Metal',
    totalQty: 1,
    length: 2887,
    width: 26,
    thickness: 62,
    sets: 1,
    totalLength: 2887 * 1,
    totalArea: (2887 * 26 / 1000000) * 1
};

console.log('=== Testing GRHH030000101 usage calculation ===');
console.log('Expected: 2887 / 1000 = 2.887');
console.log('Rounded: 2.89');

const formula = '{length}/1000';
const result = converter._evaluateFormula(formula, vars);
console.log('Final result:', result);
console.log('Rounded result:', Math.ceil(result * 100) / 100);