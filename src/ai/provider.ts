export interface AIProvider {
  sendMessage(
    messages: { role: 'user' | 'assistant'; content: string }[],
    onToken: (token: string) => void,
    onToolCall: (name: string, input: Record<string, any>) => Promise<string>,
  ): Promise<string>
}
