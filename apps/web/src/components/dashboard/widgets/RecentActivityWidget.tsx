'use client';

import type { WidgetProps } from './index';

interface Activity {
  id: string;
  user: string;
  avatar: string;
  action: string;
  target: string;
  targetColor?: string;
  time: string;
}

const sampleActivities: Activity[] = [
  {
    id: '1',
    user: 'Alice Smith',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDumQYe7A7b8PYZ5FXv4I4fcF2uYx7p9lStxZmXH2JLUDSAtEDrdEUH_kVPyYZKEw1yXnrw4o0CjyrDotVnxvLuZtzmlEHpZDf5T1Xyl8Pnl9llmpTqoORo4UstRvE9T-JqCP1oKRJFdEubKmKKAn8YdBmqQDeDouglzBlxQxJhi9lNdHXcOi-Lm-mE1zjMvpwxcVnEdgEFTaa8pnDJ43CJhEobfcmoImvZhbuvEJ2XuO6cyR7uhP0s_kMLBuLqYUqZP2YmYKdq_NII',
    action: 'created a new deal',
    target: 'Tech Solutions Bundle',
    targetColor: 'text-ds-primary',
    time: '2 minutes ago',
  },
  {
    id: '2',
    user: 'Bob Jones',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDNXGIII2sYb5-Z7p1WN4GriiueWisixQJDiCAgj-K8HVZi0bP1IZzjpVSVWT77qEJD3tlacIs_W8ahFYnbcQcWUtSq7yZZc52RlssjzgeKhJCaVWShsdjEdFlgTnbqZzQ3f2w1swL4j_O2DW2Wp4pVPMMWfjD3oVUb73SOPF6TbE-8v-DNWUIz3Wnt0kM8-08IAq_nzv-88F23v1oM08uk8FhByP0megKcx60r09_fMuplqWy1_GbnDcgafds83Fh2pdt23YBUaR6B',
    action: 'updated status for',
    target: 'Project Alpha',
    time: '1 hour ago',
  },
];

export function RecentActivityWidget(_props: WidgetProps) {
  return (
    <div className="p-5 h-full flex flex-col">
      <h3 className="font-bold text-slate-900 dark:text-white mb-4">Recent Activity</h3>

      <div className="flex flex-col gap-4 flex-1">
        {sampleActivities.map((activity) => (
          <div key={activity.id} className="flex items-center gap-3">
            <div
              className="bg-center bg-no-repeat bg-cover rounded-full size-8"
              style={{ backgroundImage: `url("${activity.avatar}")` }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-800 dark:text-slate-200">
                <span className="font-semibold">{activity.user}</span> {activity.action}{' '}
                <span className={activity.targetColor || 'font-medium text-slate-700 dark:text-slate-300'}>
                  {activity.target}
                </span>
              </p>
              <p className="text-xs text-slate-500">{activity.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
