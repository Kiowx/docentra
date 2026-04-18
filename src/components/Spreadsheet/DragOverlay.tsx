import React, { useCallback, useRef } from 'react'
import { useSpreadsheetStore } from '@/store/useSpreadsheetStore'
import { cellKey } from '@/utils/cellUtils'
import { findVisibleStart } from '@/utils/cellUtils'

interface DragOverlayProps {
  rowOffsets: number[]
  colOffsets: number[]
  gridContentRef: React.RefObject<HTMLDivElement | null>
  scrollRef: React.RefObject<HTMLDivElement | null>
}

export function useDragMove(
  selRange: { startRow: number; startCol: number; endRow: number; endCol: number } | null,
  rowOffsets: number[],
  colOffsets: number[],
  gridContentRef: React.RefObject<HTMLDivElement | null>,
  scrollRef: React.RefObject<HTMLDivElement | null>,
) {
  const isDragging = useRef(false)
  const dragStartPos = useRef<{ row: number; col: number } | null>(null)
  const activeSheet = useSpreadsheetStore((s) => s.sheets.find((sh) => sh.id === s.activeSheetId) || s.sheets[0])
  const setRange = useSpreadsheetStore((s) => s.setRange)
  const clearCells = useSpreadsheetStore((s) => s.clearCells)

  const resolveCell = useCallback((clientX: number, clientY: number) => {
    const grid = gridContentRef.current
    if (!grid) return null
    const rect = grid.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    if (x < 0 || y < 0) return null
    return {
      row: Math.min(rowOffsets.length - 2, findVisibleStart(rowOffsets, y)),
      col: Math.min(colOffsets.length - 2, findVisibleStart(colOffsets, x)),
    }
  }, [rowOffsets, colOffsets, gridContentRef])

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (!selRange || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    isDragging.current = true
    dragStartPos.current = { row: selRange.startRow, col: selRange.startCol }

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current) return
      moveEvent.preventDefault()
    }

    const handleMouseUp = (upEvent: MouseEvent) => {
      if (!isDragging.current) return
      isDragging.current = false
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''

      const target = resolveCell(upEvent.clientX, upEvent.clientY)
      if (!target || !selRange) return

      const dRow = target.row - selRange.startRow
      const dCol = target.col - selRange.startCol
      if (dRow === 0 && dCol === 0) return

      const sheet = activeSheet
      if (!sheet) return

      const data: string[][] = []
      for (let r = selRange.startRow; r <= selRange.endRow; r++) {
        const row: string[] = []
        for (let c = selRange.startCol; c <= selRange.endCol; c++) {
          const cell = sheet.cells[cellKey(r, c)]
          row.push(cell?.value || '')
        }
        data.push(row)
      }

      clearCells(selRange)
      setRange(target.row, target.col, data)
    }

    document.body.style.cursor = 'move'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [selRange, activeSheet, clearCells, setRange, resolveCell])

  return { handleDragStart }
}
