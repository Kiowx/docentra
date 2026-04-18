import { cellKey } from './cellUtils'
import type { CellData } from '@/types'
import { parseCellReferenceToken } from './formulaReferences'

type CellValue = string | number | boolean | CellValue[][] | null

interface FormulaContext {
  getCellValue: (row: number, col: number) => CellValue
}

// -- Tokenizer --
type TokenType = 'NUMBER' | 'STRING' | 'CELL_REF' | 'RANGE' | 'FUNC' | 'OP' | 'LPAREN' | 'RPAREN' | 'COMMA' | 'COLON'

interface Token {
  type: TokenType
  value: string
}

function tokenize(formula: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < formula.length) {
    const ch = formula[i]
    if (/\s/.test(ch)) { i++; continue }
    if (ch === '(') { tokens.push({ type: 'LPAREN', value: '(' }); i++; continue }
    if (ch === ')') { tokens.push({ type: 'RPAREN', value: ')' }); i++; continue }
    if (ch === ',') { tokens.push({ type: 'COMMA', value: ',' }); i++; continue }
    if (ch === ':') { tokens.push({ type: 'COLON', value: ':' }); i++; continue }
    if ('+-*/^&='.includes(ch)) { tokens.push({ type: 'OP', value: ch }); i++; continue }
    if (ch === '<' || ch === '>' || ch === '!') {
      let op = ch
      if (i + 1 < formula.length && (formula[i + 1] === '=' || (ch === '<' && formula[i + 1] === '>'))) {
        op += formula[i + 1]
        i++
      }
      tokens.push({ type: 'OP', value: op }); i++; continue
    }
    if (ch === '"') {
      let str = ''
      i++
      while (i < formula.length && formula[i] !== '"') { str += formula[i]; i++ }
      i++
      tokens.push({ type: 'STRING', value: str })
      continue
    }
    if (/\d/.test(ch) || (ch === '.' && i + 1 < formula.length && /\d/.test(formula[i + 1]))) {
      let num = ''
      while (i < formula.length && /[\d.]/.test(formula[i])) { num += formula[i]; i++ }
      tokens.push({ type: 'NUMBER', value: num })
      continue
    }
    if (/[A-Za-z$_]/.test(ch)) {
      let ident = ''
      while (i < formula.length && /[A-Za-z0-9$_]/.test(formula[i])) { ident += formula[i]; i++ }
      if (i < formula.length && formula[i] === '(') {
        tokens.push({ type: 'FUNC', value: ident.toUpperCase() })
      } else {
        tokens.push({ type: 'CELL_REF', value: ident.toUpperCase() })
      }
      continue
    }
    i++
  }
  return tokens
}

function parseCellRef(ref: string): [number, number] | null {
  const parsed = parseCellReferenceToken(ref)
  if (!parsed) return null
  return [parsed.row, parsed.col]
}

