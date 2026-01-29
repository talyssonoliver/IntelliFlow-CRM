'use client';

import type { WidgetProps } from './index';

interface Message {
  id: string;
  user: string;
  avatar: string;
  message: string;
  time: string;
}

const messages: Message[] = [
  { id: '1', user: 'Sarah', avatar: 'S', message: 'Just closed the deal with TechCorp!', time: '5m' },
  { id: '2', user: 'Mike', avatar: 'M', message: 'Great work team!', time: '12m' },
  { id: '3', user: 'Emily', avatar: 'E', message: 'Meeting notes uploaded', time: '1h' },
];

export function TeamChatWidget(_props: WidgetProps) {
  return (
    <div className="p-5 h-full flex flex-col">
      <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-slate-400">chat</span>
        Team Chat
      </h3>

      <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
        {messages.map((msg) => (
          <div key={msg.id} className="flex items-start gap-2">
            <div className="size-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-medium text-slate-600 dark:text-slate-300 flex-shrink-0">
              {msg.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-900 dark:text-white">
                  {msg.user}
                </span>
                <span className="text-xs text-slate-400">{msg.time}</span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">{msg.message}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-border-light dark:border-border-dark">
        <input
          type="text"
          placeholder="Type a message..."
          className="w-full px-3 py-2 text-sm bg-background-light dark:bg-background-dark border-none rounded-lg focus:ring-1 focus:ring-ds-primary placeholder:text-slate-400"
        />
      </div>
    </div>
  );
}
