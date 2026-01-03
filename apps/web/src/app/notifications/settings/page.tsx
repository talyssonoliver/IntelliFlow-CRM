'use client';

import { useState } from 'react';
import Link from 'next/link';

// =============================================================================
// Types
// =============================================================================

interface NotificationType {
  id: string;
  label: string;
  description: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  channels: {
    inApp: boolean;
    email: boolean;
    push: boolean;
    sms: boolean;
  };
  disabledChannels?: ('inApp' | 'email' | 'push' | 'sms')[];
}

// =============================================================================
// Sample Data
// =============================================================================

const initialNotificationTypes: NotificationType[] = [
  {
    id: 'tasks',
    label: 'Tasks & Deadlines',
    description: 'Task assignments, due dates, and reminders',
    icon: 'task_alt',
    iconBg: 'bg-blue-50 dark:bg-blue-900/20',
    iconColor: 'text-blue-600 dark:text-blue-400',
    channels: { inApp: true, email: true, push: true, sms: false },
  },
  {
    id: 'deals',
    label: 'Deals & Updates',
    description: 'Deal stage changes, won deals, and probability updates',
    icon: 'monetization_on',
    iconBg: 'bg-green-50 dark:bg-green-900/20',
    iconColor: 'text-green-600 dark:text-green-400',
    channels: { inApp: true, email: true, push: false, sms: false },
    disabledChannels: ['sms'],
  },
  {
    id: 'mentions',
    label: 'Mentions & Comments',
    description: 'When someone mentions you or replies to your activity',
    icon: 'alternate_email',
    iconBg: 'bg-orange-50 dark:bg-orange-900/20',
    iconColor: 'text-orange-600 dark:text-orange-400',
    channels: { inApp: true, email: true, push: true, sms: false },
  },
  {
    id: 'sla',
    label: 'SLA Alerts',
    description: 'Breach warnings and critical ticket updates',
    icon: 'warning',
    iconBg: 'bg-red-50 dark:bg-red-900/20',
    iconColor: 'text-red-600 dark:text-red-400',
    channels: { inApp: true, email: true, push: true, sms: true },
  },
  {
    id: 'ai',
    label: 'AI Insights',
    description: 'Smart suggestions, predictions, and anomalies',
    icon: 'psychology',
    iconBg: 'bg-purple-50 dark:bg-purple-900/20',
    iconColor: 'text-purple-600 dark:text-purple-400',
    channels: { inApp: true, email: false, push: false, sms: false },
    disabledChannels: ['push', 'sms'],
  },
  {
    id: 'system',
    label: 'System & Security',
    description: 'Password changes, new logins, and maintenance',
    icon: 'settings',
    iconBg: 'bg-slate-100 dark:bg-slate-700',
    iconColor: 'text-slate-600 dark:text-slate-400',
    channels: { inApp: true, email: true, push: false, sms: false },
    disabledChannels: ['push', 'sms'],
  },
];

// =============================================================================
// Toggle Switch Component
// =============================================================================

