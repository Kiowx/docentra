import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useSpreadsheetStore } from '@/store/useSpreadsheetStore'
import { sendMessage } from '@/ai/aiService'

const ChatInput: React.FC = React.memo(() => {
  const chatLoading = useSpreadsheetStore((s) => s.chatLoading)
  const clearChat = useSpreadsheetStore((s) => s.clearChat)
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isComposingRef = useRef(false)
  const canSend = input.trim().length > 0 && !chatLoading

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [])

  useEffect(() => { adjustHeight() }, [input, adjustHeight])

  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || chatLoading) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    await sendMessage(trimmed)
  }, [input, chatLoading])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.nativeEvent.isComposing || isComposingRef.current || e.key === 'Process') return
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  return (
    <div className="border-t border-gray-200 bg-white px-3 py-2.5">
      <div className="flex items-end gap-2">
        <div
          className={`flex flex-1 items-end gap-2 rounded-xl border px-3 py-2 transition-colors ${
            chatLoading
              ? 'border-gray-200 bg-gray-100'
              : 'border-gray-200 bg-gray-50 focus-within:border-blue-400 focus-within:bg-white'
          }`}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => { isComposingRef.current = true }}
            onCompositionEnd={() => { isComposingRef.current = false }}
            placeholder={chatLoading ? 'AI 正在思考...' : '输入指令操作表格...'}
            disabled={chatLoading}
            rows={1}
            className="chat-scroll block min-h-[24px] max-h-[120px] min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-0.5 py-0.5 text-[13px] leading-relaxed text-gray-800
              placeholder-gray-400 outline-none disabled:cursor-not-allowed"
            style={{ maxHeight: '120px', scrollbarGutter: 'stable' }}
          />
          <button
            onClick={handleSend}
            disabled={!canSend}
            className={`mb-0.5 h-7 w-7 shrink-0 flex items-center justify-center rounded-lg transition-all duration-150 ${
              canSend
                ? 'bg-blue-600 text-white hover:bg-blue-700 active:scale-90'
                : 'bg-gray-200 text-gray-400'
            }`}
            title="发送"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95l14.095-5.5a.75.75 0 000-1.38l-14.095-5.5z" />
            </svg>
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between mt-1 px-0.5">
        <span className="text-[10px] text-gray-400">Shift+Enter 换行</span>
        <button
          onClick={() => clearChat()}
          className="text-[10px] text-gray-400 hover:text-red-400 transition-colors"
        >清空记录</button>
      </div>
    </div>
  )
})

ChatInput.displayName = 'ChatInput'

export default ChatInput
