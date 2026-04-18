import React, { useCallback, useRef } from 'react'
import { useSpreadsheetStore } from '@/store/useSpreadsheetStore'
import Toolbar from '@/components/Spreadsheet/Toolbar'
import FormulaBar from '@/components/Spreadsheet/FormulaBar'
import ImportStatusBar from '@/components/Spreadsheet/ImportStatusBar'
import Spreadsheet from '@/components/Spreadsheet/Spreadsheet'
import SheetTabs from '@/components/Spreadsheet/SheetTabs'
import SelectionStatusBar from '@/components/Spreadsheet/SelectionStatusBar'
import ChatPanel from '@/components/Chat/ChatPanel'
import { TitleBar } from './TitleBar'

export const MainLayout: React.FC = () => {
  const chatPanelWidth = useSpreadsheetStore(s => s.chatPanelWidth)
  const setChatPanelWidth = useSpreadsheetStore(s => s.setChatPanelWidth)
  const dividerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    e.preventDefault()
    const startX = e.clientX
    const startWidth = chatPanelWidth

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const delta = startX - e.clientX
      const newWidth = startWidth + delta
      const clamped = Math.max(250, Math.min(newWidth, window.innerWidth - 400))
      setChatPanelWidth(clamped)
    }

    const handleMouseUp = () => {
      isDragging.current = false
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [chatPanelWidth, setChatPanelWidth])

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white">
      <TitleBar />
      <Toolbar />
      <FormulaBar />
      <ImportStatusBar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <Spreadsheet />
        </div>
        <div
          ref={dividerRef}
          className="w-1 bg-gray-200 hover:bg-blue-400 cursor-col-resize transition-colors shrink-0"
          onMouseDown={handleMouseDown}
        />
        <div style={{ width: chatPanelWidth }} className="min-h-0 shrink-0 overflow-hidden">
          <ChatPanel />
        </div>
      </div>
      <SheetTabs />
      <SelectionStatusBar />
    </div>
  )
}
