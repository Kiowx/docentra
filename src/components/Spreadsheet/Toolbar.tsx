import React, { useCallback, useRef, useState } from 'react'
import { useSpreadsheetStore } from '@/store/useSpreadsheetStore'
import type { CellFormat, NumberFormat } from '@/types'
import { cellKey, getActiveRange as getActiveRangeUtil } from '@/utils/cellUtils'
import { TOTAL_COLS, TOTAL_ROWS } from '@/types'
import { computeAutoFitColumnWidth, computeAutoFitRowHeight } from '@/utils/autoFit'
import SortDialog from './SortDialog'

const Divider = () => <div role="separator" aria-orientation="vertical" className="w-px h-5 bg-gray-200 mx-1.5" />

const Toolbar: React.FC = React.memo(() => {
  const sheets = useSpreadsheetStore((s) => s.sheets)
  const activeSheet = useSpreadsheetStore((s) => s.sheets.find((sh) => sh.id === s.activeSheetId) || s.sheets[0])
  const selection = useSpreadsheetStore((s) => s.selection)
  const activeCellData = useSpreadsheetStore((s) => {
    const sheet = s.sheets.find((sh) => sh.id === s.activeSheetId) || s.sheets[0]
    return sheet?.cells[cellKey(s.selection.activeCell.row, s.selection.activeCell.col)]
  })
  const setCellFormat = useSpreadsheetStore((s) => s.setCellFormat)
  const importWorkbookData = useSpreadsheetStore((s) => s.importWorkbookData)
  const setColWidth = useSpreadsheetStore((s) => s.setColWidth)
  const setRowHeight = useSpreadsheetStore((s) => s.setRowHeight)
  const duplicateSheet = useSpreadsheetStore((s) => s.duplicateSheet)
  const undo = useSpreadsheetStore((s) => s.undo)
  const redo = useSpreadsheetStore((s) => s.redo)
  const canUndo = useSpreadsheetStore((s) => s.historyPast.length > 0)
  const canRedo = useSpreadsheetStore((s) => s.historyFuture.length > 0)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [isExportingWorkbook, setIsExportingWorkbook] = useState(false)
  const [isExportingCsv, setIsExportingCsv] = useState(false)
  const [showSortDialog, setShowSortDialog] = useState(false)

  const activeCell = selection.activeCell
  const format = activeCellData?.format

  const getFormatRange = useCallback(() => getActiveRangeUtil(selection), [selection])

  const applyFormat = useCallback((fmt: Partial<CellFormat>) => {
    const range = getFormatRange()
    setCellFormat(range, fmt)
  }, [getFormatRange, setCellFormat])

  const toggleBold = useCallback(() => applyFormat({ bold: !format?.bold }), [applyFormat, format?.bold])
  const toggleItalic = useCallback(() => applyFormat({ italic: !format?.italic }), [applyFormat, format?.italic])
  const toggleUnderline = useCallback(() => applyFormat({ underline: !format?.underline }), [applyFormat, format?.underline])
  const toggleWrapText = useCallback(() => applyFormat({ wrapText: !format?.wrapText }), [applyFormat, format?.wrapText])

  const handleBgColor = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    applyFormat({ bgColor: e.target.value })
  }, [applyFormat])

  const handleTextColor = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    applyFormat({ textColor: e.target.value })
  }, [applyFormat])

  const handleFontSize = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const size = parseInt(e.target.value, 10)
    if (!isNaN(size) && size >= 8 && size <= 72) applyFormat({ fontSize: size })
  }, [applyFormat])

  const handleNumberFormat = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    applyFormat({ numberFormat: e.target.value as NumberFormat })
  }, [applyFormat])

  const sortRangeAction = useSpreadsheetStore((s) => s.sortRange)
  const handleSort = useCallback((dir: 'asc' | 'desc') => {
    sortRangeAction(getFormatRange(), selection.activeCell.col, dir)
  }, [getFormatRange, selection.activeCell.col, sortRangeAction])

  const handleAutoFitColumns = useCallback(() => {
    if (!activeSheet) return
    const sel = selection
    const cols = (sel.rangeStart && sel.rangeEnd) ? (() => {
      const s = Math.min(sel.rangeStart.col, sel.rangeEnd.col)
      const e = Math.max(sel.rangeStart.col, sel.rangeEnd.col)
      return Array.from({ length: e - s + 1 }, (_, i) => s + i)
    })() : [activeCell.col]
    cols.forEach(c => setColWidth(c, computeAutoFitColumnWidth(activeSheet, c)))
  }, [activeSheet, selection, activeCell.col, setColWidth])

  const handleImportClick = useCallback(() => fileInputRef.current?.click(), [])

  const buildFileName = useCallback((suffix: string) => {
    const today = new Date().toISOString().slice(0, 10)
    return `${activeSheet?.name || '工作簿'}-${today}.${suffix}`
  }, [activeSheet?.name])

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsImporting(true)
    try {
      const { importWorkbookFile } = await import('@/utils/xlsxImport')
      const result = await importWorkbookFile(file)
      importWorkbookData(result.sheets, result.report)
    } catch (error) {
      window.alert(`导入失败：${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      e.target.value = ''
      setIsImporting(false)
    }
  }, [importWorkbookData])

  const handleExportWorkbook = useCallback(async () => {
    if (!sheets.length) return
    setIsExportingWorkbook(true)
    try {
      const { exportWorkbookFile } = await import('@/utils/xlsxExport')
      exportWorkbookFile(sheets, buildFileName('xlsx'))
    } catch (error) {
      window.alert(`导出失败：${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setIsExportingWorkbook(false)
    }
  }, [buildFileName, sheets])

  const handleExportCsv = useCallback(async () => {
    if (!activeSheet) return
    setIsExportingCsv(true)
    try {
      const { exportSheetCsv } = await import('@/utils/xlsxExport')
      exportSheetCsv(activeSheet, buildFileName('csv'))
    } catch (error) {
      window.alert(`导出失败：${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setIsExportingCsv(false)
    }
  }, [activeSheet, buildFileName])

  const currentAlign = format?.align || 'left'

  return (
    <div className="flex items-center h-9 px-2 border-b border-gray-200 bg-white select-none gap-0.5 shrink-0">

      {/* ── Undo / Redo ── */}
      <button
        onClick={undo} disabled={!canUndo}
        className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:cursor-default transition-colors"
        title="撤销 (Ctrl+Z)"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 10h10a5 5 0 0 1 0 10H9" /><polyline points="7 14 3 10 7 6" />
        </svg>
      </button>
      <button
        onClick={redo} disabled={!canRedo}
        className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:cursor-default transition-colors"
        title="重做 (Ctrl+Y)"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 10H11a5 5 0 0 0 0 10h4" /><polyline points="17 14 21 10 17 6" />
        </svg>
      </button>

      <Divider />

      {/* ── Font size ── */}
      <select
        className="h-6 w-14 px-1 rounded border border-gray-200 bg-white text-[11px] text-gray-700 outline-none focus:border-blue-400 cursor-pointer"
        value={format?.fontSize || 13}
        onChange={handleFontSize}
        title="字号"
      >
        {[8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72].map(s => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {/* B / I / U */}
      <button
        onClick={toggleBold}
        className={`w-7 h-7 flex items-center justify-center rounded-md text-[12px] font-bold transition-colors ${format?.bold ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-200' : 'text-gray-600 hover:bg-gray-100'}`}
        title="加粗 (Ctrl+B)"
      >B</button>
      <button
        onClick={toggleItalic}
        className={`w-7 h-7 flex items-center justify-center rounded-md text-[12px] italic transition-colors ${format?.italic ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-200' : 'text-gray-600 hover:bg-gray-100'}`}
        title="斜体 (Ctrl+I)"
      >I</button>
      <button
        onClick={toggleUnderline}
        className={`w-7 h-7 flex items-center justify-center rounded-md text-[12px] underline transition-colors ${format?.underline ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-200' : 'text-gray-600 hover:bg-gray-100'}`}
        title="下划线 (Ctrl+U)"
      >U</button>
      <button
        onClick={toggleWrapText}
        className={`h-7 px-1.5 flex items-center justify-center rounded-md text-[10px] font-medium transition-colors ${format?.wrapText ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-200' : 'text-gray-600 hover:bg-gray-100'}`}
        title="自动换行"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18M3 12h15a3 3 0 1 1 0 6h-4" /><polyline points="14 16 10 18 14 20" />
        </svg>
      </button>

      <Divider />

      {/* ── Alignment ── */}
      <button
        onClick={() => applyFormat({ align: 'left' })}
        className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${currentAlign === 'left' ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-200' : 'text-gray-500 hover:bg-gray-100'}`}
        title="左对齐"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h10M3 18h14" /></svg>
      </button>
      <button
        onClick={() => applyFormat({ align: 'center' })}
        className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${currentAlign === 'center' ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-200' : 'text-gray-500 hover:bg-gray-100'}`}
        title="居中对齐"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M6 12h12M5 18h14" /></svg>
      </button>
      <button
        onClick={() => applyFormat({ align: 'right' })}
        className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${currentAlign === 'right' ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-200' : 'text-gray-500 hover:bg-gray-100'}`}
        title="右对齐"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M11 12h10M7 18h14" /></svg>
      </button>

      <Divider />

      {/* ── Colors ── */}
      <div className="relative">
        <button
          className="w-7 h-7 flex flex-col items-center justify-center rounded-md hover:bg-gray-100 transition-colors"
          title="填充颜色"
          onClick={() => (document.getElementById('bg-color-picker') as HTMLInputElement)?.click()}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
          </svg>
          <div className="w-3.5 h-1 rounded-[1px] mt-[1px]" style={{ backgroundColor: format?.bgColor || '#ffffff', border: '1px solid #d1d5db' }} />
        </button>
        <input id="bg-color-picker" type="color" className="absolute w-0 h-0 opacity-0 pointer-events-none" value={format?.bgColor || '#ffffff'} onChange={handleBgColor} />
      </div>
      <div className="relative">
        <button
          className="w-7 h-7 flex flex-col items-center justify-center rounded-md hover:bg-gray-100 transition-colors"
          title="文字颜色"
          onClick={() => (document.getElementById('text-color-picker') as HTMLInputElement)?.click()}
        >
          <span className="text-[12px] font-semibold leading-none" style={{ color: format?.textColor || '#111' }}>A</span>
          <div className="w-3.5 h-1 rounded-[1px] mt-[1px]" style={{ backgroundColor: format?.textColor || '#111111', border: '1px solid #d1d5db' }} />
        </button>
        <input id="text-color-picker" type="color" className="absolute w-0 h-0 opacity-0 pointer-events-none" value={format?.textColor || '#111111'} onChange={handleTextColor} />
      </div>

      <Divider />

      {/* ── Number format ── */}
      <select
        className="h-6 w-16 px-1 rounded border border-gray-200 bg-white text-[11px] text-gray-700 outline-none focus:border-blue-400 cursor-pointer"
        value={format?.numberFormat || 'general'}
        onChange={handleNumberFormat}
        title="数字格式"
      >
        <option value="general">常规</option>
        <option value="number">数值</option>
        <option value="currency">货币</option>
        <option value="percent">百分比</option>
        <option value="scientific">科学</option>
        <option value="date">日期</option>
        <option value="text">文本</option>
      </select>

      <Divider />

      {/* ── Sort ── */}
      <button
        onClick={() => handleSort('asc')}
        className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        title="升序排序"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h12M3 12h8M3 18h4" /><path d="M18 4v16" /><polyline points="15 7 18 4 21 7" />
        </svg>
      </button>
      <button
        onClick={() => handleSort('desc')}
        className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        title="降序排序"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h12M3 12h8M3 18h4" /><path d="M18 20V4" /><polyline points="15 17 18 20 21 17" />
        </svg>
      </button>
      <button
        onClick={() => setShowSortDialog(true)}
        className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        title="多级排序"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h12M3 12h8M3 18h4" /><path d="M17 4v16" /><polyline points="14 7 17 4 20 7" /><polyline points="14 17 17 20 20 17" />
        </svg>
      </button>

      <Divider />

      {/* ── Auto-fit ── */}
      <button
        onClick={handleAutoFitColumns}
        className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        title="自适应列宽"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 3H3v18h18V3z" /><path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
        </svg>
      </button>

      {/* ── File ops (right) ── */}
      <div className="ml-auto flex items-center gap-1">
        <input ref={fileInputRef} type="file" accept=".xlsx,.xlsm,.xlsb,.xls" className="hidden" onChange={handleFileChange} />

        <button
          onClick={() => duplicateSheet(activeSheet?.id)}
          className="h-6 px-2 rounded-md text-[11px] text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          title="复制当前工作表"
        >复制工作表</button>

        <button
          onClick={handleExportWorkbook} disabled={isExportingWorkbook}
          className="h-6 px-2 rounded-md text-[11px] text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40 transition-colors"
          title="导出 Excel"
        >{isExportingWorkbook ? '...' : '导出'}</button>

        <button
          onClick={handleExportCsv} disabled={isExportingCsv}
          className="h-6 px-2 rounded-md text-[11px] text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40 transition-colors"
          title="导出 CSV"
        >{isExportingCsv ? '...' : 'CSV'}</button>

        <button
          onClick={handleImportClick} disabled={isImporting}
          className="h-6 px-2.5 rounded-md text-[11px] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 transition-colors"
          title="导入 Excel"
        >{isImporting ? '导入中...' : '导入'}</button>
      </div>

      {showSortDialog && <SortDialog onClose={() => setShowSortDialog(false)} />}
    </div>
  )
})

Toolbar.displayName = 'Toolbar'

export default Toolbar
