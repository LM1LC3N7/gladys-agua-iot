// -----------------------------------------------------------------------------
// The register formulas of the Agua IOT cloud, interpreted.
//
// Every register carries a `formula` (raw value -> displayed value, e.g.
// "#/2", "#+30", "int(#/4)+1") and a `formula_inverse` (the way back, for
// writing). The Python library evaluates them with simpleeval; here they are
// tokenized, parsed and walked, never evaluated as code. Supported: numbers,
// `#` (the value), + - * / // % Mod, unary minus, comparisons, parentheses,
// int(x) and IF(condition, then, else), with Python semantics (true division,
// int() truncates, % takes the sign of the divisor).
// -----------------------------------------------------------------------------

export class FormulaError extends Error {}

const MAX_LENGTH = 200;
const FUNCTIONS = {
  int: (args) => {
    if (args.length !== 1) {
      throw new FormulaError('int() takes one argument');
    }
    return Math.trunc(args[0]);
  },
  IF: (args) => {
    if (args.length !== 3) {
      throw new FormulaError('IF() takes three arguments');
    }
    return args[0] ? args[1] : args[2];
  },
};

function tokenize(text) {
  const tokens = [];
  const re = /\s*(?:(\d+(?:\.\d*)?|\.\d+)|([A-Za-z_]\w*)|(\/\/|==|!=|<=|>=|[-+*/%(),<>]))/y;
  let index = 0;
  while (index < text.length) {
    if (/^\s*$/.test(text.slice(index))) {
      break;
    }
    re.lastIndex = index;
    const m = re.exec(text);
    if (!m) {
      throw new FormulaError(`unexpected character at ${index}`);
    }
    index = re.lastIndex;
    if (m[1] !== undefined) {
      tokens.push({ kind: 'number', value: Number(m[1]) });
    } else if (m[2] !== undefined) {
      tokens.push(m[2] === 'Mod' ? { kind: 'op', value: '%' } : { kind: 'name', value: m[2] });
    } else {
      tokens.push({ kind: 'op', value: m[3] });
    }
  }
  return tokens;
}

/** Python's modulo: the result takes the sign of the divisor. */
const pyMod = (a, b) => a - b * Math.floor(a / b);

function parse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (value) => peek()?.kind === 'op' && peek().value === value;
  const expect = (value) => {
    if (!isOp(value)) {
      throw new FormulaError(`expected "${value}"`);
    }
    pos += 1;
  };

  function primary() {
    const token = peek();
    if (!token) {
      throw new FormulaError('unexpected end');
    }
    if (token.kind === 'number') {
      pos += 1;
      return token.value;
    }
    if (isOp('(')) {
      pos += 1;
      const value = comparison();
      expect(')');
      return value;
    }
    if (token.kind === 'name' && Object.hasOwn(FUNCTIONS, token.value)) {
      pos += 1;
      expect('(');
      const args = [];
      if (!isOp(')')) {
        args.push(comparison());
        while (isOp(',')) {
          pos += 1;
          args.push(comparison());
        }
      }
      expect(')');
      return FUNCTIONS[token.value](args);
    }
    throw new FormulaError(`unexpected "${token.value}"`);
  }

  function unary() {
    if (isOp('-')) {
      pos += 1;
      return -unary();
    }
    if (isOp('+')) {
      pos += 1;
      return unary();
    }
    return primary();
  }

  function term() {
    let value = unary();
    for (;;) {
      const op = ['*', '/', '//', '%'].find(isOp);
      if (!op) {
        return value;
      }
      pos += 1;
      const right = unary();
      if (op !== '*' && right === 0) {
        throw new FormulaError('division by zero');
      }
      if (op === '*') {
        value *= right;
      } else if (op === '/') {
        value /= right;
      } else if (op === '//') {
        value = Math.floor(value / right);
      } else {
        value = pyMod(value, right);
      }
    }
  }

  function sum() {
    let value = term();
    for (;;) {
      if (isOp('+')) {
        pos += 1;
        value += term();
      } else if (isOp('-')) {
        pos += 1;
        value -= term();
      } else {
        return value;
      }
    }
  }

  function comparison() {
    const left = sum();
    const op = ['==', '!=', '<', '<=', '>', '>='].find(isOp);
    if (!op) {
      return left;
    }
    pos += 1;
    const right = sum();
    const result = {
      '==': left === right,
      '!=': left !== right,
      '<': left < right,
      '<=': left <= right,
      '>': left > right,
      '>=': left >= right,
    }[op];
    return result ? 1 : 0;
  }

  const value = comparison();
  if (pos !== tokens.length) {
    throw new FormulaError(`unexpected "${peek().value}"`);
  }
  return value;
}

/**
 * Evaluates a register formula, `#` standing for `value`.
 * @param {string} formula e.g. "#/2"
 * @param {number} value
 * @returns {number}
 * @throws {FormulaError} on a formula outside the supported grammar
 */
export function evaluate(formula, value) {
  const text = String(formula ?? '#');
  if (text.length > MAX_LENGTH) {
    throw new FormulaError('formula too long');
  }
  if (!Number.isFinite(value)) {
    throw new FormulaError('the value is not a number');
  }
  // Python's str() of the value, as the library does: "#" is replaced by text.
  const result = parse(tokenize(text.replaceAll('#', `(${value})`)));
  if (!Number.isFinite(result)) {
    throw new FormulaError('the result is not a number');
  }
  return result;
}
