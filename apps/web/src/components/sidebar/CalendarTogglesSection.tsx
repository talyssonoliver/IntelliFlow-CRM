'use client';

import { useState } from 'react';
import { cn, Popover, PopoverContent, PopoverTrigger } from '@intelliflow/ui';
import { useCalendarVisibility, CALENDAR_COLOR_OPTIONS } from '@/hooks/useCalendarVisibility';

interface CalendarTogglesSectionProps {
  isExpanded: boolean;
}

export function CalendarTogglesSection({ isExpanded }: Readonly<CalendarTogglesSectionProps>) {
  const { calendars, toggle, addCalendar, removeCalendar } = useCalendarVisibility();
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(CALENDAR_COLOR_OPTIONS[0]);

  const handleAdd = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    addCalendar(trimmed, newColor);
    setNewName('');
    setNewColor(CALENDAR_COLOR_OPTIONS[0]);
    setAddOpen(false);
  };

  return (
    <div>
      {isExpanded && (
        <div className="flex items-center justify-between px-3 mb-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            My Calendars
          </span>
          <Popover open={addOpen} onOpenChange={setAddOpen}>
            <PopoverTrigger asChild>
              <button
                className="p-0.5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label="Add calendar"
                title="Add calendar"
              >
                <span className="material-symbols-outlined text-base">add</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="start" side="right">
              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">New Calendar</p>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAdd();
                  }}
                  placeholder="Calendar name"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                />
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Color</p>
                  <div className="flex flex-wrap gap-1.5">
                    {CALENDAR_COLOR_OPTIONS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setNewColor(color)}
                        className={cn(
                          'w-6 h-6 rounded-full transition-all',
                          newColor === color
                            ? 'ring-2 ring-offset-2 ring-offset-background ring-ring scale-110'
                            : 'hover:scale-110'
                        )}
                        style={{ backgroundColor: color }}
                        aria-label={`Select color ${color}`}
                        aria-pressed={newColor === color}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => setAddOpen(false)}
                    className="px-3 py-1 text-xs rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAdd}
                    disabled={!newName.trim()}
                    className="px-3 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                  >
                    Add
                  </button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}
      <div
        className="flex flex-col gap-0.5"
        role="group" // NOSONAR typescript:S6819 — ARIA group for calendar toggles; <fieldset> would require <legend> and changes layout
        aria-label="My Calendars"
      >
        {calendars.map((cal) => (
          <div
            key={cal.id}
            className={cn(
              'flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm transition-colors group',
              'text-muted-foreground hover:text-foreground hover:bg-accent',
              !isExpanded && 'justify-center'
            )}
          >
            <button
              onClick={() => toggle(cal.id)}
              className="flex items-center gap-3 flex-1 min-w-0"
              role="checkbox" // NOSONAR typescript:S6819 — styled button acts as checkbox toggle; <input type="checkbox"> cannot contain icon/label children
              aria-checked={cal.checked}
              aria-label={cal.label}
            >
              {isExpanded ? (
                <>
                  <span
                    className="material-symbols-outlined text-lg flex-shrink-0"
                    style={{ color: cal.color }}
                    aria-hidden="true"
                  >
                    {cal.checked ? 'check_box' : 'check_box_outline_blank'}
                  </span>
                  <span className="flex-1 text-left truncate">{cal.label}</span>
                </>
              ) : (
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: cal.checked ? cal.color : 'transparent',
                    border: cal.checked ? 'none' : `2px solid ${cal.color}`,
                  }}
                  aria-hidden="true"
                />
              )}
            </button>
            {/* Remove button for custom calendars (only when expanded) */}
            {isExpanded && !cal.isDefault && (
              <button
                onClick={() => {
                  removeCalendar(cal.id);
                }}
                className="p-0.5 rounded-sm text-muted-foreground/0 group-hover:text-muted-foreground hover:!text-destructive transition-colors"
                aria-label={`Remove ${cal.label}`}
                title={`Remove ${cal.label}`}
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
