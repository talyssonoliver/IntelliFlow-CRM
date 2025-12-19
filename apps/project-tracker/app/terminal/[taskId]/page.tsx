'use client';

import { useState, useEffect, useRef, use } from 'react';
import { Send, RefreshCw, Terminal as TerminalIcon, AlertCircle } from 'lucide-react';

export default function TerminalPage({
  params,
}: Readonly<{ params: Promise<{ taskId: string }> }>) {
  const { taskId } = use(params);
  const [output, setOutput] = useState('');
  const [input, setInput] = useState('');
  const [isWaitingForInput, setIsWaitingForInput] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchOutput = async () => {
      try {
        const response = await fetch(`/api/swarm/terminal/${taskId}`);
        if (response.ok) {
          const data = await response.json();
          setOutput(data.recentOutput || data.fullLog || '');
          setIsWaitingForInput(data.waitingForInput || false);
        }
      } catch (error) {
        console.error('Failed to fetch terminal output:', error);
      }
    };

    fetchOutput();
    const interval = setInterval(fetchOutput, 2000);

    return () => clearInterval(interval);
  }, [taskId]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const handleSendInput = async (inputText: string) => {
    setIsSending(true);
    try {
      const response = await fetch(`/api/swarm/terminal/${taskId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: inputText }),
      });

      if (response.ok) {
        setInput('');
        // Wait a moment then refresh output
        setTimeout(() => {
          fetch(`/api/swarm/terminal/${taskId}`)
            .then((res) => res.json())
            .then((data) => {
              setOutput(data.recentOutput || data.fullLog || '');
              setIsWaitingForInput(data.waitingForInput || false);
            });
        }, 1000);
      } else {
        alert('Failed to send input');
      }
    } catch (error) {
      console.error('Failed to send input:', error);
      alert('Error sending input');
    } finally {
      setIsSending(false);
    }
  };

  const handleQuickAction = (action: string) => {
    handleSendInput(action);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TerminalIcon className="w-8 h-8 text-green-400" />
            <div>
              <h1 className="text-2xl font-bold text-white">Interactive Terminal</h1>
              <p className="text-sm text-gray-400">Task: {taskId}</p>
            </div>
          </div>
          {isWaitingForInput && (
            <div className="flex items-center gap-2 px-4 py-2 bg-yellow-900/30 border border-yellow-600 rounded-lg">
              <AlertCircle className="w-5 h-5 text-yellow-400 animate-pulse" />
              <span className="text-yellow-200 font-semibold">Waiting for input</span>
            </div>
          )}
        </div>

        {/* Terminal Output */}
        <div className="bg-black rounded-lg border border-gray-700 shadow-2xl mb-4">
          <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 flex items-center gap-2">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
            </div>
            <span className="text-sm text-gray-400 ml-4">Terminal Output</span>
          </div>
          <div
            ref={outputRef}
            className="p-4 font-mono text-sm h-96 overflow-y-auto whitespace-pre-wrap"
            style={{ fontFamily: 'Consolas, Monaco, monospace' }}
          >
            {output || 'Loading terminal output...'}
          </div>
        </div>

        {/* Quick Actions */}
        {isWaitingForInput && (
          <div className="mb-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Quick Actions</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleQuickAction('y')}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                disabled={isSending}
              >
                Yes (y)
              </button>
              <button
                onClick={() => handleQuickAction('n')}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                disabled={isSending}
              >
                No (n)
              </button>
              <button
                onClick={() => handleQuickAction('\n')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                disabled={isSending}
              >
                Enter/Continue
              </button>
              <button
                onClick={() => handleQuickAction('skip')}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium transition-colors"
                disabled={isSending}
              >
                Skip
              </button>
              <button
                onClick={() => handleQuickAction('exit')}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
                disabled={isSending}
              >
                Exit
              </button>
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <label htmlFor="terminal-input" className="block text-sm font-medium text-gray-300 mb-2">
            Send Input to Agent
          </label>
          <div className="flex gap-2">
            <input
              id="terminal-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendInput(input);
                }
              }}
              placeholder="Type your response or command..."
              className="flex-1 px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
              disabled={isSending}
            />
            <button
              onClick={() => handleSendInput(input)}
              disabled={isSending || !input.trim()}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              {isSending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send
                </>
              )}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Press Enter to send, or use quick actions above for common responses
          </p>
        </div>

        {/* Help Text */}
        <div className="mt-6 p-4 bg-blue-900/20 border border-blue-700 rounded-lg">
          <h3 className="text-sm font-semibold text-blue-300 mb-2">💡 How to Help Stuck Agents</h3>
          <ul className="text-sm text-gray-400 space-y-1">
            <li>• View the terminal output above to see what the agent is asking</li>
            <li>• Use quick actions for common responses (yes/no/continue)</li>
            <li>• Type custom input if the agent needs specific information</li>
            <li>• The terminal refreshes every 2 seconds automatically</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
