import React, { useState, useCallback, useEffect, useMemo } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { sendMessage } from '@/ai/aiService'
import { useSpreadsheetStore } from '@/store/useSpreadsheetStore'
import type { ChatMessage, ToolCallResult } from '@/types'

interface MessageBubbleProps {
  message: ChatMessage
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

function summarizeInput(input: Record<string, unknown>): string {
  const entries = Object.entries(input)
  if (entries.length === 0) return '{}'
  const parts = entries.slice(0, 3).map(([k, v]) => {
    const val = typeof v === 'string' ? v : JSON.stringify(v)
    const truncated = val.length > 40 ? val.slice(0, 40) + '...' : val
    return `${k}: ${truncated}`
  })
  const suffix = entries.length > 3 ? ` (+${entries.length - 3} more)` : ''
  return `{ ${parts.join(', ')}${suffix} }`
}

interface ToolCallSectionProps {
  toolCall: ToolCallResult
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

const ToolCallSection: React.FC<ToolCallSectionProps> = React.memo(({ toolCall }) => {
  const [expanded, setExpanded] = useState(false)
  const [copiedTarget, setCopiedTarget] = useState<'input' | 'result' | null>(null)
  const toggle = useCallback(() => setExpanded((prev) => !prev), [])
  const inputText = JSON.stringify(toolCall.input, null, 2)

  useEffect(() => {
    if (!copiedTarget) return
    const timer = window.setTimeout(() => setCopiedTarget(null), 1500)
    return () => window.clearTimeout(timer)
  }, [copiedTarget])

  const handleCopyInput = useCallback(async () => {
    const ok = await copyText(inputText)
    if (ok) {
      setCopiedTarget('input')
    }
  }, [inputText])

  const handleCopyResult = useCallback(async () => {
    const ok = await copyText(toolCall.result)
    if (ok) {
      setCopiedTarget('result')
    }
  }, [toolCall.result])

  return (
    <div className="mt-2 rounded-lg border border-gray-200 overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
            clipRule="evenodd"
          />
        </svg>
        <span className="font-mono font-semibold text-indigo-600 truncate">
          {toolCall.toolName}
        </span>
        <span className="font-mono text-gray-500 truncate">
          {summarizeInput(toolCall.input as Record<string, unknown>)}
        </span>
      </button>
      {expanded && (
        <div className="px-3 py-2 bg-white border-t border-gray-100 space-y-2">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Input
              </div>
              <button
                onClick={handleCopyInput}
                className="text-[10px] font-medium text-blue-600 hover:text-blue-700 transition-colors"
              >
                {copiedTarget === 'input' ? '已复制' : '复制输入'}
              </button>
            </div>
            <pre className="text-xs font-mono text-gray-700 bg-gray-50 rounded p-2 whitespace-pre-wrap break-all overflow-x-auto max-h-40 overflow-y-auto">
              {inputText}
            </pre>
          </div>
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Result
              </div>
              <button
                onClick={handleCopyResult}
                className="text-[10px] font-medium text-blue-600 hover:text-blue-700 transition-colors"
              >
                {copiedTarget === 'result' ? '已复制' : '复制结果'}
              </button>
            </div>
            <pre className="text-xs font-mono text-green-700 bg-green-50 rounded p-2 whitespace-pre-wrap break-all overflow-x-auto max-h-40 overflow-y-auto">
              {toolCall.result}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
})

ToolCallSection.displayName = 'ToolCallSection'

const MessageBubble: React.FC<MessageBubbleProps> = React.memo(({ message }) => {
  const updateMessage = useSpreadsheetStore((s) => s.updateMessage)
  const deleteChatMessage = useSpreadsheetStore((s) => s.deleteChatMessage)
  const chatLoading = useSpreadsheetStore((s) => s.chatLoading)
  const streamingMessageId = useSpreadsheetStore((s) => s.streamingMessageId)
  const streamingContent = useSpreadsheetStore((s) => s.streamingContent)
  const isUser = message.role === 'user'
  const isCurrentlyStreaming = streamingMessageId === message.id
  const displayContent = isCurrentlyStreaming ? streamingContent : message.content
  const isEditable = isUser && !message.isStreaming && !isCurrentlyStreaming
  const isDeletable = !message.isStreaming && !isCurrentlyStreaming
  const actionLocked = chatLoading || message.isStreaming || isCurrentlyStreaming
  const actionTextClass = isUser ? 'hover:text-white' : 'hover:text-gray-700'
  const actionPillClass = isUser
    ? 'bg-white/10 text-blue-100 ring-1 ring-white/15'
    : 'bg-white/85 text-gray-500 ring-1 ring-gray-200'
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)

  useEffect(() => {
    setDraft(message.content)
    if (message.isStreaming) {
      setIsEditing(false)
    }
  }, [message.content, message.isStreaming])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timer)
  }, [copied])

  const handleCopy = useCallback(async () => {
    const ok = await copyText(message.content)
    if (ok) {
      setCopied(true)
    }
  }, [message.content])

  const handleEditStart = useCallback(() => {
    setDraft(message.content)
    setIsEditing(true)
  }, [message.content])

  const handleEditCancel = useCallback(() => {
    setDraft(message.content)
    setIsEditing(false)
  }, [message.content])

  const handleEditSave = useCallback(() => {
    const trimmed = draft.trim()
    if (!trimmed || actionLocked) return
    updateMessage(message.id, (current) => ({
      ...current,
      content: trimmed,
    }))
    setIsEditing(false)
  }, [actionLocked, draft, message.id, updateMessage])

  const handleResend = useCallback(async () => {
    if (!message.content.trim() || actionLocked) return
    await sendMessage(message.content)
  }, [actionLocked, message.content])

  const handleDelete = useCallback(() => {
    if (actionLocked) return
    deleteChatMessage(message.id)
  }, [actionLocked, deleteChatMessage, message.id])

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleEditSave()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      handleEditCancel()
    }
  }, [handleEditCancel, handleEditSave])

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`group min-w-0 w-fit max-w-[78%] rounded-2xl px-4 py-2.5 ${
          isUser
            ? 'bg-blue-600 text-white rounded-br-md'
            : 'bg-gray-100 text-gray-800 rounded-bl-md'
        }`}
      >
        {/* Message content */}
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleEditKeyDown}
              rows={Math.min(Math.max(draft.split('\n').length, 3), 8)}
              className="w-full resize-y rounded-xl border border-white/30 bg-white/95 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
            <div className="flex items-center justify-end gap-2 text-xs">
              <button
                onClick={handleEditCancel}
                disabled={actionLocked}
                className="rounded-lg px-3 py-1.5 bg-white/15 hover:bg-white/25 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleEditSave}
                disabled={!draft.trim() || actionLocked}
                className="rounded-lg px-3 py-1.5 bg-white text-blue-700 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                保存
              </button>
            </div>
            <div className={`text-[10px] ${isUser ? 'text-blue-100/80' : 'text-gray-400'}`}>
              `Ctrl/Cmd + Enter` 保存，`Esc` 取消
            </div>
          </div>
        ) : (
          <div className="text-sm leading-relaxed break-words">
            {isUser ? (
              <div className="whitespace-pre-wrap">{displayContent}</div>
            ) : (
              <Markdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSanitize]}
                components={{
                  code: ({ className, children, ...props }) => {
                    const isBlock = className?.includes('language-')
                    return isBlock ? (
                      <pre className="bg-gray-800 text-gray-100 rounded-lg p-3 my-2 text-xs overflow-x-auto">
                        <code className={className} {...props}>{children}</code>
                      </pre>
                    ) : (
                      <code className="bg-gray-200 text-gray-700 rounded px-1 py-0.5 text-xs" {...props}>{children}</code>
                    )
                  },
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-2">
                      <table className="min-w-full border border-gray-300 text-xs">{children}</table>
                    </div>
                  ),
                  th: ({ children }) => (
                    <th className="border border-gray-300 bg-gray-200 px-2 py-1 text-left font-semibold">{children}</th>
                  ),
                  td: ({ children }) => (
                    <td className="border border-gray-300 px-2 py-1">{children}</td>
                  ),
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{children}</a>
                  ),
                  ul: ({ children }) => <ul className="list-disc pl-4 my-1 space-y-0.5">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-4 my-1 space-y-0.5">{children}</ol>,
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-3 border-gray-400 pl-3 my-2 text-gray-600 italic">{children}</blockquote>
                  ),
                  p: ({ children }) => <p className="my-1">{children}</p>,
                }}
              >
                {displayContent}
              </Markdown>
            )}
            {(message.isStreaming || isCurrentlyStreaming) && (
              <span className="inline-block w-0.5 h-4 ml-0.5 bg-current animate-pulse align-text-bottom" />
            )}
          </div>
        )}

        {/* Tool calls */}
        {!isEditing && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-1 space-y-1">
            {message.toolCalls.map((tc, i) => (
              <ToolCallSection key={`${tc.toolName}-${i}`} toolCall={tc} />
            ))}
          </div>
        )}

        {/* Timestamp */}
        <div
          className={`text-[10px] mt-1 ${
            isUser ? 'text-blue-200' : 'text-gray-400'
          } text-right`}
        >
          {formatTimestamp(message.timestamp)}
        </div>

        <div
          className={`flex items-center justify-end text-[11px] transition-all duration-150 ${
            isEditing
              ? 'max-h-0 opacity-0 overflow-hidden pointer-events-none'
              : 'max-h-0 opacity-0 overflow-hidden pointer-events-none group-hover:mt-2 group-hover:max-h-10 group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:mt-2 group-focus-within:max-h-10 group-focus-within:opacity-100 group-focus-within:pointer-events-auto'
          }`}
        >
          <div className={`flex items-center gap-2 rounded-full px-2.5 py-1 shadow-sm backdrop-blur-sm ${actionPillClass} ${message.isStreaming ? 'opacity-50' : ''}`}>
            <button
              onClick={handleCopy}
              className={`${actionTextClass} transition-colors`}
              title="复制消息"
            >
              {copied ? '已复制' : '复制'}
            </button>
            {isEditable && !isEditing && (
              <button
                onClick={handleEditStart}
                disabled={actionLocked}
                className={`${actionTextClass} transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                title="编辑消息"
              >
                编辑
              </button>
            )}
            {isEditable && !isEditing && (
              <button
                onClick={handleResend}
                disabled={actionLocked}
                className={`${actionTextClass} transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                title="重新发送"
              >
                重发
              </button>
            )}
            {isDeletable && (
              <button
                onClick={handleDelete}
                disabled={actionLocked}
                className={`${isUser ? 'hover:text-white' : 'hover:text-red-500'} transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                title="删除消息"
              >
                删除
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})

MessageBubble.displayName = 'MessageBubble'

export default MessageBubble