// -- Evaluator --
function evaluateTokens(tokens: Token[], ctx: FormulaContext): CellValue {
  let pos = 0

  function peek(): Token | undefined { return tokens[pos] }
  function advance(): Token { return tokens[pos++] }

  function parseRangeOrCell(): CellValue {
    const token = advance()
    if (token.type !== 'CELL_REF') return 0

    const ref = parseCellRef(token.value)
    if (!ref) return 0

    if (peek()?.type === 'COLON') {
      advance()
      const endToken = advance()
      if (endToken.type !== 'CELL_REF') return 0
      const endRef = parseCellRef(endToken.value)
      if (!endRef) return 0

      const values: CellValue[][] = []
      for (let r = ref[0]; r <= endRef[0]; r++) {
        const row: CellValue[] = []
        for (let c = ref[1]; c <= endRef[1]; c++) {
          row.push(ctx.getCellValue(r, c))
        }
        values.push(row)
      }
      return values
    }
    return ctx.getCellValue(ref[0], ref[1])
  }

  function flatten(val: CellValue | CellValue[][]): number[] {
    if (Array.isArray(val)) return val.flat().map(toNum)
    return [toNum(val)]
  }

  function flattenRaw(val: CellValue | CellValue[][]): CellValue[] {
    if (Array.isArray(val)) {
      const flattened: CellValue[] = []
      for (const item of val) {
        if (Array.isArray(item)) flattened.push(...item)
        else flattened.push(item)
      }
      return flattened
    }
    return [val]
  }

  function parsePrimary(): CellValue {
    const t = peek()
    if (!t) return 0

    if (t.type === 'NUMBER') {
      advance()
      return parseFloat(t.value)
    }
    if (t.type === 'STRING') {
      advance()
      return t.value
    }
    if (t.type === 'FUNC') {
      return parseFunction()
    }
    if (t.type === 'CELL_REF') {
      return parseRangeOrCell()
    }
    if (t.type === 'LPAREN') {
      advance()
      const val = parseExpression()
      if (peek()?.type === 'RPAREN') advance()
      return val
    }
    if (t.type === 'OP' && (t.value === '-' || t.value === '+')) {
      advance()
      const val = parsePrimary()
      return t.value === '-' ? -toNum(val) : toNum(val)
    }
    advance()
    return 0
  }

  function parsePower(): CellValue {
    let left = parsePrimary()
    if (peek()?.type === 'OP' && peek()!.value === '^') {
      advance()
      const right = parsePower()
      left = Math.pow(toNum(left), toNum(right))
    }
    return left
  }

  function parseMulDiv(): CellValue {
    let left = parsePower()
    while (peek()?.type === 'OP' && '*/'.includes(peek()!.value)) {
      const op = advance().value
      const right = parsePower()
      if (op === '*') left = toNum(left) * toNum(right)
      else left = toNum(right) !== 0 ? toNum(left) / toNum(right) : '#DIV/0!'
    }
    return left
  }

  function parseAddSub(): CellValue {
    let left = parseMulDiv()
    while (peek()?.type === 'OP' && '+-'.includes(peek()!.value)) {
      const op = advance().value
      const right = parseMulDiv()
      if (op === '+') left = toNum(left) + toNum(right)
      else left = toNum(left) - toNum(right)
    }
    return left
  }

  function parseConcat(): CellValue {
    let left = parseAddSub()
    while (peek()?.type === 'OP' && peek()!.value === '&') {
      advance()
      const right = parseAddSub()
      left = String(left ?? '') + String(right ?? '')
    }
    return left
  }

  function parseComparison(): CellValue {
    let left = parseConcat()
    while (peek()?.type === 'OP' && ['<', '>', '<=', '>=', '=', '!=', '<>'].includes(peek()!.value)) {
      const op = advance().value
      const right = parseConcat()
      switch (op) {
        case '<': left = toNum(left) < toNum(right); break
        case '>': left = toNum(left) > toNum(right); break
        case '<=': left = toNum(left) <= toNum(right); break
        case '>=': left = toNum(left) >= toNum(right); break
        case '=': left = left === right; break
        case '!=': case '<>': left = left !== right; break
      }
    }
    return left
  }

  function parseExpression(): CellValue {
    return parseComparison()
  }

  function parseFunction(): CellValue {
    const name = advance().value
    if (peek()?.type !== 'LPAREN') return 0
    advance()

    const args: (CellValue | CellValue[][])[] = []
    if (peek()?.type !== 'RPAREN') {
      args.push(parseExpression())
      while (peek()?.type === 'COMMA') {
        advance()
        args.push(parseExpression())
      }
    }
    if (peek()?.type === 'RPAREN') advance()

    return evaluateFunction(name, args)
  }

  function evaluateFunction(name: string, args: (CellValue | CellValue[][])[],): CellValue {
    const flatArgs = args.map(flatten)
    const allNums = flatArgs.flat()
    const rawArgs = args.flatMap(flattenRaw)

    switch (name) {
      case 'SUM': return allNums.reduce((a, b) => a + b, 0)
      case 'AVERAGE': return allNums.length ? allNums.reduce((a, b) => a + b, 0) / allNums.length : 0
      case 'MIN': return allNums.length ? Math.min(...allNums) : 0
      case 'MAX': return allNums.length ? Math.max(...allNums) : 0
      case 'COUNT': return rawArgs.filter(v => typeof v === 'number' && !isNaN(v)).length
      case 'COUNTA': {
        return rawArgs.filter(v => v !== null && v !== '' && v !== undefined).length
      }
      case 'IF': {
        const cond = args[0]
        if (Array.isArray(cond)) return 0
        return cond ? args[1] ?? true : args[2] ?? false
      }
      case 'CONCATENATE': return args.flat().flat().map(String).join('')
      case 'ROUND': {
        const val = toNum(args[0])
        const dec = args[1] ? toNum(args[1]) : 0
        return Math.round(val * Math.pow(10, dec)) / Math.pow(10, dec)
      }
      case 'ABS': return Math.abs(toNum(args[0]))
      case 'INT': return Math.floor(toNum(args[0]))
      case 'MOD': return toNum(args[1]) !== 0 ? toNum(args[0]) % toNum(args[1]) : '#DIV/0!'
      case 'POWER': return Math.pow(toNum(args[0]), toNum(args[1]))
      case 'SQRT': return Math.sqrt(toNum(args[0]))
      case 'LEN': return String(args[0] ?? '').length
      case 'LEFT': return String(args[0] ?? '').substring(0, toNum(args[1] ?? 1))
      case 'RIGHT': {
        const s = String(args[0] ?? '')
        const n = toNum(args[1] ?? 1)
        return s.substring(s.length - n)
      }
      case 'UPPER': return String(args[0] ?? '').toUpperCase()
      case 'LOWER': return String(args[0] ?? '').toLowerCase()
      case 'TRIM': return String(args[0] ?? '').trim()
      case 'NOW': return new Date().toLocaleString()
      case 'TODAY': return new Date().toLocaleDateString()
      case 'PI': return Math.PI
      default: return '#NAME?'
    }
  }

  const result = parseExpression()
  return result
}

