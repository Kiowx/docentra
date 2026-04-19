import * as XLSX from 'xlsx'
import type { CellData, CellFormat, NumberFormat, Sheet } from '@/types'
import { parseCellKey } from './cellUtils.ts'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
const xlsxNamespace = XLSX as Record<string, any>
const CFB = (
  xlsxNamespace.CFB
  ?? (Reflect.get(xlsxNamespace, 'default') as { CFB?: any } | undefined)?.CFB
) as any

const DEFAULT_FONT_XML = '<font><sz val="12"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>'
const DEFAULT_FILL_XML = '<fill><patternFill patternType="none"/></fill>'
const DEFAULT_GRAY_FILL_XML = '<fill><patternFill patternType="gray125"/></fill>'
const DEFAULT_BORDER_XML = '<border><left/><right/><top/><bottom/><diagonal/></border>'
const STYLE_SHEET_XMLNS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const VT_XMLNS = 'http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes'

const BUILTIN_NUM_FMT_IDS: Partial<Record<NumberFormat, number>> = {
  general: 0,
  number: 4,
  percent: 10,
  scientific: 11,
  text: 49,
}

interface StyleRegistry {
  fonts: string[]
  fontIds: Map<string, number>
  fills: string[]
  fillIds: Map<string, number>
  customNumFmts: Array<{ id: number; code: string }>
  customNumFmtIds: Map<string, number>
  nextNumFmtId: number
  cellXfs: string[]
  styleIds: Map<string, number>
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|]+/g, '-')
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function decodeBinaryText(content: unknown): string {
  if (typeof content === 'string') return content
  if (content instanceof Uint8Array) return textDecoder.decode(content)
  if (content instanceof ArrayBuffer) return textDecoder.decode(new Uint8Array(content))
  if (ArrayBuffer.isView(content)) {
    return textDecoder.decode(new Uint8Array(content.buffer, content.byteOffset, content.byteLength))
  }
  return String(content ?? '')
}

function toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof ArrayBuffer) {
    return data
  }

  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
}

function replaceZipTextFile(zip: any, path: string, content: string) {
  const existing = CFB.find(zip, path)
  if (existing) {
    CFB.utils.cfb_del(zip, path)
  }
  CFB.utils.cfb_add(zip, path, textEncoder.encode(content))
}

function toArgbHex(red: number, green: number, blue: number, alpha = 255) {
  return [alpha, red, green, blue]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0').toUpperCase())
    .join('')
}

