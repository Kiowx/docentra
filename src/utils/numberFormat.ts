import type { NumberFormat } from '@/types'

export function applyNumberFormat(value: string, format: NumberFormat): string {
  if (format === 'general' || format === 'text' || value === '') return value

  const num = Number(value)
  if (isNaN(num) || value.trim() === '') return value

  switch (format) {
    case 'number':
      return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    case 'currency':
      return '¥' + num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    case 'percent':
      return (num * 100).toFixed(2) + '%'
    case 'scientific':
      return num.toExponential(2)
    case 'date': {
      const date = new Date(num)
      if (isNaN(date.getTime())) return value
      return date.toLocaleDateString('zh-CN')
    }
    default:
      return value
  }
}

export function getNumberFormatLabel(format?: NumberFormat): string {
  switch (format) {
    case 'number': return '数值'
    case 'currency': return '货币'
    case 'percent': return '百分比'
    case 'scientific': return '科学记数'
    case 'date': return '日期'
    case 'text': return '文本'
    default: return '常规'
  }
}
