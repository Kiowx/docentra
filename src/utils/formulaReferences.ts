import { colToLetter, letterToCol } from './cellUtils'

export interface ParsedCellReference {
  col: number
  row: number
  colAbsolute: boolean
  rowAbsolute: boolean
}

export type FormulaStructureChange =
  | { type: 'insert-row'; index: number; count: number }
  | { type: 'delete-row'; index: number; count: number }
  | { type: 'insert-col'; index: number; count: number }
  | { type: 'delete-col'; index: number; count: number }

const CELL_REF_RE = /^\$?[A-Za-z]+\$?\d+/

export function parseCellReferenceToken(token: string): ParsedCellReference | null {
  const match = token.match(/^(\$?)([A-Z]+)(\$?)(\d+)$/i)
  if (!match) return null

  return {
    colAbsolute: match[1] === '$',
    col: letterToCol(match[2].toUpperCase()),
    rowAbsolute: match[3] === '$',
    row: Number.parseInt(match[4], 10) - 1,
  }
}

export function formatCellReferenceToken(ref: ParsedCellReference): string {
  const colPrefix = ref.colAbsolute ? '$' : ''
  const rowPrefix = ref.rowAbsolute ? '$' : ''
  return `${colPrefix}${colToLetter(ref.col)}${rowPrefix}${ref.row + 1}`
}

function remapRow(row: number, change: Extract<FormulaStructureChange, { type: 'insert-row' | 'delete-row' }>): number | null {
  if (change.type === 'insert-row') {
    return row >= change.index ? row + change.count : row
  }

  if (row >= change.index && row < change.index + change.count) {
    return null
  }

  return row >= change.index + change.count ? row - change.count : row
}

function remapCol(col: number, change: Extract<FormulaStructureChange, { type: 'insert-col' | 'delete-col' }>): number | null {
  if (change.type === 'insert-col') {
    return col >= change.index ? col + change.count : col
  }

  if (col >= change.index && col < change.index + change.count) {
    return null
  }

  return col >= change.index + change.count ? col - change.count : col
}

function adjustInterval(
  start: number,
  end: number,
  change: FormulaStructureChange,
): { start: number; end: number } | null {
  if (change.type === 'insert-row' || change.type === 'insert-col') {
    if (change.index <= start) {
      return { start: start + change.count, end: end + change.count }
    }

    if (change.index <= end) {
      return { start, end: end + change.count }
    }

    return { start, end }
  }

  const removedStart = change.index
  const removedEnd = change.index + change.count - 1

  if (removedStart > end) {
    return { start, end }
  }

  if (removedEnd < start) {
    return { start: start - change.count, end: end - change.count }
  }

  const remaining: number[] = []
  for (let value = start; value <= end; value++) {
    if (value >= removedStart && value <= removedEnd) continue
    remaining.push(value > removedEnd ? value - change.count : value)
  }

  if (remaining.length === 0) {
    return null
  }

  return {
    start: remaining[0],
    end: remaining[remaining.length - 1],
  }
}

function adjustSingleReference(
  ref: ParsedCellReference,
  change: FormulaStructureChange,
): ParsedCellReference | null {
  if (change.type === 'insert-row' || change.type === 'delete-row') {
    const row = remapRow(ref.row, change)
    return row === null ? null : { ...ref, row }
  }

  const col = remapCol(ref.col, change)
  return col === null ? null : { ...ref, col }
}

function adjustRangeReference(
  startRef: ParsedCellReference,
  endRef: ParsedCellReference,
  change: FormulaStructureChange,
): [ParsedCellReference, ParsedCellReference] | null {
  const normalizedRows = {
    start: Math.min(startRef.row, endRef.row),
    end: Math.max(startRef.row, endRef.row),
  }
  const normalizedCols = {
    start: Math.min(startRef.col, endRef.col),
    end: Math.max(startRef.col, endRef.col),
  }

  if (change.type === 'insert-row' || change.type === 'delete-row') {
    const nextRows = adjustInterval(normalizedRows.start, normalizedRows.end, change)
    if (!nextRows) return null

    return [
      { ...startRef, row: nextRows.start },
      { ...endRef, row: nextRows.end },
    ]
  }

  const nextCols = adjustInterval(normalizedCols.start, normalizedCols.end, change)
  if (!nextCols) return null

  return [
    { ...startRef, col: nextCols.start },
    { ...endRef, col: nextCols.end },
  ]
}