function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
}: Readonly<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}>) {
  return (
    <label className={`relative inline-flex items-center ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => !disabled && onChange(e.target.checked)}
        disabled={disabled}
        className="sr-only peer"
      />
      <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
    </label>
  );
}

// =============================================================================
// Main Settings Page Component
// =============================================================================

export default function NotificationSettingsPage() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(true);
  const [quietHoursStart, setQuietHoursStart] = useState('22:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState('07:00');
  const [selectedDays, setSelectedDays] = useState(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [notificationTypes, setNotificationTypes] = useState(initialNotificationTypes);
  const [priorityFilter, setPriorityFilter] = useState('medium');

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const toggleChannel = (
    typeId: string,
    channel: 'inApp' | 'email' | 'push' | 'sms',
    value: boolean
  ) => {
    setNotificationTypes((prev) =>
      prev.map((type) =>
        type.id === typeId
          ? { ...type, channels: { ...type.channels, [channel]: value } }
          : type
      )
    );
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="mx-auto flex flex-col gap-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Link href="/dashboard" className="hover:text-primary transition-colors">
            Dashboard
          </Link>
          <span className="material-symbols-outlined text-[16px]">chevron_right</span>
          <Link href="/notifications" className="hover:text-primary transition-colors">
            Notifications
          </Link>
          <span className="material-symbols-outlined text-[16px]">chevron_right</span>
          <span className="text-slate-900 dark:text-white font-medium">Settings</span>
        </nav>

        {/* Page Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            Notification Settings
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Manage how and when you receive updates from IntelliFlow.
          </p>
        </div>

        {/* Settings Cards */}
        <div className="flex flex-col gap-6">
          {/* General Preferences */}
          <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  General Preferences
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Global controls for your notification experience
                </p>
              </div>
            </div>
            <div className="p-6 grid gap-6">
              {/* Enable Notifications */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    Enable Notifications
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Turn off to pause all notifications temporarily.
                  </span>
                </div>
                <ToggleSwitch checked={notificationsEnabled} onChange={setNotificationsEnabled} />
              </div>

              {/* Quiet Hours */}
              <div className="flex items-start justify-between border-t border-slate-100 dark:border-slate-700 pt-6">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    Quiet Hours
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                    Mute notifications during specific times.
                  </span>
                  <div className="flex items-center gap-3">
                    <input
                      type="time"
                      value={quietHoursStart}
                      onChange={(e) => setQuietHoursStart(e.target.value)}
                      className="block w-full rounded-md border-0 py-1.5 text-slate-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-600 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6"
                    />
                    <span className="text-sm text-slate-500 dark:text-slate-400">to</span>
                    <input
                      type="time"
                      value={quietHoursEnd}
                      onChange={(e) => setQuietHoursEnd(e.target.value)}
                      className="block w-full rounded-md border-0 py-1.5 text-slate-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-600 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6"
                    />
                  </div>
                  <div className="flex gap-2 mt-3">
                    {days.map((day) => (
                      <button
                        key={day}
                        onClick={() => toggleDay(day)}
                        className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                          selectedDays.includes(day)
                            ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-400'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
                <ToggleSwitch checked={quietHoursEnabled} onChange={setQuietHoursEnabled} />
              </div>
            </div>
          </div>

          {/* Notification Types */}
          <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 grid grid-cols-12 gap-4 items-center">
              <div className="col-span-5">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Notification Types
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Choose what you want to be notified about
                </p>
              </div>
              <div className="col-span-7 flex justify-end text-center">
                <div className="grid grid-cols-4 w-full max-w-md gap-2">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    In-App
                  </div>
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Email
                  </div>
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Push
                  </div>
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    SMS
                  </div>
                </div>
              </div>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {notificationTypes.map((type) => (
                <div
                  key={type.id}
                  className="px-6 py-4 grid grid-cols-12 gap-4 items-center hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors"
                >
                  <div className="col-span-5 flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${type.iconBg} ${type.iconColor}`}
                    >
                      <span className="material-symbols-outlined">{type.icon}</span>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        {type.label}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {type.description}
                      </p>
                    </div>
                  </div>
                  <div className="col-span-7 flex justify-end">
                    <div className="grid grid-cols-4 w-full max-w-md gap-2 justify-items-center">
                      <input
                        type="checkbox"
                        checked={type.channels.inApp}
                        onChange={(e) => toggleChannel(type.id, 'inApp', e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-primary focus:ring-primary dark:bg-slate-700"
                      />
                      <input
                        type="checkbox"
                        checked={type.channels.email}
                        onChange={(e) => toggleChannel(type.id, 'email', e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-primary focus:ring-primary dark:bg-slate-700"
                      />
                      <input
                        type="checkbox"
                        checked={type.channels.push}
                        onChange={(e) => toggleChannel(type.id, 'push', e.target.checked)}
                        disabled={type.disabledChannels?.includes('push')}
                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-primary focus:ring-primary dark:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <input
                        type="checkbox"
                        checked={type.channels.sms}
                        onChange={(e) => toggleChannel(type.id, 'sms', e.target.checked)}
                        disabled={type.disabledChannels?.includes('sms')}
                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-primary focus:ring-primary dark:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Priority Filtering */}
          <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden p-6">
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Priority Filtering
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Only receive notifications with a priority level of:
              </p>
              <div className="flex flex-wrap items-center gap-4 mt-2">
                {[
                  { id: 'low', label: 'Low & above' },
                  { id: 'medium', label: 'Medium & above' },
                  { id: 'high', label: 'High & above' },
                  { id: 'urgent', label: 'Urgent only' },
                ].map((option) => (
                  <div key={option.id} className="flex items-center">
                    <input
                      type="radio"
                      id={`priority-${option.id}`}
                      name="priority-filter"
                      checked={priorityFilter === option.id}
                      onChange={() => setPriorityFilter(option.id)}
                      className="h-4 w-4 border-slate-300 dark:border-slate-600 text-primary focus:ring-primary dark:bg-slate-700"
                    />
                    <label
                      htmlFor={`priority-${option.id}`}
                      className="ml-3 block text-sm font-medium leading-6 text-slate-900 dark:text-white"
                    >
                      {option.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 pb-8">
            <Link
              href="/notifications"
              className="px-5 py-2.5 rounded-lg text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </Link>
            <button className="px-5 py-2.5 rounded-lg bg-primary text-white font-semibold text-sm shadow-sm shadow-blue-500/30 hover:bg-blue-600 transition-colors">
              Save Preferences
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
