import React, { useCallback, useRef, useEffect } from 'react'
import { useSpreadsheetStore } from '@/store/useSpreadsheetStore'
import { addressToCellRef, cellKey } from '@/utils/cellUtils'
import { formatCellValue } from '@/utils/formulaEngine'
import { TOTAL_COLS, TOTAL_ROWS } from '@/types'

const FormulaBar: React.FC = React.memo(() => {
  const activeCell = useSpreadsheetStore((s) => s.selection.activeCell)
  const activeCellData = useSpreadsheetStore((s) => {
    const sheet = s.sheets.find((sh) => sh.id === s.activeSheetId) || s.sheets[0]
    return sheet?.cells[cellKey(s.selection.activeCell.row, s.selection.activeCell.col)]
  })
  const editMode = useSpreadsheetStore((s) => s.editMode)
  const editValue = useSpreadsheetStore((s) => s.editValue)
  const setEditMode = useSpreadsheetStore((s) => s.setEditMode)
  const setEditValue = useSpreadsheetStore((s) => s.setEditValue)
  const commitEdit = useSpreadsheetStore((s) => s.commitEdit)
  const cancelEdit = useSpreadsheetStore((s) => s.cancelEdit)
  const setActiveCell = useSpreadsheetStore((s) => s.setActiveCell)

  const formulaInputRef = useRef<HTMLInputElement>(null)
  const nameBoxRef = useRef<HTMLInputElement>(null)
  const isComposingRef = useRef(false)
  const [nameValue, setNameValue] = React.useState('')

  const cellRef = addressToCellRef(activeCell)
  const rawValue = activeCellData?.value || ''
  const displayValue = formatCellValue(activeCellData)
  const formulaDisplayValue = editMode !== 'none' ? editValue : rawValue

  useEffect(() => {
    if (document.activeElement !== nameBoxRef.current) {
      setNameValue(cellRef)
    }
  }, [cellRef])

  const handleNameBoxKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const value = (e.target as HTMLInputElement).value.trim().toUpperCase()
      const match = value.match(/^([A-Z]+)(\d+)$/)
      if (match) {
        const col = match[1]
        const row = parseInt(match[2]) - 1
        if (row >= 0) {
          let colNum = 0
          for (let i = 0; i < col.length; i++) {
            colNum = colNum * 26 + (col.charCodeAt(i) - 64)
          }
          colNum -= 1
          if (colNum >= 0 && colNum < TOTAL_COLS) {
            setActiveCell(Math.min(TOTAL_ROWS - 1, row), colNum)
          } else {
            setNameValue(cellRef)
          }
        }
      }
      ;(e.target as HTMLInputElement).blur()
    }
  }, [cellRef, setActiveCell])

  const handleFormulaFocus = useCallback(() => {
    if (editMode === 'cell') {
      setEditMode('formulaBar')
    }
    if (editMode === 'none') {
      setEditMode('formulaBar')
      setEditValue(rawValue)
    }
  }, [editMode, rawValue, setEditMode, setEditValue])

  const handleFormulaChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (editMode !== 'formulaBar') {
      setEditMode('formulaBar')
    }
    setEditValue(e.target.value)
  }, [editMode, setEditMode, setEditValue])

  const handleFormulaKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || isComposingRef.current || e.key === 'Process') {
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      commitEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    }
  }, [commitEdit, cancelEdit])

  useEffect(() => {
    if (editMode === 'formulaBar' && formulaInputRef.current) {
      formulaInputRef.current.focus()
    }
  }, [editMode])

  return (
    <div className="flex items-center h-7 border-b border-gray-200 bg-white select-none shrink-0">
      {/* Name box */}
      <div className="flex items-center w-20 h-full border-r border-gray-200">
        <input
          ref={nameBoxRef}
          className="w-full h-full text-[11px] text-center border-none outline-none bg-transparent
            focus:bg-blue-50 font-medium text-gray-600"
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          onKeyDown={handleNameBoxKeyDown}
          onBlur={() => setNameValue(cellRef)}
        />
      </div>

      {/* fx */}
      <div className="flex items-center justify-center w-8 h-full border-r border-gray-200 text-gray-400 text-[12px] italic select-none">
        fx
      </div>

      {/* Formula input */}
      <div className="flex-1 h-full px-2">
        <input
          ref={formulaInputRef}
          className="w-full h-full text-[12px] text-gray-800 border-none outline-none bg-transparent focus:bg-blue-50/50"
          value={formulaDisplayValue}
          onChange={handleFormulaChange}
          onFocus={handleFormulaFocus}
          onKeyDown={handleFormulaKeyDown}
          onCompositionStart={() => { isComposingRef.current = true }}
          onCompositionEnd={() => { isComposingRef.current = false }}
          spellCheck={false}
          placeholder={editMode === 'none' ? displayValue : undefined}
        />
      </div>
    </div>
  )
})

FormulaBar.displayName = 'FormulaBar'

export default FormulaBar