export function shiftFormulaReferences(
  formula: string,
  dRow: number,
  dCol: number,
): string {
  if (dRow === 0 && dCol === 0) return formula

  const hasLeadingEquals = formula.startsWith('=')
  const source = hasLeadingEquals ? formula.slice(1) : formula

  let index = 0
  let result = ''

  while (index < source.length) {
    const current = source[index]

    if (current === '"') {
      let end = index + 1
      while (end < source.length && source[end] !== '"') {
        end++
      }
      result += source.slice(index, Math.min(end + 1, source.length))
      index = Math.min(end + 1, source.length)
      continue
    }

    const startMatch = source.slice(index).match(CELL_REF_RE)
    if (!startMatch) {
      result += current
      index++
      continue
    }

    const startToken = startMatch[0]
    const startRef = parseCellReferenceToken(startToken)
    if (!startRef) {
      result += current
      index++
      continue
    }

    let consumed = startToken.length
    const rangePrefix = source.slice(index + consumed)
    const endMatch = rangePrefix.startsWith(':')
      ? rangePrefix.slice(1).match(CELL_REF_RE)
      : null

    if (endMatch) {
      const endToken = endMatch[0]
      const endRef = parseCellReferenceToken(endToken)
      if (!endRef) {
        result += startToken
        index += consumed
        continue
      }

      const newStart: ParsedCellReference = {
        ...startRef,
        row: startRef.rowAbsolute ? startRef.row : Math.max(0, startRef.row + dRow),
        col: startRef.colAbsolute ? startRef.col : Math.max(0, startRef.col + dCol),
      }
      const newEnd: ParsedCellReference = {
        ...endRef,
        row: endRef.rowAbsolute ? endRef.row : Math.max(0, endRef.row + dRow),
        col: endRef.colAbsolute ? endRef.col : Math.max(0, endRef.col + dCol),
      }
      result += `${formatCellReferenceToken(newStart)}:${formatCellReferenceToken(newEnd)}`
      consumed += 1 + endToken.length
      index += consumed
      continue
    }

    const newRef: ParsedCellReference = {
      ...startRef,
      row: startRef.rowAbsolute ? startRef.row : Math.max(0, startRef.row + dRow),
      col: startRef.colAbsolute ? startRef.col : Math.max(0, startRef.col + dCol),
    }
    result += formatCellReferenceToken(newRef)
    index += consumed
  }

  return hasLeadingEquals ? `=${result}` : result
}

export function toggleCellReference(
  formula: string,
  cursorPos: number,
): string {
  const hasLeadingEquals = formula.startsWith('=')
  const source = hasLeadingEquals ? formula.slice(1) : formula
  const offset = hasLeadingEquals ? 1 : 0

  let bestStart = -1
  let bestEnd = -1

  for (let i = 0; i < source.length; ) {
    const match = source.slice(i).match(CELL_REF_RE)
    if (!match) { i++; continue }

    const tokenStart = i
    const tokenEnd = i + match[0].length
    const cursor = cursorPos - offset

    if (cursor >= tokenStart && cursor <= tokenEnd) {
      bestStart = tokenStart
      bestEnd = tokenEnd
      break
    }

    if (tokenStart > cursor) break
    i = tokenEnd
  }

  if (bestStart === -1) {
    const lastMatch = source.match(/(\$?[A-Z]+\$?\d+)(?![:\$A-Z0-9])/gi)
    if (lastMatch && lastMatch.length > 0) {
      const last = lastMatch[lastMatch.length - 1]
      const idx = source.lastIndexOf(last)
      bestStart = idx
      bestEnd = idx + last.length
    }
  }

  if (bestStart === -1) return formula

  const token = source.slice(bestStart, bestEnd)
  const ref = parseCellReferenceToken(token)
  if (!ref) return formula

  let toggled: ParsedCellReference
  if (!ref.colAbsolute && !ref.rowAbsolute) {
    toggled = { ...ref, colAbsolute: true, rowAbsolute: true }
  } else if (ref.colAbsolute && ref.rowAbsolute) {
    toggled = { ...ref, colAbsolute: true, rowAbsolute: false }
  } else if (ref.colAbsolute && !ref.rowAbsolute) {
    toggled = { ...ref, colAbsolute: false, rowAbsolute: true }
  } else {
    toggled = { ...ref, colAbsolute: false, rowAbsolute: false }
  }

  const newSource = source.slice(0, bestStart) + formatCellReferenceToken(toggled) + source.slice(bestEnd)
  return hasLeadingEquals ? `=${newSource}` : newSource
}

export function adjustFormulaReferences(
  formula: string,
  change: FormulaStructureChange,
): string | null {
  const hasLeadingEquals = formula.startsWith('=')
  const source = hasLeadingEquals ? formula.slice(1) : formula

  let index = 0
  let result = ''

  while (index < source.length) {
    const current = source[index]

    if (current === '"') {
      let end = index + 1
      while (end < source.length && source[end] !== '"') {
        end++
      }
      result += source.slice(index, Math.min(end + 1, source.length))
      index = Math.min(end + 1, source.length)
      continue
    }

    const startMatch = source.slice(index).match(CELL_REF_RE)
    if (!startMatch) {
      result += current
      index++
      continue
    }

    const startToken = startMatch[0]
    const startRef = parseCellReferenceToken(startToken)
    if (!startRef) {
      result += current
      index++
      continue
    }

    let consumed = startToken.length
    const rangePrefix = source.slice(index + consumed)
    const endMatch = rangePrefix.startsWith(':')
      ? rangePrefix.slice(1).match(CELL_REF_RE)
      : null

    if (endMatch) {
      const endToken = endMatch[0]
      const endRef = parseCellReferenceToken(endToken)
      if (!endRef) {
        return null
      }

      const adjustedRange = adjustRangeReference(startRef, endRef, change)
      if (!adjustedRange) {
        return null
      }

      result += `${formatCellReferenceToken(adjustedRange[0])}:${formatCellReferenceToken(adjustedRange[1])}`
      consumed += 1 + endToken.length
      index += consumed
      continue
    }

    const adjustedRef = adjustSingleReference(startRef, change)
    if (!adjustedRef) {
      return null
    }

    result += formatCellReferenceToken(adjustedRef)
    index += consumed
  }

  return hasLeadingEquals ? `=${result}` : result
}
