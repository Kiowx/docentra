import React from 'react'
import { useSpreadsheetStore } from '@/store/useSpreadsheetStore'

const ImportStatusBar: React.FC = React.memo(() => {
  const importReport = useSpreadsheetStore((s) => s.importReport)
  const clearImportReport = useSpreadsheetStore((s) => s.clearImportReport)

  if (!importReport) {
    return null
  }

  const isSuccess = importReport.status === 'success'
  const toneClasses = isSuccess
    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
    : 'border-amber-200 bg-amber-50 text-amber-900'

  return (
    <div className={`shrink-0 border-b px-3 py-2 text-xs ${toneClasses}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">
              {isSuccess ? '导入校验通过' : '导入完成，但存在警告'}
            </span>
            <span className="truncate text-gray-700">{importReport.fileName}</span>
          </div>
          <div className="mt-1 text-gray-700">
            已导入 {importReport.importedSheetCount} 个工作表、{importReport.importedCellCount} 个单元格，已校验 {importReport.checkedCellCount} 个单元格，发现 {importReport.mismatchCount} 处差异，截断 {importReport.truncatedCellCount} 个超出范围的单元格。
          </div>
          {importReport.issues.slice(0, 3).map((issue, index) => (
            <div key={`${issue.sheetName}-${issue.cellRef || index}`} className="mt-1 text-gray-700">
              {issue.sheetName}
              {issue.cellRef ? ` ${issue.cellRef}` : ''}：期望 {issue.expected}，实际 {issue.actual}。
            </div>
          ))}
        </div>
        <button
          className="shrink-0 rounded border border-current/20 px-2 py-1 text-[11px] font-medium hover:bg-white/60"
          onClick={clearImportReport}
          title="关闭导入校验结果"
        >
          关闭
        </button>
      </div>
    </div>
  )
})

ImportStatusBar.displayName = 'ImportStatusBar'

export default ImportStatusBar
