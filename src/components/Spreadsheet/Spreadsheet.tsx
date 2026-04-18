import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSpreadsheetStore } from '@/store/useSpreadsheetStore'
import { TOTAL_COLS, TOTAL_ROWS } from '@/types'
import type { CellAddress, CellFormat, CellData } from '@/types'
import {
  cellKey,
  parseCellKey,
  colToLetter,
  computeOffsets,
  computeRowOffsets,
  findVisibleStart,
  findVisibleEnd,
  getSelectionRange,
} from '@/utils/cellUtils'
import { formatCellValue } from '@/utils/formulaEngine'
import { computeAutoFitColumnWidth, computeAutoFitRowHeight } from '@/utils/autoFit'
import { applyNumberFormat } from '@/utils/numberFormat'
import CellEditor from './CellEditor'
import ContextMenu from './ContextMenu'
import FindReplaceDialog from './FindReplaceDialog'
import AutoFilterDropdown from './AutoFilterDropdown'
import { DEFAULT_ROW_HEIGHT } from '@/types'

const HEADER_WIDTH = 50
const HEADER_HEIGHT = 25
const BUFFER = 3
const EMPTY_CELLS: Record<string, never> = {}

interface RenderedCellProps {
  x: number
  y: number
  width: number
  height: number
  value: string
  rawValue: string
  format?: CellFormat
}

const RenderedCell = React.memo<RenderedCellProps>(({
  x, y, width, height, value, rawValue, format,
}) => {
  const bgStyle: React.CSSProperties = {
    position: 'absolute',
    left: x,
    top: y,
    width,
    height,
  }

  const cellStyle: React.CSSProperties = {
    ...bgStyle,
    backgroundColor: format?.bgColor || '#fff',
    color: format?.textColor || '#111',
    fontWeight: format?.bold ? 'bold' : undefined,
    fontStyle: format?.italic ? 'italic' : undefined,
    textDecoration: format?.underline ? 'underline' : undefined,
    textAlign: format?.align || undefined,
    borderRight: '1px solid #e2e8f0',
    borderBottom: '1px solid #e2e8f0',
    padding: '1px 4px',
    fontSize: format?.fontSize ? `${format.fontSize}px` : '13px',
    lineHeight: '20px',
    overflow: 'hidden',
    whiteSpace: format?.wrapText ? 'pre-wrap' : 'nowrap',
    textOverflow: format?.wrapText ? 'clip' : 'ellipsis',
    wordBreak: format?.wrapText ? 'break-word' : undefined,
    boxSizing: 'border-box',
    pointerEvents: 'none',
  }

  const isNumeric = rawValue !== '' && !isNaN(Number(rawValue)) && rawValue.trim() !== ''
  if (!format?.align && isNumeric) {
    cellStyle.textAlign = 'right'
  }

  const displayValue = format?.numberFormat && format.numberFormat !== 'general'
    ? applyNumberFormat(rawValue, format.numberFormat)
    : value

  return (
    <div
      style={cellStyle}
    >
      {displayValue}
    </div>
  )
})
RenderedCell.displayName = 'RenderedCell'

interface RenderedCellsLayerProps {
  cells: Array<{
    row: number
    col: number
    x: number
    y: number
    width: number
    height: number
    value: string
    rawValue: string
    format?: CellFormat
  }>
}

const RenderedCellsLayer = React.memo<RenderedCellsLayerProps>(({
  cells,
}) => (
  <>
    {cells.map(({ row, col, x, y, width, height, value, rawValue, format }) => (
      <RenderedCell
        key={`${row}-${col}`}
        x={x}
        y={y}
        width={width}
        height={height}
        value={value}
        rawValue={rawValue}
        format={format}
      />
    ))}
  </>
))
RenderedCellsLayer.displayName = 'RenderedCellsLayer'

interface GridLinesLayerProps {
  verticalLines: number[]
  horizontalLines: number[]
  width: number
  height: number
}

const GridLinesLayer = React.memo<GridLinesLayerProps>(({
  verticalLines,
  horizontalLines,
  width,
  height,
}) => (
  <div className="pointer-events-none absolute inset-0">
    {verticalLines.map((left) => (
      <div
        key={`v-${left}`}
        className="absolute bg-slate-200"
        style={{ left: left - 1, top: 0, width: 1, height }}
      />
    ))}
    {horizontalLines.map((top) => (
      <div
        key={`h-${top}`}
        className="absolute bg-slate-200"
        style={{ left: 0, top: top - 1, width, height: 1 }}
      />
    ))}
  </div>
))
GridLinesLayer.displayName = 'GridLinesLayer'

// -- Navigation helpers --
function findDataEdge(
  cells: Record<string, CellData>,
  row: number,
  col: number,
  dRow: -1 | 0 | 1,
  dCol: -1 | 0 | 1,
): { row: number; col: number } {
  const hasData = (r: number, c: number): boolean => {
    const cell = cells[cellKey(r, c)]
    return !!cell && (cell.value !== '' || !!cell.formula)
  }

  const inBounds = (r: number, c: number): boolean =>
    r >= 0 && r < TOTAL_ROWS && c >= 0 && c < TOTAL_COLS

  let r = row, c = col
  const currentHasData = hasData(r, c)

  if (currentHasData) {
    while (inBounds(r + dRow, c + dCol) && hasData(r + dRow, c + dCol)) {
      r += dRow
      c += dCol
    }
  } else {
    while (inBounds(r + dRow, c + dCol) && !hasData(r + dRow, c + dCol)) {
      r += dRow
      c += dCol
    }
    if (inBounds(r + dRow, c + dCol) && hasData(r + dRow, c + dCol)) {
      r += dRow
      c += dCol
    }
  }

  return { row: r, col: c }
}

