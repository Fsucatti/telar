/**
 * Arithmetic parser for the calculator tool. Expressions come from a model,
 * so it never uses eval: anything but numbers and operators is rejected.
 */
export function calculate(expression: string): number {
  const source = expression.replace(/\s+/g, "");
  let position = 0;
  let depth = 0;

  const peek = () => source[position];

  function parseExpression(): number {
    let value = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const operator = source[position++];
      const right = parseTerm();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  function parseTerm(): number {
    let value = parsePower();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const operator = source[position++];
      const right = parsePower();
      if (operator !== "*" && right === 0) throw new Error("Can't divide by zero.");
      if (operator === "*") value *= right;
      else if (operator === "/") value /= right;
      else value %= right;
    }
    return value;
  }

  function parsePower(): number {
    const base = parseUnary();
    if (peek() === "^") {
      position++;
      return base ** parsePower();
    }
    return base;
  }

  function parseUnary(): number {
    if (peek() === "-") {
      position++;
      return -parseUnary();
    }
    if (peek() === "+") {
      position++;
      return parseUnary();
    }
    return parseAtom();
  }

  function parseAtom(): number {
    if (peek() === "(") {
      if (++depth > 32) throw new Error("The expression is nested too deeply.");
      position++;
      const value = parseExpression();
      if (peek() !== ")") throw new Error("Missing closing parenthesis.");
      position++;
      depth--;
      return value;
    }
    const match = /^\d+(\.\d+)?|^\.\d+/.exec(source.slice(position));
    if (!match) throw new Error(`Unexpected character at position ${position + 1}.`);
    position += match[0].length;
    return Number(match[0]);
  }

  if (!source) throw new Error("The expression is empty.");
  const result = parseExpression();
  if (position !== source.length) {
    throw new Error(`Unexpected character at position ${position + 1}.`);
  }
  if (!Number.isFinite(result)) throw new Error("The result is too large.");
  return result;
}
