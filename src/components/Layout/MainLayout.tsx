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
  const isDragging = useRef(false)
  const [chatVisible, setChatVisible] = React.useState(true)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    e.preventDefault()
    const startX = e.clientX
    const startWidth = chatPanelWidth

    const handlePointerMove = (clientX: number) => {
      if (!isDragging.current) return
      const delta = startX - clientX
      const newWidth = startWidth + delta
      const clamped = Math.max(250, Math.min(newWidth, window.innerWidth - 400))
      setChatPanelWidth(clamped)
    }

    const handleMouseMove = (e: MouseEvent) => handlePointerMove(e.clientX)
    const handleTouchMove = (e: TouchEvent) => handlePointerMove(e.touches[0].clientX)

    const handleEnd = () => {
      isDragging.current = false
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleEnd)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleEnd)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleEnd)
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', handleEnd)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [chatPanelWidth, setChatPanelWidth])

  const handleDividerKeyDown = useCallback((e: React.KeyboardEvent) => {
    const step = 20
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setChatPanelWidth(Math.max(250, chatPanelWidth + step))
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      setChatPanelWidth(Math.max(250, chatPanelWidth - step))
    }
  }, [chatPanelWidth, setChatPanelWidth])

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white dark:bg-gray-900">
      <TitleBar />
      <Toolbar />
      <FormulaBar />
      <ImportStatusBar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <Spreadsheet />
        </div>
        {chatVisible && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="调整面板宽度"
              aria-valuenow={chatPanelWidth}
              tabIndex={0}
              className="w-1 bg-gray-200 hover:bg-blue-400 cursor-col-resize transition-colors shrink-0 focus:bg-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
              onMouseDown={handleMouseDown}
              onTouchStart={handleMouseDown as unknown as React.TouchEventHandler}
              onKeyDown={handleDividerKeyDown}
            />
            <div style={{ width: chatPanelWidth }} className="min-h-0 shrink-0 overflow-hidden">
              <ChatPanel />
            </div>
          </>
        )}
        {!chatVisible && (
          <button
            onClick={() => setChatVisible(true)}
            className="shrink-0 w-8 bg-gray-100 hover:bg-blue-50 border-l border-gray-200 flex items-center justify-center text-gray-400 hover:text-blue-600 transition-colors"
            title="打开 AI 助手"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 8.25V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0120.25 6v12a2.25 2.25 0 01-2.25 2.25h-7.5A2.25 2.25 0 018.25 18v-2.25" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 12L4.5 12m0 0l3-3m-3 3l3 3" />
            </svg>
          </button>
        )}
      </div>
      <SheetTabs />
      <SelectionStatusBar />
      {!chatVisible && (
        <button
          onClick={() => setChatVisible(true)}
          className="fixed right-3 bottom-3 z-50 w-10 h-10 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-blue-700 transition-colors"
          title="打开 AI 助手"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </button>
      )}
    </div>
  )
}