function findLastDataCell(cells: Record<string, CellData>): { row: number; col: number } {
  let maxRow = 0
  let maxCol = 0
  for (const key of Object.keys(cells)) {
    const [r, c] = parseCellKey(key)
    if (r > maxRow) maxRow = r
    if (c > maxCol) maxCol = c
  }
  return { row: maxRow, col: maxCol }
}

// -- Auto-fill helpers --
function detectSeries(values: (string | number)[]): { step: number; isSeries: boolean } {
  if (values.length < 2) return { step: 1, isSeries: false }
  const nums = values.map(Number)
  if (nums.some(isNaN)) return { step: 0, isSeries: false }
  const step = nums[1] - nums[0]
  for (let i = 2; i < nums.length; i++) {
    if (nums[i] - nums[i - 1] !== step) return { step: 0, isSeries: false }
  }
  return { step, isSeries: true }
}

// -- Main Spreadsheet Component --
const Spreadsheet: React.FC = React.memo(() => {
  // Store
  const activeSheet = useSpreadsheetStore((s) => s.sheets.find((sh) => sh.id === s.activeSheetId) || s.sheets[0])
  const selection = useSpreadsheetStore((s) => s.selection)
  const editMode = useSpreadsheetStore((s) => s.editMode)
  const editValue = useSpreadsheetStore((s) => s.editValue)

  const setActiveCell = useSpreadsheetStore((s) => s.setActiveCell)
  const setSelectionRange = useSpreadsheetStore((s) => s.setSelectionRange)
  const setEditMode = useSpreadsheetStore((s) => s.setEditMode)
  const setEditValue = useSpreadsheetStore((s) => s.setEditValue)
  const commitEdit = useSpreadsheetStore((s) => s.commitEdit)
  const cancelEdit = useSpreadsheetStore((s) => s.cancelEdit)
  const setColWidth = useSpreadsheetStore((s) => s.setColWidth)
  const setRowHeight = useSpreadsheetStore((s) => s.setRowHeight)
  const showContextMenu = useSpreadsheetStore((s) => s.showContextMenu)
  const copy = useSpreadsheetStore((s) => s.copy)
  const cut = useSpreadsheetStore((s) => s.cut)
  const paste = useSpreadsheetStore((s) => s.paste)
  const clearCells = useSpreadsheetStore((s) => s.clearCells)
  const setCellFormat = useSpreadsheetStore((s) => s.setCellFormat)
  const undo = useSpreadsheetStore((s) => s.undo)
  const redo = useSpreadsheetStore((s) => s.redo)

  // Refs
  const scrollRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const gridContentRef = useRef<HTMLDivElement>(null)
  const scrollRafRef = useRef<number | null>(null)
  const latestScrollRef = useRef({ scrollLeft: 0, scrollTop: 0 })
  const isDragging = useRef(false)
  const dragStart = useRef<CellAddress | null>(null)
  const compositionActiveRef = useRef(false)

  // Auto-fill state
  const isAutoFilling = useRef(false)
  const autoFillAnchor = useRef<CellAddress | null>(null)
  const [autoFillRange, setAutoFillRange] = useState<{ startRow: number; startCol: number; endRow: number; endCol: number } | null>(null)
  const [doubleClickCursorOffset, setDoubleClickCursorOffset] = useState<number | null>(null)
  const [findReplaceVisible, setFindReplaceVisible] = useState(false)
  const [findReplaceMode, setFindReplaceMode] = useState<'find' | 'replace'>('find')
  const [filterDropdown, setFilterDropdown] = useState<{ col: number; rect: DOMRect } | null>(null)

  // Viewport state
  const [viewportWidth, setViewportWidth] = useState(800)
  const [viewportHeight, setViewportHeight] = useState(600)
  const [scrollPosition, setScrollPosition] = useState({ scrollLeft: 0, scrollTop: 0 })

  const colWidths = activeSheet?.colWidths || {}
  const rowHeights = activeSheet?.rowHeights || {}
  const sheetCells = activeSheet?.cells || EMPTY_CELLS

  // Compute offsets
  const colOffsets = useMemo(
    () => computeOffsets(colWidths, TOTAL_COLS),
    [colWidths]
  )
  const rowOffsets = useMemo(
    () => computeRowOffsets(rowHeights, TOTAL_ROWS),
    [rowHeights]
  )

  // Total content size
  const totalWidth = colOffsets[TOTAL_COLS]
  const totalHeight = rowOffsets[TOTAL_ROWS]

  // Visible range
  const scrollLeft = scrollPosition.scrollLeft
  const scrollTop = scrollPosition.scrollTop

  const visColStart = useMemo(
    () => Math.max(0, findVisibleStart(colOffsets, scrollLeft) - BUFFER),
    [colOffsets, scrollLeft]
  )
  const visColEnd = useMemo(
    () => Math.min(TOTAL_COLS - 1, findVisibleEnd(colOffsets, scrollLeft, viewportWidth - HEADER_WIDTH) + BUFFER),
    [colOffsets, scrollLeft, viewportWidth]
  )
  const visRowStart = useMemo(
    () => Math.max(0, findVisibleStart(rowOffsets, scrollTop) - BUFFER),
    [rowOffsets, scrollTop]
  )
  const visRowEnd = useMemo(
    () => Math.min(TOTAL_ROWS - 1, findVisibleEnd(rowOffsets, scrollTop, viewportHeight - HEADER_HEIGHT) + BUFFER),
    [rowOffsets, scrollTop, viewportHeight]
  )

  // Selection range
  const selRange = useMemo(() => getSelectionRange(selection), [selection])
  const selectedAll = Boolean(
    selRange
    && selRange.startRow === 0
    && selRange.startCol === 0
    && selRange.endRow === TOTAL_ROWS - 1
    && selRange.endCol === TOTAL_COLS - 1
  )
  const selectedRowRange = useMemo(() => (
    selRange && selRange.startCol === 0 && selRange.endCol === TOTAL_COLS - 1
      ? { startRow: selRange.startRow, endRow: selRange.endRow }
      : null
  ), [selRange])
  const selectedColRange = useMemo(() => (
    selRange && selRange.startRow === 0 && selRange.endRow === TOTAL_ROWS - 1
      ? { startCol: selRange.startCol, endCol: selRange.endCol }
      : null
  ), [selRange])

  // Resize observer for viewport
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportWidth(entry.contentRect.width)
        setViewportHeight(entry.contentRect.height)
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  useEffect(() => (
    () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current)
      }
    }
  ), [])

  // Scroll handler
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    latestScrollRef.current = {
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
    }
    if (scrollRafRef.current !== null) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      setScrollPosition(latestScrollRef.current)
    })
  }, [])

  const getCellData = useCallback((row: number, col: number) => {
    return sheetCells[cellKey(row, col)]
  }, [sheetCells])

  const resolveCellFromPointer = useCallback((clientX: number, clientY: number) => {
    const grid = gridContentRef.current
    if (!grid) return null

    const rect = grid.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top

    if (x < 0 || y < 0 || x > totalWidth || y > totalHeight) {
      return null
    }

    return {
      row: Math.min(TOTAL_ROWS - 1, findVisibleStart(rowOffsets, y)),
      col: Math.min(TOTAL_COLS - 1, findVisibleStart(colOffsets, x)),
    }
  }, [colOffsets, rowOffsets, totalHeight, totalWidth])

  // Mouse handlers for selection
  const handleGridMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 2) return // right-click handled by context menu
    const cell = resolveCellFromPointer(e.clientX, e.clientY)
    if (!cell) return

    e.preventDefault()
    containerRef.current?.focus()

    if (editMode !== 'none') {
      commitEdit()
    }

    if (e.shiftKey) {
      // Extend selection
      setSelectionRange(selection.activeCell, cell)
    } else {
      setActiveCell(cell.row, cell.col)
      isDragging.current = true
      dragStart.current = cell
    }
  }, [commitEdit, editMode, resolveCellFromPointer, selection.activeCell, setActiveCell, setSelectionRange])

  const handleGridMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || !dragStart.current) return
    if (e.buttons !== 1) {
      isDragging.current = false
      return
    }
    const cell = resolveCellFromPointer(e.clientX, e.clientY)
    if (!cell) return
    setSelectionRange(dragStart.current, cell)
  }, [resolveCellFromPointer, setSelectionRange])

  const handleMouseUp = useCallback(() => {
    isDragging.current = false
    dragStart.current = null
  }, [])

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseUp])

  const handleGridDoubleClick = useCallback((e: React.MouseEvent) => {
    const cell = resolveCellFromPointer(e.clientX, e.clientY)
    if (!cell) return

    setActiveCell(cell.row, cell.col)
    const cellData = getCellData(cell.row, cell.col)
    setEditValue(cellData?.value || '')
    setEditMode('cell')

    // Calculate cursor offset from cell left edge for positioning
    const cellLeft = colOffsets[cell.col]
    const cursorOffset = e.clientX - (gridContentRef.current?.getBoundingClientRect().left ?? 0) - cellLeft
    setDoubleClickCursorOffset(cursorOffset)
  }, [getCellData, resolveCellFromPointer, setActiveCell, setEditMode, setEditValue, colOffsets])

  // Context menu
  const handleGridContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const cell = resolveCellFromPointer(e.clientX, e.clientY)
    if (cell) {
      if (editMode !== 'none') {
        commitEdit()
      }
      const clickedInsideSelection = selRange
        && cell.row >= selRange.startRow
        && cell.row <= selRange.endRow
        && cell.col >= selRange.startCol
        && cell.col <= selRange.endCol

      if (!clickedInsideSelection) {
        setActiveCell(cell.row, cell.col)
      }
    }
    showContextMenu(e.clientX, e.clientY, 'cell')
  }, [commitEdit, editMode, resolveCellFromPointer, selRange, setActiveCell, showContextMenu])

  const handleRowHeaderContextMenu = useCallback((e: React.MouseEvent, rowIndex: number) => {
    e.preventDefault()
    e.stopPropagation()
    showContextMenu(e.clientX, e.clientY, 'rowHeader', rowIndex)
  }, [showContextMenu])

  const handleColHeaderContextMenu = useCallback((e: React.MouseEvent, colIndex: number) => {
    e.preventDefault()
    e.stopPropagation()
    showContextMenu(e.clientX, e.clientY, 'colHeader', colIndex)
  }, [showContextMenu])

  const handleSelectAll = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    containerRef.current?.focus()
    if (editMode !== 'none') {
      commitEdit()
    }
    setActiveCell(0, 0)
    setSelectionRange({ row: 0, col: 0 }, { row: TOTAL_ROWS - 1, col: TOTAL_COLS - 1 })
  }, [commitEdit, editMode, setActiveCell, setSelectionRange])

  const handleRowHeaderMouseDown = useCallback((row: number, e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    containerRef.current?.focus()

    if (editMode !== 'none') {
      commitEdit()
    }

    const anchorRow = e.shiftKey ? selection.activeCell.row : row
    setActiveCell(row, selection.activeCell.col)
    setSelectionRange(
      { row: anchorRow, col: 0 },
      { row, col: TOTAL_COLS - 1 },
    )
  }, [commitEdit, editMode, selection.activeCell, setActiveCell, setSelectionRange])

  const handleColHeaderMouseDown = useCallback((col: number, e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    containerRef.current?.focus()

    if (editMode !== 'none') {
      commitEdit()
    }

    const anchorCol = e.shiftKey ? selection.activeCell.col : col
    setActiveCell(selection.activeCell.row, col)
    setSelectionRange(
      { row: 0, col: anchorCol },
      { row: TOTAL_ROWS - 1, col },
    )
  }, [commitEdit, editMode, selection.activeCell, setActiveCell, setSelectionRange])

  // Ensure a cell is visible by scrolling
  const ensureVisible = useCallback((row: number, col: number) => {
    const el = scrollRef.current
    if (!el) return

    const cellLeft = colOffsets[col]
    const cellTop = rowOffsets[row]
    const cellWidth = colOffsets[col + 1] - colOffsets[col]
    const cellHeight = rowOffsets[row + 1] - rowOffsets[row]

    const viewLeft = el.scrollLeft + HEADER_WIDTH
    const viewTop = el.scrollTop + HEADER_HEIGHT
    const viewRight = el.scrollLeft + el.clientWidth
    const viewBottom = el.scrollTop + el.clientHeight

    let newScrollLeft = el.scrollLeft
    let newScrollTop = el.scrollTop

    if (cellLeft < viewLeft) {
      newScrollLeft = cellLeft - HEADER_WIDTH
    } else if (cellLeft + cellWidth > viewRight) {
      newScrollLeft = cellLeft + cellWidth - el.clientWidth + HEADER_WIDTH
    }

    if (cellTop < viewTop) {
      newScrollTop = cellTop - HEADER_HEIGHT
    } else if (cellTop + cellHeight > viewBottom) {
      newScrollTop = cellTop + cellHeight - el.clientHeight + HEADER_HEIGHT
    }

    if (newScrollLeft !== el.scrollLeft || newScrollTop !== el.scrollTop) {
      el.scrollLeft = Math.max(0, newScrollLeft)
      el.scrollTop = Math.max(0, newScrollTop)
      const nextScroll = {
        scrollLeft: Math.max(0, newScrollLeft),
        scrollTop: Math.max(0, newScrollTop),
      }
      latestScrollRef.current = nextScroll
      setScrollPosition(nextScroll)
    }
  }, [colOffsets, rowOffsets])

  const navigateAfterEdit = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    const { row, col } = selection.activeCell
    commitEdit()

    // Return focus to the grid container after commit
    requestAnimationFrame(() => containerRef.current?.focus())

    switch (direction) {
      case 'up':
        setActiveCell(Math.max(0, row - 1), col)
        ensureVisible(Math.max(0, row - 1), col)
        break
      case 'down':
        setActiveCell(Math.min(TOTAL_ROWS - 1, row + 1), col)
        ensureVisible(Math.min(TOTAL_ROWS - 1, row + 1), col)
        break
      case 'left':
        setActiveCell(row, Math.max(0, col - 1))
        ensureVisible(row, Math.max(0, col - 1))
        break
      case 'right':
        setActiveCell(row, Math.min(TOTAL_COLS - 1, col + 1))
        ensureVisible(row, Math.min(TOTAL_COLS - 1, col + 1))
        break
    }
  }, [commitEdit, ensureVisible, selection.activeCell, setActiveCell])

  // Keyboard handling
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || compositionActiveRef.current || e.key === 'Process') {
      if (editMode === 'none' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setEditValue('')
        setEditMode('cell')
      }
      return
    }

    const { activeCell } = selection
    const isNav = editMode === 'none'

    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'a') {
        e.preventDefault()
        setActiveCell(0, 0)
        setSelectionRange({ row: 0, col: 0 }, { row: TOTAL_ROWS - 1, col: TOTAL_COLS - 1 })
        return
      }
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }
      if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault()
        redo()
        return
      }

      const range = selRange || {
        startRow: activeCell.row,
        startCol: activeCell.col,
        endRow: activeCell.row,
        endCol: activeCell.col,
      }

      if (e.key === 'c') {
        e.preventDefault()
        copy(range)
        return
      }
      if (e.key === 'x') {
        e.preventDefault()
        cut(range)
        return
      }
      if (e.key === 'v') {
        e.preventDefault()
        paste(activeCell)
        return
      }
      if (e.key === 'f' || e.key === 'h') {
        e.preventDefault()
        setFindReplaceMode(e.key === 'h' ? 'replace' : 'find')
        setFindReplaceVisible(true)
        return
      }

      if (isNav) {
        const formatRange = selRange || {
          startRow: activeCell.row,
          startCol: activeCell.col,
          endRow: activeCell.row,
          endCol: activeCell.col,
        }
        const currentCell = getCellData(activeCell.row, activeCell.col)
        if (e.key === 'b') {
          e.preventDefault()
          setCellFormat(formatRange, { bold: !currentCell?.format?.bold })
          return
        }
        if (e.key === 'i') {
          e.preventDefault()
          setCellFormat(formatRange, { italic: !currentCell?.format?.italic })
          return
        }
        if (e.key === 'u') {
          e.preventDefault()
          setCellFormat(formatRange, { underline: !currentCell?.format?.underline })
          return
        }
      }
    }

    if (!isNav) {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancelEdit()
      }
      return
    }

    let newRow = activeCell.row
    let newCol = activeCell.col

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        if (e.shiftKey && (e.ctrlKey || e.metaKey)) {
          const from = selection.rangeEnd ?? activeCell
          const edge = findDataEdge(sheetCells, from.row, from.col, -1, 0)
          setSelectionRange(activeCell, edge)
          ensureVisible(edge.row, edge.col)
          return
        }
        if (e.ctrlKey || e.metaKey) {
          const edge = findDataEdge(sheetCells, activeCell.row, activeCell.col, -1, 0)
          setActiveCell(edge.row, edge.col)
          ensureVisible(edge.row, edge.col)
          return
        }
        if (e.shiftKey) {
          const from = selection.rangeEnd ?? activeCell
          const newEnd = { row: Math.max(0, from.row - 1), col: from.col }
          setSelectionRange(activeCell, newEnd)
          ensureVisible(newEnd.row, newEnd.col)
          return
        }
        newRow = Math.max(0, activeCell.row - 1)
        break
      case 'ArrowDown':
        e.preventDefault()
        if (e.shiftKey && (e.ctrlKey || e.metaKey)) {
          const from = selection.rangeEnd ?? activeCell
          const edge = findDataEdge(sheetCells, from.row, from.col, 1, 0)
          setSelectionRange(activeCell, edge)
          ensureVisible(edge.row, edge.col)
          return
        }
        if (e.ctrlKey || e.metaKey) {
          const edge = findDataEdge(sheetCells, activeCell.row, activeCell.col, 1, 0)
          setActiveCell(edge.row, edge.col)
          ensureVisible(edge.row, edge.col)
          return
        }
        if (e.shiftKey) {
          const from = selection.rangeEnd ?? activeCell
          const newEnd = { row: Math.min(TOTAL_ROWS - 1, from.row + 1), col: from.col }
          setSelectionRange(activeCell, newEnd)
          ensureVisible(newEnd.row, newEnd.col)
          return
        }
        newRow = Math.min(TOTAL_ROWS - 1, activeCell.row + 1)
        break
      case 'ArrowLeft':
        e.preventDefault()
        if (e.shiftKey && (e.ctrlKey || e.metaKey)) {
          const from = selection.rangeEnd ?? activeCell
          const edge = findDataEdge(sheetCells, from.row, from.col, 0, -1)
          setSelectionRange(activeCell, edge)
          ensureVisible(edge.row, edge.col)
          return
        }
        if (e.ctrlKey || e.metaKey) {
          const edge = findDataEdge(sheetCells, activeCell.row, activeCell.col, 0, -1)
          setActiveCell(edge.row, edge.col)
          ensureVisible(edge.row, edge.col)
          return
        }
        if (e.shiftKey) {
          const from = selection.rangeEnd ?? activeCell
          const newEnd = { row: from.row, col: Math.max(0, from.col - 1) }
          setSelectionRange(activeCell, newEnd)
          ensureVisible(newEnd.row, newEnd.col)
          return
        }
        newCol = Math.max(0, activeCell.col - 1)
        break
      case 'ArrowRight':
        e.preventDefault()
        if (e.shiftKey && (e.ctrlKey || e.metaKey)) {
          const from = selection.rangeEnd ?? activeCell
          const edge = findDataEdge(sheetCells, from.row, from.col, 0, 1)
          setSelectionRange(activeCell, edge)
          ensureVisible(edge.row, edge.col)
          return
        }
        if (e.ctrlKey || e.metaKey) {
          const edge = findDataEdge(sheetCells, activeCell.row, activeCell.col, 0, 1)
          setActiveCell(edge.row, edge.col)
          ensureVisible(edge.row, edge.col)
          return
        }
        if (e.shiftKey) {
          const from = selection.rangeEnd ?? activeCell
          const newEnd = { row: from.row, col: Math.min(TOTAL_COLS - 1, from.col + 1) }
          setSelectionRange(activeCell, newEnd)
          ensureVisible(newEnd.row, newEnd.col)
          return
        }
        newCol = Math.min(TOTAL_COLS - 1, activeCell.col + 1)
        break
      case 'Tab':
        e.preventDefault()
        newCol = e.shiftKey
          ? Math.max(0, activeCell.col - 1)
          : Math.min(TOTAL_COLS - 1, activeCell.col + 1)
        break
      case 'Enter':
        e.preventDefault()
        newRow = e.shiftKey
          ? Math.max(0, activeCell.row - 1)
          : Math.min(TOTAL_ROWS - 1, activeCell.row + 1)
        break
      case 'Home':
        e.preventDefault()
        if (e.ctrlKey || e.metaKey) {
          setActiveCell(0, 0)
          ensureVisible(0, 0)
          return
        }
        newCol = 0
        break
      case 'End':
        e.preventDefault()
        if (e.ctrlKey || e.metaKey) {
          const last = findLastDataCell(sheetCells)
          setActiveCell(last.row, last.col)
          ensureVisible(last.row, last.col)
          return
        }
        {
          let c = activeCell.col
          while (c < TOTAL_COLS - 1 && sheetCells[cellKey(activeCell.row, c + 1)]) c++
          newCol = c
        }
        break
      case 'PageUp':
        e.preventDefault()
        {
          const pageRows = Math.max(1, Math.floor((viewportHeight - HEADER_HEIGHT) / DEFAULT_ROW_HEIGHT) - 1)
          newRow = Math.max(0, activeCell.row - pageRows)
        }
        break
      case 'PageDown':
        e.preventDefault()
        {
          const pageRows = Math.max(1, Math.floor((viewportHeight - HEADER_HEIGHT) / DEFAULT_ROW_HEIGHT) - 1)
          newRow = Math.min(TOTAL_ROWS - 1, activeCell.row + pageRows)
        }
        break
      case 'Delete':
      case 'Backspace':
        e.preventDefault()
        if (selRange) {
          clearCells(selRange)
        } else {
          clearCells({
            startRow: activeCell.row,
            startCol: activeCell.col,
            endRow: activeCell.row,
            endCol: activeCell.col,
          })
        }
        return
      case 'F2':
        e.preventDefault()
        {
          const cellData = getCellData(activeCell.row, activeCell.col)
          setEditValue(cellData?.value || '')
          setEditMode('cell')
          setDoubleClickCursorOffset(null)
        }
        return
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault()
          setEditValue(e.key)
          setEditMode('cell')
          setDoubleClickCursorOffset(null)
        }
        return
    }

    setActiveCell(newRow, newCol)
    ensureVisible(newRow, newCol)
  }, [
    cancelEdit,
    clearCells,
    copy,
    cut,
    editMode,
    ensureVisible,
    getCellData,
    paste,
    selRange,
    selection,
    setActiveCell,
    setCellFormat,
    setEditMode,
    setEditValue,
    setSelectionRange,
    redo,
    undo,
  ])

  const handleGridCompositionStart = useCallback(() => {
    compositionActiveRef.current = true
    if (editMode === 'none') {
      setEditValue('')
      setEditMode('cell')
    }
  }, [editMode, setEditMode, setEditValue])

  const handleGridCompositionEnd = useCallback(() => {
    compositionActiveRef.current = false
  }, [])

  // Column resize
  const handleColResize = useCallback((colIndex: number, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.detail === 2) {
      if (!activeSheet) return
      setColWidth(colIndex, computeAutoFitColumnWidth(activeSheet, colIndex))
      return
    }

    const startX = e.clientX
    const startWidth = colOffsets[colIndex + 1] - colOffsets[colIndex]

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX
      setColWidth(colIndex, startWidth + delta)
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [activeSheet, colOffsets, setColWidth])

  // Row resize
  const handleRowResize = useCallback((rowIndex: number, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.detail === 2) {
      if (!activeSheet) return
      setRowHeight(rowIndex, computeAutoFitRowHeight(activeSheet, rowIndex, activeSheet.colWidths))
      return
    }

    const startY = e.clientY
    const startHeight = rowOffsets[rowIndex + 1] - rowOffsets[rowIndex]

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientY - startY
      setRowHeight(rowIndex, startHeight + delta)
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [activeSheet, rowOffsets, setRowHeight])

  // Auto-fill handle
  const handleAutoFillStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!selRange) return

    isAutoFilling.current = true
    autoFillAnchor.current = { row: selRange.endRow, col: selRange.endCol }

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isAutoFilling.current || !autoFillAnchor.current) return
      const cell = resolveCellFromPointer(moveEvent.clientX, moveEvent.clientY)
      if (!cell) return

      const anchor = autoFillAnchor.current
      const fillRange: typeof autoFillRange = {
        startRow: Math.min(selRange.startRow, cell.row),
        startCol: Math.min(selRange.startCol, cell.col),
        endRow: Math.max(selRange.endRow, cell.row),
        endCol: Math.max(selRange.endCol, cell.col),
      }

      // Only extend in one direction at a time (prefer the larger delta)
      const dRow = Math.abs(cell.row - anchor.row)
      const dCol = Math.abs(cell.col - anchor.col)
      if (dRow >= dCol) {
        fillRange.startCol = selRange.startCol
        fillRange.endCol = selRange.endCol
      } else {
        fillRange.startRow = selRange.startRow
        fillRange.endRow = selRange.endRow
      }

      setAutoFillRange(fillRange)
    }

    const handleMouseUp = () => {
      isAutoFilling.current = false
      autoFillAnchor.current = null
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''

      // Execute auto-fill
      const fillRng = autoFillRange
      if (fillRng && selRange) {
        executeAutoFill(selRange, fillRng)
      }
      setAutoFillRange(null)
    }

    document.body.style.cursor = 'crosshair'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [selRange, resolveCellFromPointer, autoFillRange])

  const setRange = useSpreadsheetStore((s) => s.setRange)

  const executeAutoFill = useCallback((
    source: { startRow: number; startCol: number; endRow: number; endCol: number },
    target: { startRow: number; startCol: number; endRow: number; endCol: number },
  ) => {
    const sourceRows = source.endRow - source.startRow + 1
    const sourceCols = source.endCol - source.startCol + 1

    // Determine fill direction and build data
    const isVertical = target.endRow > source.endRow || target.startRow < source.startRow
    const isHorizontal = target.endCol > source.endCol || target.startCol < source.startCol

    const data: string[][] = []

    if (isVertical && !isHorizontal) {
      // Fill downward or upward
      const numRows = target.endRow - target.startRow + 1
      for (let i = 0; i < numRows; i++) {
        const row: string[] = []
        for (let c = 0; c < sourceCols; c++) {
          const srcRow = source.startRow + (i % sourceRows)
          const cell = sheetCells[cellKey(srcRow, source.startCol + c)]
          row.push(cell?.value || '')
        }
        data.push(row)
      }

      // Try series detection for single-column source
      if (sourceCols === 1 && sourceRows >= 1) {
        const srcValues: (string | number)[] = []
        for (let r = source.startRow; r <= source.endRow; r++) {
          const cell = sheetCells[cellKey(r, source.startCol)]
          const val = cell?.computedValue ?? cell?.value ?? ''
          const strVal = String(val)
          const num = Number(strVal)
          srcValues.push(!isNaN(num) && strVal !== '' ? num : strVal)
        }
        const { isSeries, step } = detectSeries(srcValues)
        if (isSeries && typeof srcValues[srcValues.length - 1] === 'number') {
          const baseNum = srcValues[srcValues.length - 1] as number
          for (let i = 0; i < data.length; i++) {
            if (i >= sourceRows) {
              data[i][0] = String(baseNum + step * ((i - sourceRows + 1)))
            }
          }
        }
      }

      setRange(target.startRow, target.startCol, data)
    } else if (isHorizontal) {
      // Fill rightward or leftward
      const numCols = target.endCol - target.startCol + 1
      const numRows = target.endRow - target.startRow + 1
      for (let r = 0; r < numRows; r++) {
        const row: string[] = []
        for (let c = 0; c < numCols; c++) {
          const srcCol = source.startCol + (c % sourceCols)
          const srcRow = source.startRow + (r % sourceRows)
          const cell = sheetCells[cellKey(srcRow, srcCol)]
          row.push(cell?.value || '')
        }
        data.push(row)
      }

      // Try series detection for single-row source
      if (sourceRows === 1 && sourceCols >= 1) {
        const srcValues: (string | number)[] = []
        for (let c = source.startCol; c <= source.endCol; c++) {
          const cell = sheetCells[cellKey(source.startRow, c)]
          const val = cell?.computedValue ?? cell?.value ?? ''
          const strVal = String(val)
          const num = Number(strVal)
          srcValues.push(!isNaN(num) && strVal !== '' ? num : strVal)
        }
        const { isSeries, step } = detectSeries(srcValues)
        if (isSeries && typeof srcValues[srcValues.length - 1] === 'number') {
          const baseNum = srcValues[srcValues.length - 1] as number
          for (let c = 0; c < data[0].length; c++) {
            if (c >= sourceCols) {
              data[0][c] = String(baseNum + step * (c - sourceCols + 1))
            }
          }
        }
      }

      setRange(target.startRow, target.startCol, data)
    }
  }, [sheetCells, setRange])

  // Visible cells data
  const visibleCells = useMemo(() => {
    const cells: Array<{
      row: number
      col: number
      x: number
      y: number
      width: number
      height: number
      value: string
      rawValue: string
      format?: CellFormat
    }> = []

    for (let r = visRowStart; r <= visRowEnd; r++) {
      for (let c = visColStart; c <= visColEnd; c++) {
        const cellData = sheetCells[`${r},${c}`]
        if (!cellData) continue

        const displayValue = formatCellValue(cellData)
        if (displayValue === '' && !cellData.format) continue

        cells.push({
          row: r,
          col: c,
          x: colOffsets[c],
          y: rowOffsets[r],
          width: colOffsets[c + 1] - colOffsets[c],
          height: rowOffsets[r + 1] - rowOffsets[r],
          value: displayValue,
          rawValue: String(cellData.computedValue ?? cellData.value ?? ''),
          format: cellData.format,
        })
      }
    }
    return cells
  }, [visRowStart, visRowEnd, visColStart, visColEnd, colOffsets, rowOffsets, sheetCells])

  const verticalGridLines = useMemo(() => {
    const lines: number[] = []
    for (let c = visColStart; c <= visColEnd; c++) {
      lines.push(colOffsets[c + 1])
    }
    return lines
  }, [colOffsets, visColEnd, visColStart])

  const horizontalGridLines = useMemo(() => {
    const lines: number[] = []
    for (let r = visRowStart; r <= visRowEnd; r++) {
      lines.push(rowOffsets[r + 1])
    }
    return lines
  }, [rowOffsets, visRowEnd, visRowStart])

  // Column headers
  const colHeaders = useMemo(() => {
    const headers: Array<{ col: number; x: number; width: number; label: string }> = []
    for (let c = visColStart; c <= visColEnd; c++) {
      headers.push({
        col: c,
        x: colOffsets[c],
        width: colOffsets[c + 1] - colOffsets[c],
        label: colToLetter(c),
      })
    }
    return headers
  }, [visColStart, visColEnd, colOffsets])

  // Row headers
  const rowHeaders = useMemo(() => {
    const headers: Array<{ row: number; y: number; height: number }> = []
    for (let r = visRowStart; r <= visRowEnd; r++) {
      headers.push({
        row: r,
        y: rowOffsets[r],
        height: rowOffsets[r + 1] - rowOffsets[r],
      })
    }
    return headers
  }, [visRowStart, visRowEnd, rowOffsets])

  const activeCellRect = useMemo(() => {
    const { row, col } = selection.activeCell
    return {
      top: rowOffsets[row],
      left: colOffsets[col],
      width: colOffsets[col + 1] - colOffsets[col],
      height: rowOffsets[row + 1] - rowOffsets[row],
    }
  }, [selection.activeCell, colOffsets, rowOffsets])

  return (
    <div
      ref={containerRef}
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden outline-none"
      role="grid"
      aria-label="电子表格"
      onKeyDown={handleKeyDown}
      onCompositionStart={handleGridCompositionStart}
      onCompositionEnd={handleGridCompositionEnd}
      tabIndex={0}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Scroll container */}
      <div
        ref={scrollRef}
        className="grid-scroll relative flex-1 overflow-auto bg-white"
        onScroll={handleScroll}
        onMouseDown={() => containerRef.current?.focus()}
        style={{ cursor: 'default', scrollbarGutter: 'stable both-edges' }}
      >
        <div
          className="relative min-h-full min-w-full"
          style={{
            width: totalWidth + HEADER_WIDTH,
            height: totalHeight + HEADER_HEIGHT,
          }}
        >
          {/* Corner cell */}
          <div
            className={`absolute z-30 border-r border-b border-gray-400 ${
              selectedAll ? 'bg-blue-100' : 'bg-gray-100'
            }`}
            style={{
              width: HEADER_WIDTH,
              height: HEADER_HEIGHT,
              minWidth: HEADER_WIDTH,
              transform: `translate(${scrollLeft}px, ${scrollTop}px)`,
            }}
            onMouseDown={handleSelectAll}
            title="全选"
          />

          {/* Column headers */}
          <div
            className="pointer-events-none absolute left-0 top-0 z-20"
            style={{
              width: totalWidth + HEADER_WIDTH,
              height: HEADER_HEIGHT,
              transform: `translateY(${scrollTop}px)`,
            }}
          >
            {colHeaders.map(({ col, x, width, label }) => (
              <div
                key={`col-${col}`}
                className={`absolute border-r border-b border-gray-400 flex items-center justify-center
                  text-xs font-medium select-none pointer-events-auto ${
                    selectedColRange && col >= selectedColRange.startCol && col <= selectedColRange.endCol
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                style={{
                  left: x + HEADER_WIDTH,
                  top: 0,
                  width,
                  height: HEADER_HEIGHT,
                }}
                onMouseDown={(e) => handleColHeaderMouseDown(col, e)}
                onContextMenu={(e) => handleColHeaderContextMenu(e, col)}
              >
                {label}
                <button
                  className="absolute right-2 top-0 flex h-full w-4 items-center justify-center text-gray-400 hover:text-blue-500"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    setFilterDropdown({ col, rect })
                  }}
                  title="筛选"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                    <path d="M1 2h8L6 6v3L4 7V6L1 2z" />
                  </svg>
                </button>
                <div
                  className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-blue-400 transition-colors"
                  onMouseDown={(e) => handleColResize(col, e)}
                />
              </div>
            ))}
          </div>

          {/* Row headers */}
          <div
            className="pointer-events-none absolute left-0 top-0 z-[25]"
            style={{
              width: HEADER_WIDTH,
              height: totalHeight + HEADER_HEIGHT,
              transform: `translateX(${scrollLeft}px)`,
            }}
          >
            {rowHeaders.map(({ row, y, height }) => (
              <div
                key={`row-${row}`}
                className={`absolute border-r border-b border-gray-400 flex items-center justify-center
                  text-xs select-none pointer-events-auto ${
                    selectedRowRange && row >= selectedRowRange.startRow && row <= selectedRowRange.endRow
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                style={{
                  left: 0,
                  top: y + HEADER_HEIGHT,
                  width: HEADER_WIDTH,
                  height,
                }}
                onMouseDown={(e) => handleRowHeaderMouseDown(row, e)}
                onContextMenu={(e) => handleRowHeaderContextMenu(e, row)}
              >
                {row + 1}
                <div
                  className="absolute bottom-0 left-0 h-2 w-full cursor-row-resize hover:bg-blue-400 transition-colors"
                  onMouseDown={(e) => handleRowResize(row, e)}
                />
              </div>
            ))}
          </div>

          {/* Grid cells layer */}
          <div
            ref={gridContentRef}
            className="absolute select-none"
            style={{
              left: HEADER_WIDTH,
              top: HEADER_HEIGHT,
              width: totalWidth,
              height: totalHeight,
            }}
            onMouseDown={handleGridMouseDown}
            onMouseMove={handleGridMouseMove}
            onDoubleClick={handleGridDoubleClick}
            onContextMenu={handleGridContextMenu}
          >
            <GridLinesLayer
              verticalLines={verticalGridLines}
              horizontalLines={horizontalGridLines}
              width={totalWidth}
              height={totalHeight}
            />

            <RenderedCellsLayer cells={visibleCells} />

            {/* Selection highlight box for range */}
            {selRange && !(selRange.startRow === selRange.endRow && selRange.startCol === selRange.endCol) && (
              <div
                className="absolute pointer-events-none z-10"
                style={{
                  top: rowOffsets[selRange.startRow],
                  left: colOffsets[selRange.startCol],
                  width: colOffsets[selRange.endCol + 1] - colOffsets[selRange.startCol],
                  height: rowOffsets[selRange.endRow + 1] - rowOffsets[selRange.startRow],
                  backgroundColor: 'rgba(59, 130, 246, 0.08)',
                  border: '2px solid #3b82f6',
                  boxSizing: 'border-box',
                }}
              />
            )}

            {/* Active cell outline */}
            {editMode !== 'cell' && (
              <div
                className="absolute pointer-events-none z-20"
                style={{
                  top: activeCellRect.top,
                  left: activeCellRect.left,
                  width: activeCellRect.width,
                  height: activeCellRect.height,
                  border: '2px solid #3b82f6',
                  boxSizing: 'border-box',
                }}
              >
                <div
                  className="absolute bg-blue-500"
                  style={{
                    width: 6,
                    height: 6,
                    right: -4,
                    bottom: -4,
                  }}
                />
              </div>
            )}

            {/* Cell editor overlay */}
            {editMode === 'cell' && (
              <CellEditor
                position={{
                  top: activeCellRect.top,
                  left: activeCellRect.left,
                  width: activeCellRect.width,
                  height: activeCellRect.height,
                }}
                value={editValue}
                onChange={setEditValue}
                onCommit={commitEdit}
                onCancel={cancelEdit}
                onNavigate={navigateAfterEdit}
                initialCursorOffset={doubleClickCursorOffset}
              />
            )}
          </div>
        </div>
      </div>

      {/* Context menu */}
      <ContextMenu />

      {/* Find/Replace dialog */}
      {findReplaceVisible && (
        <FindReplaceDialog
          mode={findReplaceMode}
          onClose={() => setFindReplaceVisible(false)}
          onSwitchToReplace={() => setFindReplaceMode('replace')}
          onSwitchToFind={() => setFindReplaceMode('find')}
        />
      )}

      {/* Auto-filter dropdown */}
      {filterDropdown && (
        <AutoFilterDropdown
          col={filterDropdown.col}
          startRow={visRowStart}
          endRow={visRowEnd}
          anchorRect={filterDropdown.rect}
          onClose={() => setFilterDropdown(null)}
        />
      )}
    </div>
  )
})

Spreadsheet.displayName = 'Spreadsheet'

export default Spreadsheet