function toNum(v: CellValue | CellValue[][]): number {
  if (Array.isArray(v)) return toNum(v[0]?.[0])
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'string') {
    const n = Number(v)
    return isNaN(n) ? 0 : n
  }
  return 0
}

// -- Public API --
export function evaluateFormula(
  formula: string,
  getCellValue: (row: number, col: number) => CellValue,
): CellValue {
  const expr = formula.startsWith('=') ? formula.slice(1) : formula
  try {
    const tokens = tokenize(expr)
    return evaluateTokens(tokens, { getCellValue })
  } catch {
    return '#ERROR!'
  }
}

export function getFormulaDependencies(formula: string): string[] {
  const deps: string[] = []
  const expr = formula.startsWith('=') ? formula.slice(1) : formula
  const tokens = tokenize(expr)
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token.type !== 'CELL_REF') continue

    const startRef = parseCellRef(token.value)
    if (!startRef) continue

    if (tokens[i + 1]?.type === 'COLON' && tokens[i + 2]?.type === 'CELL_REF') {
      const endRef = parseCellRef(tokens[i + 2].value)
      if (!endRef) continue

      const startRow = Math.min(startRef[0], endRef[0])
      const endRow = Math.max(startRef[0], endRef[0])
      const startCol = Math.min(startRef[1], endRef[1])
      const endCol = Math.max(startRef[1], endRef[1])

      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
          deps.push(cellKey(row, col))
        }
      }

      i += 2
      continue
    }

    deps.push(cellKey(startRef[0], startRef[1]))
  }
  return Array.from(new Set(deps))
}

export function formatCellValue(cell: CellData | undefined): string {
  if (!cell) return ''
  if (cell.computedValue !== undefined) {
    if (typeof cell.computedValue === 'number') {
      if (Number.isInteger(cell.computedValue)) return cell.computedValue.toString()
      return cell.computedValue.toFixed(2).replace(/\.?0+$/, '')
    }
    return String(cell.computedValue)
  }
  return cell.value || ''
}
