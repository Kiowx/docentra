import React, { useState, useEffect, useCallback } from 'react'

declare global {
  interface Window {
    electronAPI?: {
      minimize: () => void
      maximize: () => void
      close: () => void
      isMaximized: () => Promise<boolean>
    }
  }
}

export const TitleBar: React.FC = React.memo(() => {
  const [maximized, setMaximized] = useState(false)

  const checkMaximized = useCallback(async () => {
    const m = await window.electronAPI?.isMaximized()
    setMaximized(!!m)
  }, [])

  useEffect(() => {
    checkMaximized()
    // Poll maximize state periodically to catch OS-level changes
    const interval = setInterval(checkMaximized, 2000)
    return () => clearInterval(interval)
  }, [checkMaximized])

  const handleMaximize = useCallback(() => {
    window.electronAPI?.maximize()
    setTimeout(checkMaximized, 200)
  }, [checkMaximized])

  return (
    <div className="title-bar h-9 bg-white border-b border-gray-200 flex items-center justify-between px-3 select-none shrink-0">
      <div className="flex items-center gap-2">
        <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 3h7v7H3V3zm11 0h7v7h-7V3zm0 11h7v7h-7v-7zM3 14h7v7H3v-7z" />
        </svg>
        <span className="text-sm font-semibold text-gray-700">文枢 Docentra</span>
      </div>
      <div className="flex items-center">
        <button
          onClick={() => window.electronAPI?.minimize()}
          className="w-11 h-9 flex items-center justify-center hover:bg-gray-100 text-gray-500 transition-colors"
          aria-label="最小化"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16"><rect y="7" width="16" height="1.5" fill="currentColor" /></svg>
        </button>
        <button
          onClick={handleMaximize}
          className="w-11 h-9 flex items-center justify-center hover:bg-gray-100 text-gray-500 transition-colors"
          aria-label={maximized ? '还原' : '最大化'}
        >
          {maximized ? (
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="3" y="5" width="8" height="8" />
              <polyline points="5,5 5,3 13,3 13,11 11,11" />
            </svg>
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="2" y="2" width="12" height="12" />
            </svg>
          )}
        </button>
        <button
          onClick={() => window.electronAPI?.close()}
          className="w-11 h-9 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors text-gray-500"
          aria-label="关闭"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5">
            <line x1="3" y1="3" x2="13" y2="13" />
            <line x1="13" y1="3" x2="3" y2="13" />
          </svg>
        </button>
      </div>
    </div>
  )
})

TitleBar.displayName = 'TitleBar'
