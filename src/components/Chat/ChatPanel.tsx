import React, { useState, useCallback } from 'react'
import { useSpreadsheetStore } from '@/store/useSpreadsheetStore'
import type { AIConfig, ChatSession, ToolMode } from '@/types'
import { detectBestToolMode } from '@/ai/toolModeProbe'
import MessageList from './MessageList'
import ChatInput from './ChatInput'

const PROVIDERS: { value: AIConfig['provider']; label: string; defaultModel: string }[] = [
  { value: 'openai', label: 'OpenAI', defaultModel: 'gpt-4o' },
  { value: 'claude', label: 'Claude', defaultModel: 'claude-sonnet-4-20250514' },
  { value: 'ollama', label: 'Ollama', defaultModel: 'llama3' },
]

interface SettingsPanelProps {
  onClose: () => void
}

const SettingsPanel: React.FC<SettingsPanelProps> = React.memo(({ onClose }) => {
  const aiConfig = useSpreadsheetStore((s) => s.aiConfig)
  const setAIConfig = useSpreadsheetStore((s) => s.setAIConfig)

  const [provider, setProvider] = useState<AIConfig['provider']>(aiConfig.provider)
  const [apiKey, setApiKey] = useState(aiConfig.apiKey)
  const [baseUrl, setBaseUrl] = useState(aiConfig.baseUrl || '')
  const [model, setModel] = useState(aiConfig.model)
  const [toolMode, setToolMode] = useState<ToolMode>(aiConfig.toolMode)
  const [probeStatus, setProbeStatus] = useState<{ kind: 'idle' | 'testing' | 'success' | 'error'; message: string }>({
    kind: 'idle',
    message: '',
  })

  const handleProviderChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newProvider = e.target.value as AIConfig['provider']
      setProvider(newProvider)
      const entry = PROVIDERS.find((p) => p.value === newProvider)
      if (entry) {
        setModel(entry.defaultModel)
      }
    },
    []
  )

  const handleSave = useCallback(() => {
    setAIConfig({
      provider,
      apiKey,
      model,
      baseUrl: baseUrl.trim() || undefined,
      toolMode,
    })
    onClose()
  }, [provider, apiKey, model, baseUrl, toolMode, setAIConfig, onClose])

  const handleProbe = useCallback(async () => {
    if (!model.trim()) {
      setProbeStatus({ kind: 'error', message: '请先填写模型名称，再测试工具支持情况。' })
      return
    }

    if (provider !== 'ollama' && !apiKey.trim()) {
      setProbeStatus({ kind: 'error', message: '请先填写 API Key，再测试工具支持情况。' })
      return
    }

    setProbeStatus({ kind: 'testing', message: '正在测试当前 API 支持的工具模式…' })

    try {
      const result = await detectBestToolMode({
        provider,
        apiKey,
        model: model.trim(),
        baseUrl: baseUrl.trim() || undefined,
      })
      setToolMode(result.mode)
      setProbeStatus({
        kind: 'success',
        message: `${result.summary}\n${result.details}`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setProbeStatus({
        kind: 'error',
        message: `测试失败：${message}`,
      })
    }
  }, [provider, apiKey, model, baseUrl])

  return (
    <div className="absolute inset-0 z-10 bg-white flex flex-col">
      {/* Settings header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-800">设置</h3>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Settings body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Provider */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            AI 服务提供方
          </label>
          <select
            value={provider}
            onChange={handleProviderChange}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* API Key */}
        {provider !== 'ollama' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
            />
          </div>
        )}

        {/* Base URL */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            Base URL{' '}
            <span className="text-gray-400 font-normal">（可选）</span>
          </label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={
              provider === 'ollama'
                ? 'http://localhost:11434/v1'
                : provider === 'claude'
                  ? 'https://api.anthropic.com/v1'
                  : 'https://api.openai.com/v1'
            }
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
          />
        </div>

        {/* Model */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            模型
          </label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="输入模型名称"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
          />
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-3 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              工具模式
            </label>
            <select
              value={toolMode}
              onChange={(e) => setToolMode(e.target.value as ToolMode)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
            >
              <option value="auto">自动回退</option>
              <option value="native">原生工具调用</option>
              <option value="json">JSON 工具协议</option>
              <option value="inject">提示词注入工具</option>
              <option value="none">关闭工具，纯对话</option>
            </select>
            <div className="mt-1 text-xs leading-5 text-gray-500">
              自动回退会优先尝试原生工具调用，失败后退到 JSON 工具协议，再退到注入工具；适用于 OpenAI-compatible、Anthropic-compatible 和 Ollama 接口。
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleProbe}
              disabled={probeStatus.kind === 'testing'}
              className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
            >
              {probeStatus.kind === 'testing' ? '测试中…' : '测试支持情况'}
            </button>
            <div className="text-xs text-gray-500">
              测试后会自动切换到当前 API 最合适的模式。
            </div>
          </div>

          {probeStatus.kind !== 'idle' && (
            <div
              className={`rounded-lg px-3 py-2 text-xs leading-5 whitespace-pre-line ${
                probeStatus.kind === 'error'
                  ? 'bg-red-50 text-red-700 border border-red-100'
                  : probeStatus.kind === 'success'
                    ? 'bg-green-50 text-green-700 border border-green-100'
                    : 'bg-blue-50 text-blue-700 border border-blue-100'
              }`}
            >
              {probeStatus.message}
            </div>
          )}
        </div>
      </div>

      {/* Save button */}
      <div className="px-4 py-3 border-t border-gray-200">
        <button
          onClick={handleSave}
          className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm"
        >
          保存
        </button>
      </div>
    </div>
  )
})

SettingsPanel.displayName = 'SettingsPanel'

function formatSessionTime(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

function getSessionPreview(session: ChatSession): string {
  const previewSource = session.messages.find((message) => message.role === 'user')?.content
    ?? session.messages[session.messages.length - 1]?.content
    ?? ''
  const normalized = previewSource.replace(/\s+/g, ' ').trim()
  return normalized || '这条对话还没有消息'
}

interface HistoryPanelProps {
  chatSessions: ChatSession[]
  activeChatSessionId: string
  chatLoading: boolean
  onClose: () => void
}

const HistoryPanel: React.FC<HistoryPanelProps> = React.memo(({
  chatSessions,
  activeChatSessionId,
  chatLoading,
  onClose,
}) => {
  const createChatSession = useSpreadsheetStore((s) => s.createChatSession)
  const setActiveChatSession = useSpreadsheetStore((s) => s.setActiveChatSession)
  const deleteChatSession = useSpreadsheetStore((s) => s.deleteChatSession)

  const handleCreate = useCallback(() => {
    if (chatLoading) return
    createChatSession()
    onClose()
  }, [chatLoading, createChatSession, onClose])

  const handleSelect = useCallback((sessionId: string) => {
    if (chatLoading) return
    setActiveChatSession(sessionId)
    onClose()
  }, [chatLoading, onClose, setActiveChatSession])

  const handleDelete = useCallback((event: React.MouseEvent<HTMLButtonElement>, sessionId: string) => {
    event.stopPropagation()
    if (chatLoading) return
    deleteChatSession(sessionId)
  }, [chatLoading, deleteChatSession])

  return (
    <div className="absolute inset-0 top-[57px] z-10 flex flex-col bg-white/95 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-gray-800">历史对话</div>
          <div className="text-xs text-gray-500">支持切换、保留和继续之前的会话</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCreate}
            disabled={chatLoading}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 transition-colors"
          >
            新建对话
          </button>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            title="关闭历史"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-2">
          {chatSessions.map((session) => {
            const isActive = session.id === activeChatSessionId
            return (
              <button
                key={session.id}
                onClick={() => handleSelect(session.id)}
                disabled={chatLoading}
                className={`w-full rounded-2xl border px-3 py-3 text-left transition-all ${
                  isActive
                    ? 'border-blue-200 bg-blue-50 shadow-sm'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-800">{session.title}</div>
                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">
                      {getSessionPreview(session)}
                    </div>
                    <div className="mt-2 text-[11px] text-gray-400">
                      {formatSessionTime(session.updatedAt)} · {session.messages.length} 条消息
                    </div>
                  </div>
                  <button
                    onClick={(event) => handleDelete(event, session.id)}
                    disabled={chatLoading}
                    className="mt-0.5 rounded-lg px-2 py-1 text-[11px] text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                    title="删除对话"
                  >
                    删除
                  </button>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
})

HistoryPanel.displayName = 'HistoryPanel'

const ChatPanel: React.FC = React.memo(() => {
  const showSettings = useSpreadsheetStore((s) => s.showSettings)
  const setShowSettings = useSpreadsheetStore((s) => s.setShowSettings)
  const chatSessions = useSpreadsheetStore((s) => s.chatSessions)
  const activeChatSessionId = useSpreadsheetStore((s) => s.activeChatSessionId)
  const currentSession = React.useMemo(
    () => chatSessions.find((session) => session.id === activeChatSessionId) ?? chatSessions[0],
    [chatSessions, activeChatSessionId]
  )
  const chatLoading = useSpreadsheetStore((s) => s.chatLoading)
  const [showHistory, setShowHistory] = useState(false)

  const toggleSettings = useCallback(() => {
    setShowHistory(false)
    setShowSettings(!showSettings)
  }, [showSettings, setShowSettings])

  const toggleHistory = useCallback(() => {
    setShowSettings(false)
    setShowHistory((prev) => !prev)
  }, [setShowSettings])

  return (
    <div className="flex flex-col h-full w-full bg-white border-l border-gray-200 relative select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={toggleHistory}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
              showHistory
                ? 'bg-blue-100 text-blue-600'
                : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
            }`}
            title="历史对话"
          >
            <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 12h8.5m-8.5 0l2.75-2.75M7.5 12l2.75 2.75" />
            </svg>
          </button>
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-800">AI 助手</h2>
            <div className="truncate text-[11px] text-gray-500">
              {currentSession?.title || '新对话'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden text-[11px] text-gray-400 sm:block">
            {chatSessions.length} 个会话
          </div>
          <button
            onClick={toggleSettings}
            className={`w-8 h-8 flex items-center justify-center rounded-lg text-lg transition-colors ${
              showSettings
                ? 'bg-blue-100 text-blue-600'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }`}
            title="设置"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Message list */}
      <MessageList />

      {/* Input area */}
      <ChatInput />

      {/* Settings overlay */}
      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      )}

      {!showSettings && showHistory && (
        <HistoryPanel
          chatSessions={chatSessions}
          activeChatSessionId={activeChatSessionId}
          chatLoading={chatLoading}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  )
})

ChatPanel.displayName = 'ChatPanel'

export default ChatPanel
