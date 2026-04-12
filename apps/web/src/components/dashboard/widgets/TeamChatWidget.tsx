'use client';

import type { WidgetProps } from './index';

export function TeamChatWidget(_props: Readonly<WidgetProps>) {
  return (
    <div className="p-5 h-full flex flex-col">
      <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-slate-400">chat</span> Team Chat
      </h3>

      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <div className="size-12 rounded-full bg-muted flex items-center justify-center mb-3">
          <span className="material-symbols-outlined text-2xl text-muted-foreground">forum</span>
        </div>
        <p className="text-sm font-medium text-muted-foreground">Coming Soon</p>
        <p className="text-xs text-muted-foreground mt-1">Team messaging is under development</p>
      </div>
    </div>
  );
}
