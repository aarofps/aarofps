import { ChatBox } from "@/components/ChatBox";

export const dynamic = "force-dynamic";

export default function ChatPage() {
  const enabled = !!process.env.ANTHROPIC_API_KEY;
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-xl font-semibold">Ask AI</h1>
      {enabled ? <ChatBox /> : (
        <div className="card p-5 text-sm">
          <p className="font-medium">Chat is off.</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
            <li>Create an API key in the Claude Console (console.anthropic.com).</li>
            <li>Add <code className="rounded bg-surface-2 px-1">ANTHROPIC_API_KEY=...</code> to <code className="rounded bg-surface-2 px-1">.env.local</code>.</li>
            <li>Restart the app.</li>
          </ol>
          <p className="mt-3 text-muted">Each question costs a fraction of a cent to a few cents.</p>
        </div>
      )}
    </div>
  );
}
