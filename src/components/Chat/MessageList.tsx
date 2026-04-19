import React, { useRef, useEffect, useCallback } from 'react'
import { useSpreadsheetStore } from '@/store/useSpreadsheetStore'
import { sendMessage } from '@/ai/aiService'
import MessageBubble from './MessageBubble'

const EXAMPLE_PROMPTS = [
  '在 A1:A5 填入月份',
  '创建一个销售数据表',
  '计算 B 列的总和',
  '把标题行设置为加粗',
]

interface WelcomeScreenProps {
  onPromptClick: (prompt: string) => void
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = React.memo(({ onPromptClick }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-10 text-center">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-5 shadow-lg">
        <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
          />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-gray-800 mb-1">AI 助手</h3>
      <p className="text-xs text-gray-500 mb-6 max-w-[220px] leading-relaxed">
        输入指令来操作电子表格，例如填充数据、计算公式、格式化单元格或批量整理工作表。
      </p>
      <div className="w-full space-y-2">
        {EXAMPLE_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => onPromptClick(prompt)}
            className="w-full text-left px-4 py-2.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors shadow-sm"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  )
})

WelcomeScreen.displayName = 'WelcomeScreen'

const MessageList: React.FC = React.memo(() => {
  const chatMessages = useSpreadsheetStore((s) => s.chatMessages)
  const streamingMessageId = useSpreadsheetStore((s) => s.streamingMessageId)
  const streamingContentLength = useSpreadsheetStore((s) => s.streamingContent.length)
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isAutoScrollRef = useRef(true)

  // Detect if user has scrolled up (disable auto-scroll)
  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isAutoScrollRef.current = distanceFromBottom < 80
  }, [])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (isAutoScrollRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatMessages, streamingMessageId, streamingContentLength])

  const handlePromptClick = useCallback((prompt: string) => {
    sendMessage(prompt)
  }, [])

  if (chatMessages.length === 0) {
    return <WelcomeScreen onPromptClick={handlePromptClick} />
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-3 py-4"
    >
      {chatMessages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
})

MessageList.displayName = 'MessageList'

export default MessageList