function normalizeColor(color?: string): string | null {
  if (!color) return null

  const trimmed = color.trim()
  if (!trimmed) return null

  const hex3 = trimmed.match(/^#([0-9a-f]{3})$/i)
  if (hex3) {
    const [r, g, b] = hex3[1].split('')
    return `FF${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }

  const hex4 = trimmed.match(/^#([0-9a-f]{4})$/i)
  if (hex4) {
    const [r, g, b, a] = hex4[1].split('')
    return `${a}${a}${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }

  const hex6 = trimmed.match(/^#([0-9a-f]{6})$/i)
  if (hex6) {
    return `FF${hex6[1].toUpperCase()}`
  }

  const hex8 = trimmed.match(/^#([0-9a-f]{8})$/i)
  if (hex8) {
    const normalized = hex8[1].toUpperCase()
    return `${normalized.slice(6, 8)}${normalized.slice(0, 6)}`
  }

  const rgba = trimmed.match(/^rgba?\(([^)]+)\)$/i)
  if (rgba) {
    const parts = rgba[1].split(',').map((part) => part.trim())
    if (parts.length >= 3) {
      const [red, green, blue] = parts.slice(0, 3).map(Number)
      const alpha = parts[3] === undefined ? 1 : Number(parts[3])
      if ([red, green, blue].every((value) => Number.isFinite(value)) && Number.isFinite(alpha)) {
        return toArgbHex(red, green, blue, alpha <= 1 ? alpha * 255 : alpha)
      }
    }
  }

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (context) {
      context.fillStyle = '#000000'
      context.fillStyle = trimmed
      const normalized = context.fillStyle
      const isExplicitBlack = trimmed.toLowerCase() === '#000000' || trimmed.toLowerCase() === 'black'
      if ((typeof normalized === 'string' && normalized && normalized !== '#000000') || isExplicitBlack) {
        return normalizeColor(normalized)
      }
    }
  }

  return null
}

function toFontPointSize(fontSize?: number): number | null {
  if (typeof fontSize !== 'number' || !Number.isFinite(fontSize) || fontSize <= 0) {
    return null
  }

  return Math.round((fontSize * 72 / 96) * 10) / 10
}

function getNumFmtCode(format?: NumberFormat): string | null {
  switch (format) {
    case 'currency':
      return '"¥"#,##0.00'
    case 'date':
      return 'yyyy-mm-dd'
    default:
      return null
  }
}

function createStyleRegistry(): StyleRegistry {
  return {
    fonts: [DEFAULT_FONT_XML],
    fontIds: new Map([[DEFAULT_FONT_XML, 0]]),
    fills: [DEFAULT_FILL_XML, DEFAULT_GRAY_FILL_XML],
    fillIds: new Map([
      [DEFAULT_FILL_XML, 0],
      [DEFAULT_GRAY_FILL_XML, 1],
    ]),
    customNumFmts: [],
    customNumFmtIds: new Map(),
    nextNumFmtId: 164,
    cellXfs: ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'],
    styleIds: new Map<string, number>([
      ['{"numFmtId":0,"fontId":0,"fillId":0,"alignment":null}', 0],
    ]),
  }
}

function registerFont(format: CellFormat, registry: StyleRegistry): number {
  const color = normalizeColor(format.textColor)
  const size = toFontPointSize(format.fontSize)
  const parts = ['<font>']

  if (format.bold) parts.push('<b/>')
  if (format.italic) parts.push('<i/>')
  if (format.underline) parts.push('<u/>')
  if (size !== null) parts.push(`<sz val="${size}"/>`)
  else parts.push('<sz val="12"/>')
  if (color) parts.push(`<color rgb="${color}"/>`)
  else parts.push('<color theme="1"/>')
  parts.push('<name val="Calibri"/>')
  parts.push('<family val="2"/>')
  parts.push('</font>')

  const fontXml = parts.join('')
  const existing = registry.fontIds.get(fontXml)
  if (existing !== undefined) {
    return existing
  }

  const nextId = registry.fonts.length
  registry.fonts.push(fontXml)
  registry.fontIds.set(fontXml, nextId)
  return nextId
}

function registerFill(format: CellFormat, registry: StyleRegistry): number {
  const color = normalizeColor(format.bgColor)
  if (!color) {
    return 0
  }

  const fillXml = `<fill><patternFill patternType="solid"><fgColor rgb="${color}"/><bgColor indexed="64"/></patternFill></fill>`
  const existing = registry.fillIds.get(fillXml)
  if (existing !== undefined) {
    return existing
  }

  const nextId = registry.fills.length
  registry.fills.push(fillXml)
  registry.fillIds.set(fillXml, nextId)
  return nextId
}

function resolveNumFmtId(format: CellFormat, registry: StyleRegistry): number {
  const builtInId = BUILTIN_NUM_FMT_IDS[format.numberFormat || 'general']
  if (builtInId !== undefined) {
    return builtInId
  }

  const formatCode = getNumFmtCode(format.numberFormat)
  if (!formatCode) {
    return 0
  }

  const existing = registry.customNumFmtIds.get(formatCode)
  if (existing !== undefined) {
    return existing
  }

  const nextId = registry.nextNumFmtId++
  registry.customNumFmts.push({ id: nextId, code: formatCode })
  registry.customNumFmtIds.set(formatCode, nextId)
  return nextId
}

function hasExportableStyle(format?: CellFormat): format is CellFormat {
  return !!format && (
    typeof format.bgColor === 'string' ||
    typeof format.textColor === 'string' ||
    !!format.bold ||
    !!format.italic ||
    !!format.underline ||
    !!format.align ||
    !!format.wrapText ||
    typeof format.fontSize === 'number' ||
    (!!format.numberFormat && format.numberFormat !== 'general')
  )
}

function getStyleIndex(format: CellFormat, registry: StyleRegistry): number {
  const fontId = (
    format.bold ||
    format.italic ||
    format.underline ||
    typeof format.textColor === 'string' ||
    typeof format.fontSize === 'number'
  )
    ? registerFont(format, registry)
    : 0

  const fillId = typeof format.bgColor === 'string' ? registerFill(format, registry) : 0
  const numFmtId = resolveNumFmtId(format, registry)
  const alignment = (format.align || format.wrapText)
    ? {
        horizontal: format.align,
        wrapText: format.wrapText ? '1' : undefined,
      }
    : null

  const styleKey = JSON.stringify({ numFmtId, fontId, fillId, alignment })
  const existing = registry.styleIds.get(styleKey)
  if (existing !== undefined) {
    return existing
  }

  const attrs = [
    `numFmtId="${numFmtId}"`,
    `fontId="${fontId}"`,
    `fillId="${fillId}"`,
    'borderId="0"',
    'xfId="0"',
  ]

  if (numFmtId !== 0) attrs.push('applyNumberFormat="1"')
  if (fontId !== 0) attrs.push('applyFont="1"')
  if (fillId !== 0) attrs.push('applyFill="1"')

  let xfXml = ''
  if (alignment) {
    attrs.push('applyAlignment="1"')
    const alignmentAttrs = [
      alignment.horizontal ? `horizontal="${alignment.horizontal}"` : '',
      alignment.wrapText ? `wrapText="${alignment.wrapText}"` : '',
    ].filter(Boolean).join(' ')
    xfXml = `<xf ${attrs.join(' ')}><alignment ${alignmentAttrs}/></xf>`
  } else {
    xfXml = `<xf ${attrs.join(' ')}/>`
  }

  const nextId = registry.cellXfs.length
  registry.cellXfs.push(xfXml)
  registry.styleIds.set(styleKey, nextId)
  return nextId
}

function buildStylesXml(registry: StyleRegistry): string {
  const numFmtsXml = registry.customNumFmts.length > 0
    ? `<numFmts count="${registry.customNumFmts.length}">${registry.customNumFmts.map(({ id, code }) => (
      `<numFmt numFmtId="${id}" formatCode="${escapeXml(code)}"/>`
    )).join('')}</numFmts>`
    : ''

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<styleSheet xmlns="${STYLE_SHEET_XMLNS}" xmlns:vt="${VT_XMLNS}">`,
    numFmtsXml,
    `<fonts count="${registry.fonts.length}">${registry.fonts.join('')}</fonts>`,
    `<fills count="${registry.fills.length}">${registry.fills.join('')}</fills>`,
    `<borders count="1">${DEFAULT_BORDER_XML}</borders>`,
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
    `<cellXfs count="${registry.cellXfs.length}">${registry.cellXfs.join('')}</cellXfs>`,
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>',
    '<dxfs count="0"/>',
    '<tableStyles count="0" defaultTableStyle="TableStyleMedium9" defaultPivotStyle="PivotStyleMedium4"/>',
    '</styleSheet>',
  ].join('')
}

function applySheetStyles(sheetXml: string, styleAssignments: Map<string, number>): string {
  let nextXml = sheetXml

  styleAssignments.forEach((styleIndex, address) => {
    const cellPattern = new RegExp(`<c([^>]*)\\br="${escapeRegExp(address)}"([^>]*)>`, 'g')
    nextXml = nextXml.replace(cellPattern, (match) => {
      const withoutStyle = match.replace(/\s+s="[^"]*"/g, '')
      return withoutStyle.replace('<c', `<c s="${styleIndex}"`)
    })
  })

  return nextXml
}

function applyWorkbookStyles(baseBuffer: ArrayBuffer, sheets: Sheet[]) {
  const registry = createStyleRegistry()
  const styleAssignments = sheets.map(() => new Map<string, number>())

  sheets.forEach((sheet, sheetIndex) => {
    Object.entries(sheet.cells).forEach(([key, cell]) => {
      if (!hasExportableStyle(cell.format)) return

      const styleIndex = getStyleIndex(cell.format, registry)
      if (styleIndex === 0) return

      const [row, col] = parseCellKey(key)
      const address = XLSX.utils.encode_cell({ r: row, c: col })
      styleAssignments[sheetIndex].set(address, styleIndex)
    })
  })

  if (styleAssignments.every((sheetMap) => sheetMap.size === 0)) {
    return baseBuffer
  }

  const zip = CFB.read(new Uint8Array(baseBuffer), { type: 'buffer' })
  replaceZipTextFile(zip, '/xl/styles.xml', buildStylesXml(registry))

  styleAssignments.forEach((sheetMap, sheetIndex) => {
    if (sheetMap.size === 0) return

    const sheetPath = `/xl/worksheets/sheet${sheetIndex + 1}.xml`
    const entry = CFB.find(zip, sheetPath)
    if (!entry) return

    const patchedXml = applySheetStyles(decodeBinaryText(entry.content), sheetMap)
    replaceZipTextFile(zip, sheetPath, patchedXml)
  })

  return toArrayBuffer(CFB.write(zip, { fileType: 'zip', type: 'buffer' }) as Uint8Array)
}

function toWorksheetValue(cell: CellData) {
  if (cell.formula) {
    return cell.computedValue ?? null
  }

  return cell.value
}

function inferScalarCell(value: string): XLSX.CellObject {
  const trimmed = value.trim()

  if (trimmed === 'TRUE' || trimmed === 'FALSE') {
    return {
      t: 'b',
      v: trimmed === 'TRUE',
    }
  }

  if (trimmed !== '' && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    return {
      t: 'n',
      v: Number(trimmed),
    }
  }

  return {
    t: 's',
    v: value,
  }
}

function toWorksheetCell(cell: CellData): XLSX.CellObject {
  const rawValue = toWorksheetValue(cell)

  if (cell.formula) {
    const formulaCell: XLSX.CellObject = {
      f: cell.formula,
      t: 's',
    }

    if (typeof rawValue === 'number') {
      formulaCell.t = 'n'
      formulaCell.v = rawValue
    } else if (typeof rawValue === 'boolean') {
      formulaCell.t = 'b'
      formulaCell.v = rawValue
    } else if (rawValue !== null && rawValue !== undefined && rawValue !== '') {
      formulaCell.t = 's'
      formulaCell.v = String(rawValue)
    }

    return formulaCell
  }

  return inferScalarCell(String(rawValue ?? ''))
}

function buildWorksheet(sheet: Sheet): XLSX.WorkSheet {
  const worksheet: XLSX.WorkSheet = {}
  let maxRow = 0
  let maxCol = 0

  Object.entries(sheet.cells).forEach(([key, cell]) => {
    const [row, col] = parseCellKey(key)
    const address = XLSX.utils.encode_cell({ r: row, c: col })
    worksheet[address] = toWorksheetCell(cell)
    maxRow = Math.max(maxRow, row)
    maxCol = Math.max(maxCol, col)
  })

  Object.keys(sheet.rowHeights).forEach((row) => {
    maxRow = Math.max(maxRow, Number(row))
  })
  Object.keys(sheet.colWidths).forEach((col) => {
    maxCol = Math.max(maxCol, Number(col))
  })

  worksheet['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: maxRow, c: maxCol },
  })

  if (Object.keys(sheet.colWidths).length > 0) {
    const cols: XLSX.ColInfo[] = []
    Object.entries(sheet.colWidths).forEach(([colIndex, width]) => {
      cols[Number(colIndex)] = { wpx: width }
    })
    worksheet['!cols'] = cols
  }

  if (Object.keys(sheet.rowHeights).length > 0) {
    const rows: XLSX.RowInfo[] = []
    Object.entries(sheet.rowHeights).forEach(([rowIndex, height]) => {
      rows[Number(rowIndex)] = { hpx: height }
    })
    worksheet['!rows'] = rows
  }

  return worksheet
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = sanitizeFileName(fileName)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function exportWorkbookBuffer(sheets: Sheet[]) {
  const workbook = XLSX.utils.book_new()

  sheets.forEach((sheet) => {
    const worksheet = buildWorksheet(sheet)
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name)
  })

  const baseBuffer = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
    cellStyles: true,
  }) as ArrayBuffer

  return applyWorkbookStyles(baseBuffer, sheets)
}

export function exportWorkbookFile(sheets: Sheet[], fileName: string) {
  const buffer = exportWorkbookBuffer(sheets)
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  downloadBlob(blob, fileName)
}

export function exportSheetCsv(sheet: Sheet, fileName: string) {
  const worksheet = buildWorksheet(sheet)
  const csv = XLSX.utils.sheet_to_csv(worksheet)
  const utf8Bom = new Uint8Array([0xef, 0xbb, 0xbf])
  const blob = new Blob([utf8Bom, csv], {
    type: 'text/csv;charset=utf-8',
  })
  downloadBlob(blob, fileName)
}
