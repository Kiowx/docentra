import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useSpreadsheetStore } from '@/store/useSpreadsheetStore'

const SheetTabs: React.FC = React.memo(() => {
  const sheets = useSpreadsheetStore((s) => s.sheets)
  const activeSheetId = useSpreadsheetStore((s) => s.activeSheetId)
  const setActiveSheet = useSpreadsheetStore((s) => s.setActiveSheet)
  const addSheet = useSpreadsheetStore((s) => s.addSheet)
  const deleteSheet = useSpreadsheetStore((s) => s.deleteSheet)
  const renameSheet = useSpreadsheetStore((s) => s.renameSheet)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingId])

  const handleDoubleClick = useCallback((e: React.MouseEvent, sheetId: string, currentName: string) => {
    e.stopPropagation()
    setEditingId(sheetId)
    setEditingName(currentName)
  }, [])

  const handleRenameCommit = useCallback(() => {
    if (editingId && editingName.trim()) {
      renameSheet(editingId, editingName.trim())
    }
    setEditingId(null)
    setEditingName('')
  }, [editingId, editingName, renameSheet])

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleRenameCommit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setEditingId(null)
      setEditingName('')
    }
  }, [handleRenameCommit])

  const handleAddSheet = useCallback(() => {
    addSheet()
  }, [addSheet])

  const handleRightClick = useCallback((e: React.MouseEvent, sheetId: string) => {
    e.preventDefault()
    e.stopPropagation()

    const sheet = sheets.find(s => s.id === sheetId)
    if (!sheet) return

    const actions: Array<{ label: string; action: () => void; danger?: boolean }> = [
      { label: `重命名”${sheet.name}”`, action: () => { setEditingId(sheetId); setEditingName(sheet.name) } },
    ]

    if (sheets.length > 1) {
      actions.push({ label: '删除工作表', action: () => { if (confirm(`确定要删除”${sheet.name}”吗？`)) deleteSheet(sheetId) }, danger: true })
    }

    const menu = document.createElement('div')
    menu.style.cssText = 'position:fixed;z-index:1000;background:white;border:1px solid #d1d5db;border-radius:6px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);padding:4px 0;min-width:160px;'
    menu.style.left = e.clientX + 'px'
    menu.style.top = e.clientY + 'px'

    const close = () => menu.remove()

    actions.forEach(({ label, action, danger }) => {
      const btn = document.createElement('button')
      btn.textContent = label
      btn.style.cssText = `display:block;width:100%;text-align:left;padding:6px 12px;font-size:13px;border:none;background:none;cursor:pointer;color:${danger ? '#dc2626' : '#374151'};`
      btn.onmouseenter = () => { btn.style.background = danger ? '#fef2f2' : '#eff6ff' }
      btn.onmouseleave = () => { btn.style.background = 'none' }
      btn.onclick = () => { close(); action() }
      menu.appendChild(btn)
    })

    document.body.appendChild(menu)

    const handleClickOutside = (e2: MouseEvent) => {
      if (!menu.contains(e2.target as Node)) { close(); document.removeEventListener('mousedown', handleClickOutside) }
    }
    setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0)
  }, [sheets, deleteSheet])

  return (
    <div className="flex items-center h-8 border-t border-gray-300 bg-gray-50 select-none shrink-0 overflow-hidden">
      {/* Add sheet button */}
      <button
        className="w-8 h-full flex items-center justify-center text-gray-500 hover:bg-gray-200
          hover:text-gray-700 transition-colors border-r border-gray-300 shrink-0"
        onClick={handleAddSheet}
        title="新建工作表"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="7" y1="1" x2="7" y2="13" />
          <line x1="1" y1="7" x2="13" y2="7" />
        </svg>
      </button>

      {/* Tabs */}
      <div className="flex items-center h-full overflow-x-auto flex-1">
        {sheets.map((sheet) => {
          const isActive = sheet.id === activeSheetId
          const isEditing = editingId === sheet.id

          return (
            <div
              key={sheet.id}
              className={`h-full flex items-center px-3 cursor-pointer border-r border-gray-300
                text-sm whitespace-nowrap transition-colors shrink-0
                ${isActive
                  ? 'bg-white text-blue-700 font-medium border-t-2 border-t-blue-500'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              onClick={() => {
                if (!isEditing) setActiveSheet(sheet.id)
              }}
              onDoubleClick={(e) => handleDoubleClick(e, sheet.id, sheet.name)}
              onContextMenu={(e) => handleRightClick(e, sheet.id)}
            >
              {isEditing ? (
                <input
                  ref={inputRef}
                  className="w-20 h-5 text-sm border border-blue-400 outline-none px-1 rounded-sm
                    bg-white"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={handleRenameCommit}
                  onKeyDown={handleRenameKeyDown}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span>{sheet.name}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
})

SheetTabs.displayName = 'SheetTabs'

export default SheetTabs
