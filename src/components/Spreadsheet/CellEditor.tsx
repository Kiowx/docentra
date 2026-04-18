import React, { useRef, useEffect, useCallback } from 'react'
import { toggleCellReference } from '@/utils/formulaReferences'

interface CellEditorProps {
  position: { top: number; left: number; width: number; height: number }
  value: string
  onChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
  onNavigate?: (direction: 'up' | 'down' | 'left' | 'right') => void
  initialCursorOffset?: number | null
}

const CellEditor: React.FC<CellEditorProps> = React.memo(({
  position,
  value,
  onChange,
  onCommit,
  onCancel,
  onNavigate,
  initialCursorOffset,
}) => {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isComposingRef = useRef(false)
  const mountedRef = useRef(false)

  const autoResize = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.max(position.height, el.scrollHeight) + 'px'
  }, [position.height])

  useEffect(() => {
    const input = inputRef.current
    if (!input || mountedRef.current) return
    mountedRef.current = true

    input.focus()

    if (initialCursorOffset != null && initialCursorOffset > 0) {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.font = '13px sans-serif'
        let charIndex = 0
        let accWidth = 0
        const text = input.value
        for (let i = 0; i < text.length; i++) {
          const charWidth = ctx.measureText(text[i]).width
          if (accWidth + charWidth / 2 >= initialCursorOffset) {
            charIndex = i
            break
          }
          accWidth += charWidth
          charIndex = i + 1
        }
        input.setSelectionRange(charIndex, charIndex)
      } else {
        input.setSelectionRange(input.value.length, input.value.length)
      }
    } else {
      input.setSelectionRange(input.value.length, input.value.length)
    }

    autoResize()
  }, [autoResize, initialCursorOffset])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.style.height = 'auto'
      el.style.height = Math.max(position.height, el.scrollHeight) + 'px'
    })
  }, [onChange, position.height])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || isComposingRef.current || e.key === 'Process') {
      return
    }

    if (e.key === 'Enter' && e.altKey) {
      e.preventDefault()
      const textarea = e.currentTarget
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newValue = value.slice(0, start) + '\n' + value.slice(end)
      onChange(newValue)
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 1
      })
      return
    }

    if (e.key === 'F4') {
      e.preventDefault()
      const input = inputRef.current
      if (!input) return

      const toggled = toggleCellReference(value, input.selectionStart)
      if (toggled !== value) {
        onChange(toggled)
      }
      return
    }

    if (e.key === 'Enter' && !e.altKey) {
      e.preventDefault()
      if (onNavigate) {
        onNavigate(e.shiftKey ? 'up' : 'down')
      } else {
        onCommit()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      if (onNavigate) {
        onNavigate(e.shiftKey ? 'left' : 'right')
      } else {
        onCommit()
      }
    }
  }, [onCommit, onCancel, onNavigate, onChange, value])

  const stopPropagation = useCallback((e: React.MouseEvent | React.KeyboardEvent | React.FocusEvent) => {
    e.stopPropagation()
  }, [])

  return (
    <textarea
      ref={inputRef}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onMouseDown={stopPropagation}
      onMouseUp={stopPropagation}
      onClick={stopPropagation}
      onDoubleClick={stopPropagation}
      onFocus={stopPropagation}
      onCompositionStart={() => {
        isComposingRef.current = true
      }}
      onCompositionEnd={() => {
        isComposingRef.current = false
      }}
      className="absolute z-50 border-2 border-blue-500 outline-none resize-none p-0 m-0
        text-sm leading-tight overflow-y-auto whitespace-pre"
      style={{
        top: position.top,
        left: position.left,
        width: Math.max(position.width, 100),
        height: Math.max(position.height, 25),
        minWidth: position.width,
        minHeight: position.height,
        padding: '1px 3px',
        fontFamily: 'inherit',
        fontSize: '13px',
        lineHeight: '20px',
        backgroundColor: '#fff',
        boxSizing: 'border-box',
      }}
      autoFocus
      spellCheck={false}
    />
  )
})

CellEditor.displayName = 'CellEditor'

export default CellEditor
