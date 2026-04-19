import React from 'react'

interface AppErrorBoundaryState {
  error: Error | null
}

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ui:error-boundary]', error, errorInfo)
  }

  render() {
    if (!this.state.error) {
      return this.props.children
    }

    return (
      <div className="flex h-full min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-lg rounded-3xl border border-red-100 bg-white p-6 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-red-600">界面加载失败</div>
          <h1 className="text-xl font-semibold text-slate-900">文枢在启动界面时遇到了错误</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            应用没有正常完成渲染。你可以先重启应用；如果问题持续存在，再把下面的错误信息发给我，我可以继续帮你定位。
          </p>
          <pre className="mt-4 overflow-x-auto rounded-2xl bg-slate-900 p-4 text-xs leading-6 text-slate-100">
            {this.state.error.stack || this.state.error.message}
          </pre>
        </div>
      </div>
    )
  }
}
