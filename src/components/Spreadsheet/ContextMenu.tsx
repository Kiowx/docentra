import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useSpreadsheetStore } from '@/store/useSpreadsheetStore'
import { computeAutoFitColumnWidth, computeAutoFitRowHeight } from '@/utils/autoFit'
import { getActiveRange as getActiveRangeUtil } from '@/utils/cellUtils'

interface MenuItem {
  label: string
  action: () => void
  separator?: boolean
}

const ContextMenu: React.FC = React.memo(() => {
  const menuRef = useRef<HTMLDivElement>(null)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const contextMenu = useSpreadsheetStore((s) => s.contextMenu)
  const activeSheet = useSpreadsheetStore((s) => s.sheets.find((sh) => sh.id === s.activeSheetId) || s.sheets[0])
  const hideContextMenu = useSpreadsheetStore((s) => s.hideContextMenu)
  const selection = useSpreadsheetStore((s) => s.selection)
  const copy = useSpreadsheetStore((s) => s.copy)
  const cut = useSpreadsheetStore((s) => s.cut)
  const paste = useSpreadsheetStore((s) => s.paste)
  const clearCells = useSpreadsheetStore((s) => s.clearCells)
  const addRow = useSpreadsheetStore((s) => s.addRow)
  const deleteRow = useSpreadsheetStore((s) => s.deleteRow)
  const addColumn = useSpreadsheetStore((s) => s.addColumn)
  const deleteColumn = useSpreadsheetStore((s) => s.deleteColumn)
  const sortRange = useSpreadsheetStore((s) => s.sortRange)
  const setColWidth = useSpreadsheetStore((s) => s.setColWidth)
  const setRowHeight = useSpreadsheetStore((s) => s.setRowHeight)
  const undo = useSpreadsheetStore((s) => s.undo)
  const redo = useSpreadsheetStore((s) => s.redo)

  const getActiveRange = useCallback(() => getActiveRangeUtil(selection), [selection])

  const handleCut = useCallback(() => {
    const range = getActiveRange()
    cut(range)
    hideContextMenu()
  }, [cut, getActiveRange, hideContextMenu])

  const handleCopy = useCallback(() => {
    const range = getActiveRange()
    copy(range)
    hideContextMenu()
  }, [copy, getActiveRange, hideContextMenu])

  const handlePaste = useCallback(() => {
    paste(selection.activeCell)
    hideContextMenu()
  }, [paste, selection.activeCell, hideContextMenu])

  const handleInsertRowAbove = useCallback(() => {
    const rowIndex = contextMenu.targetIndex ?? selection.activeCell.row
    addRow(rowIndex)
    hideContextMenu()
  }, [addRow, contextMenu.targetIndex, selection.activeCell.row, hideContextMenu])

  const handleInsertRowBelow = useCallback(() => {
    const rowIndex = contextMenu.targetIndex ?? selection.activeCell.row
    addRow(rowIndex + 1)
    hideContextMenu()
  }, [addRow, contextMenu.targetIndex, selection.activeCell.row, hideContextMenu])

  const handleInsertColLeft = useCallback(() => {
    const colIndex = contextMenu.targetIndex ?? selection.activeCell.col
    addColumn(colIndex)
    hideContextMenu()
  }, [addColumn, contextMenu.targetIndex, selection.activeCell.col, hideContextMenu])

  const handleInsertColRight = useCallback(() => {
    const colIndex = contextMenu.targetIndex ?? selection.activeCell.col
    addColumn(colIndex + 1)
    hideContextMenu()
  }, [addColumn, contextMenu.targetIndex, selection.activeCell.col, hideContextMenu])

  const handleDeleteRow = useCallback(() => {
    const rowIndex = contextMenu.targetIndex ?? selection.activeCell.row
    deleteRow(rowIndex)
    hideContextMenu()
  }, [deleteRow, contextMenu.targetIndex, selection.activeCell.row, hideContextMenu])

  const handleDeleteCol = useCallback(() => {
    const colIndex = contextMenu.targetIndex ?? selection.activeCell.col
    deleteColumn(colIndex)
    hideContextMenu()
  }, [deleteColumn, contextMenu.targetIndex, selection.activeCell.col, hideContextMenu])

  const handleSortAsc = useCallback(() => {
    const range = getActiveRange()
    sortRange(range, selection.activeCell.col, 'asc')
    hideContextMenu()
  }, [sortRange, getActiveRange, selection.activeCell.col, hideContextMenu])

  const handleSortDesc = useCallback(() => {
    const range = getActiveRange()
    sortRange(range, selection.activeCell.col, 'desc')
    hideContextMenu()
  }, [sortRange, getActiveRange, selection.activeCell.col, hideContextMenu])

  const handleClear = useCallback(() => {
    const range = getActiveRange()
    clearCells(range)
    hideContextMenu()
  }, [clearCells, getActiveRange, hideContextMenu])

  const handleUndo = useCallback(() => {
    undo()
    hideContextMenu()
  }, [hideContextMenu, undo])

  const handleRedo = useCallback(() => {
    redo()
    hideContextMenu()
  }, [hideContextMenu, redo])

  const handleAutoFitRow = useCallback(() => {
    const rowIndex = contextMenu.targetIndex ?? selection.activeCell.row
    if (!activeSheet) return
    setRowHeight(rowIndex, computeAutoFitRowHeight(activeSheet, rowIndex, activeSheet.colWidths))
    hideContextMenu()
  }, [activeSheet, contextMenu.targetIndex, hideContextMenu, selection.activeCell.row, setRowHeight])

  const handleAutoFitColumn = useCallback(() => {
    const colIndex = contextMenu.targetIndex ?? selection.activeCell.col
    if (!activeSheet) return
    setColWidth(colIndex, computeAutoFitColumnWidth(activeSheet, colIndex))
    hideContextMenu()
  }, [activeSheet, contextMenu.targetIndex, hideContextMenu, selection.activeCell.col, setColWidth])

  useEffect(() => {
    if (!contextMenu.visible) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        hideContextMenu()
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hideContextMenu()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [contextMenu.visible, hideContextMenu])

  if (!contextMenu.visible) return null

  const target = contextMenu.target || 'cell'

  // Build menu items FIRST (before referencing menuItems for clamping)
  const menuItems: MenuItem[] = []

  if (target === 'cell') {
    menuItems.push(
      { label: '撤销', action: handleUndo },
      { label: '重做', action: handleRedo },
      { label: '剪切', action: handleCut },
      { label: '复制', action: handleCopy },
      { label: '粘贴', action: handlePaste },
      { label: '清空内容', action: handleClear, separator: true },
      { label: '在上方插入行', action: handleInsertRowAbove },
      { label: '在下方插入行', action: handleInsertRowBelow },
      { label: '在左侧插入列', action: handleInsertColLeft },
      { label: '在右侧插入列', action: handleInsertColRight },
      { label: '删除行', action: handleDeleteRow, separator: true },
      { label: '删除列', action: handleDeleteCol },
      { label: '升序排序', action: handleSortAsc, separator: true },
      { label: '降序排序', action: handleSortDesc },
    )
  } else if (target === 'rowHeader') {
    menuItems.push(
      { label: '自动调整行高', action: handleAutoFitRow },
      { label: '在上方插入行', action: handleInsertRowAbove },
      { label: '在下方插入行', action: handleInsertRowBelow },
      { label: '删除行', action: handleDeleteRow, separator: true },
    )
  } else if (target === 'colHeader') {
    menuItems.push(
      { label: '自动调整列宽', action: handleAutoFitColumn },
      { label: '在左侧插入列', action: handleInsertColLeft },
      { label: '在右侧插入列', action: handleInsertColRight },
      { label: '删除列', action: handleDeleteCol, separator: true },
      { label: '升序排序', action: handleSortAsc, separator: true },
      { label: '降序排序', action: handleSortDesc },
    )
  }

  // Clamp position to viewport
  const menuWidth = 200
  const separatorCount = menuItems.filter(i => i.separator).length
  const menuHeight = menuItems.length * 32 + separatorCount * 9 + 16
  const clampedX = Math.min(contextMenu.x, window.innerWidth - menuWidth)
  const clampedY = Math.min(contextMenu.y, window.innerHeight - menuHeight)

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] bg-white border border-gray-300 rounded-md shadow-lg py-1 min-w-[180px] focus:outline-none"
      role="menu"
      aria-label="上下文菜单"
      style={{
        left: clampedX,
        top: clampedY,
      }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setFocusedIndex(prev => prev < menuItems.length - 1 ? prev + 1 : 0)
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          setFocusedIndex(prev => prev > 0 ? prev - 1 : menuItems.length - 1)
        } else if (e.key === 'Enter' && focusedIndex >= 0) {
          e.preventDefault()
          menuItems[focusedIndex]?.action()
        }
      }}
    >
      {menuItems.map((item, idx) => (
        <React.Fragment key={idx}>
          {item.separator && <div role="separator" className="h-px bg-gray-200 my-1" />}
          <button
            role="menuitem"
            className={`w-full text-left px-4 py-1.5 text-sm transition-colors duration-75 cursor-pointer flex items-center gap-2 ${
              focusedIndex === idx
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'
            }`}
            onClick={item.action}
          >
            {item.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  )
})

ContextMenu.displayName = 'ContextMenu'

export default ContextMenu
