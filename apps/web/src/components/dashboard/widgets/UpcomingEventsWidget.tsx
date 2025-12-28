'use client';

import type { WidgetProps } from './index';

interface Event {
  id: string;
  title: string;
  time: string;
  type: 'meeting' | 'call' | 'deadline';
}

const events: Event[] = [
  { id: '1', title: 'Product Demo - TechCorp', time: 'Today, 3:00 PM', type: 'meeting' },
  { id: '2', title: 'Follow-up Call - Sarah', time: 'Tomorrow, 10:30 AM', type: 'call' },
  { id: '3', title: 'Proposal Deadline', time: 'Oct 28, 5:00 PM', type: 'deadline' },
];

const typeIcons: Record<string, { icon: string; color: string }> = {
  meeting: { icon: 'videocam', color: 'text-blue-500 bg-blue-100 dark:bg-blue-900/20' },
  call: { icon: 'call', color: 'text-green-500 bg-green-100 dark:bg-green-900/20' },
  deadline: { icon: 'schedule', color: 'text-amber-500 bg-amber-100 dark:bg-amber-900/20' },
};

export function UpcomingEventsWidget(_props: WidgetProps) {
  return (
    <div className="p-5 h-full flex flex-col">
      <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-slate-400">calendar_month</span>
        Upcoming Events
      </h3>

      <div className="flex flex-col gap-3 flex-1">
        {events.map((event) => {
          const { icon, color } = typeIcons[event.type];
          return (
            <div
              key={event.id}
              className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg transition-colors cursor-pointer"
            >
              <div className={`size-8 rounded-full flex items-center justify-center ${color}`}>
                <span className="material-symbols-outlined text-lg">{icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                  {event.title}
                </p>
                <p className="text-xs text-slate-500">{event.time}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
