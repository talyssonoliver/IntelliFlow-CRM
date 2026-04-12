'use client';

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { clsx } from 'clsx';
import { Icon } from '@/lib/icons';

/**
 * Gantt Chart Component
 *
 * SVG-based Gantt visualization implementing PMBOK schedule display:
 * - Task bars with duration proportional to time
 * - Critical path tasks highlighted in red
 * - Float shown as gray extension on bars
 * - Dependency arrows (FS/SS/FF/SF)
 * - Zoom controls: Day / Week / Sprint view
 */

export interface GanttTask {
  taskId: string;
  description?: string;
  earlyStart: string;
  earlyFinish: string;
  lateStart: string;
  lateFinish: string;
  expectedDuration: number;
  totalFloat: number;
  freeFloat: number;
  isCritical: boolean;
  percentComplete: number;
  status: string;
  dependencies?: string[];
}

export interface GanttChartProps {
  tasks: GanttTask[];
  sprintStart: string;
  sprintEnd: string;
  onTaskClick?: (taskId: string) => void;
  className?: string;
}

type ZoomLevel = 'day' | 'week' | 'sprint';

const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 50;
const TASK_BAR_HEIGHT = 24;
const LEFT_PANEL_WIDTH = 200;

function formatDate(date: Readonly<Date>): string {
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function getDaysBetween(start: Date, end: Date): number {
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function getDateRange(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function getWeekRange(start: Date, end: Date): { start: Date; end: Date; label: string }[] {
  const weeks: { start: Date; end: Date; label: string }[] = [];
  const current = new Date(start);

  while (current <= end) {
    const weekStart = new Date(current);
    const weekEnd = new Date(current);
    weekEnd.setDate(weekEnd.getDate() + 6);

    weeks.push({
      start: weekStart,
      end: new Date(Math.min(weekEnd.getTime(), end.getTime())),
      label: `W${Math.ceil((current.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1}`,
    });

    current.setDate(current.getDate() + 7);
  }

  return weeks;
}

interface PeriodOverview {
  type: ZoomLevel;
  start: Date;
  end: Date;
  label: string;
}

export default function GanttChart({
  tasks,
  sprintStart,
  sprintEnd,
  onTaskClick,
  className,
}: Readonly<GanttChartProps>) {
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('week');
  const [showDependencies, setShowDependencies] = useState(true);
  const [showFloat, setShowFloat] = useState(true);
  const [hoveredTask, setHoveredTask] = useState<string | null>(null);
  const [hasScrolledToToday, setHasScrolledToToday] = useState(false);
  const [headerScrollLeft, setHeaderScrollLeft] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodOverview | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const startDate = useMemo(() => new Date(sprintStart), [sprintStart]);
  const endDate = useMemo(() => new Date(sprintEnd), [sprintEnd]);

  // Calculate chart dimensions based on zoom level
  const totalDays = useMemo(() => getDaysBetween(startDate, endDate) + 1, [startDate, endDate]);
  const dayWidth = useMemo(() => {
    switch (zoomLevel) {
      case 'day':
        return 40;
      case 'week':
        return 20;
      case 'sprint':
        return 10;
      default:
        return 20;
    }
  }, [zoomLevel]);
  const chartWidth = useMemo(() => totalDays * dayWidth, [totalDays, dayWidth]);
  const chartHeight = useMemo(() => tasks.length * ROW_HEIGHT, [tasks.length]);

  // Get position for a date - memoized to depend on dayWidth
  const getXPosition = useCallback(
    (date: Readonly<Date>): number => {
      const daysDiff = getDaysBetween(startDate, date);
      return daysDiff * dayWidth;
    },
    [startDate, dayWidth]
  );

  // Sort tasks by early start
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      return new Date(a.earlyStart).getTime() - new Date(b.earlyStart).getTime();
    });
  }, [tasks]);

  // Create task position map for dependency arrows
  const taskPositions = useMemo(() => {
    const positions = new Map<string, { x: number; y: number; width: number }>();
    sortedTasks.forEach((task, index) => {
      const x = getXPosition(new Date(task.earlyStart));
      const y = index * ROW_HEIGHT + (ROW_HEIGHT - TASK_BAR_HEIGHT) / 2;
      const width = Math.max(dayWidth, getXPosition(new Date(task.earlyFinish)) - x);
      positions.set(task.taskId, { x: LEFT_PANEL_WIDTH + x, y, width });
    });
    return positions;
  }, [sortedTasks, dayWidth, getXPosition]);

  // Scroll to both X and Y position (for today + current tasks)
  const scrollToPositionXY = useCallback((xPosition: number, yPosition: number) => {
    if (scrollContainerRef.current) {
      const containerWidth = scrollContainerRef.current.clientWidth;
      const containerHeight = scrollContainerRef.current.clientHeight;
      const scrollX = Math.max(0, xPosition - containerWidth / 2 + LEFT_PANEL_WIDTH);
      const scrollY = Math.max(0, yPosition - containerHeight / 3); // Show task in upper third
      scrollContainerRef.current.scrollTo({
        left: scrollX,
        top: scrollY,
        behavior: 'smooth',
      });
    }
  }, []);

  // Find the first task active around a given date
  const findTaskIndexForDate = useCallback(
    (targetDate: Readonly<Date>): number => {
      // First, find tasks that are currently in progress (start <= today <= finish)
      const activeIndex = sortedTasks.findIndex((task) => {
        const taskStart = new Date(task.earlyStart);
        const taskFinish = new Date(task.earlyFinish);
        return taskStart <= targetDate && targetDate <= taskFinish;
      });
      if (activeIndex >= 0) return activeIndex;

      // If no active task, find the first task starting after today
      const upcomingIndex = sortedTasks.findIndex((task) => {
        const taskStart = new Date(task.earlyStart);
        return taskStart > targetDate;
      });
      if (upcomingIndex >= 0) return Math.max(0, upcomingIndex - 1); // Show one task before

      // If all tasks are in the past, show the last tasks
      return Math.max(0, sortedTasks.length - 10);
    },
    [sortedTasks]
  );

  // Scroll to today's date on initial load (both horizontal and vertical)
  useEffect(() => {
    if (!hasScrolledToToday && scrollContainerRef.current && sortedTasks.length > 0) {
      const today = new Date();

      // If today is within the project range, scroll to today
      if (today >= startDate && today <= endDate) {
        const todayX = getXPosition(today);
        const taskIndex = findTaskIndexForDate(today);
        const taskY = taskIndex * ROW_HEIGHT;
        scrollToPositionXY(todayX, taskY);
      } else if (today > endDate) {
        // If project is in the past, scroll to the end
        const taskY = Math.max(0, sortedTasks.length - 10) * ROW_HEIGHT;
        scrollToPositionXY(chartWidth, taskY);
      }
      // If project is in the future, stay at the beginning (default)

      setHasScrolledToToday(true);
    }
  }, [
    hasScrolledToToday,
    sortedTasks,
    startDate,
    endDate,
    getXPosition,
    chartWidth,
    scrollToPositionXY,
    findTaskIndexForDate,
  ]);

  // Reset scroll flag when zoom level changes to re-center
  useEffect(() => {
    setHasScrolledToToday(false);
  }, [zoomLevel]);

  // Handle header click - open modal with period overview
  const handleHeaderClick = useCallback(
    (xPosition: number, headerInfo?: { label: string; width: number }) => {
      // Calculate the date at this X position
      const daysFromStart = Math.floor(xPosition / dayWidth);
      const periodStartDate = new Date(startDate);
      periodStartDate.setDate(periodStartDate.getDate() + daysFromStart);

      let periodEndDate: Date;
      let label: string;

      if (zoomLevel === 'day') {
        // For day view, the period is just that day
        periodEndDate = new Date(periodStartDate);
        label = formatDate(periodStartDate);
      } else if (zoomLevel === 'week') {
        // For week view, calculate the week end (7 days)
        periodEndDate = new Date(periodStartDate);
        periodEndDate.setDate(periodEndDate.getDate() + 6);
        if (periodEndDate > endDate) periodEndDate = endDate;
        label = headerInfo?.label || `Week of ${formatDate(periodStartDate)}`;
      } else {
        // For sprint view, calculate sprint end (14 days)
        periodEndDate = new Date(periodStartDate);
        periodEndDate.setDate(periodEndDate.getDate() + 13);
        if (periodEndDate > endDate) periodEndDate = endDate;
        label = headerInfo?.label || `Sprint ${Math.floor(daysFromStart / 14)}`;
      }

      setSelectedPeriod({
        type: zoomLevel,
        start: periodStartDate,
        end: periodEndDate,
        label,
      });
      setModalOpen(true);
    },
    [dayWidth, startDate, endDate, zoomLevel]
  );

  // Get tasks for the selected period
  const tasksInPeriod = useMemo(() => {
    if (!selectedPeriod) return [];

    return sortedTasks.filter((task) => {
      const taskStart = new Date(task.earlyStart);
      const taskEnd = new Date(task.earlyFinish);

      // Task is in period if it overlaps with the period
      return taskStart <= selectedPeriod.end && taskEnd >= selectedPeriod.start;
    });
  }, [selectedPeriod, sortedTasks]);

  // Close modal
  const closeModal = useCallback(() => {
    setModalOpen(false);
    setSelectedPeriod(null);
  }, []);

  // Time scale headers
  const timeHeaders = useMemo(() => {
    if (zoomLevel === 'day') {
      return getDateRange(startDate, endDate).map((date) => ({
        label: formatDate(date),
        x: getXPosition(date),
        width: dayWidth,
      }));
    } else if (zoomLevel === 'week') {
      return getWeekRange(startDate, endDate).map((week) => ({
        label: week.label,
        x: getXPosition(week.start),
        width: getDaysBetween(week.start, week.end) * dayWidth + dayWidth,
      }));
    } else {
      // Sprint view - show sprints (each sprint = 2 weeks = 14 days)
      const SPRINT_DAYS = 14;
      const sprints: { label: string; x: number; width: number }[] = [];
      let sprintNum = 0;
      let sprintStartDate = new Date(startDate);

      while (sprintStartDate <= endDate) {
        const sprintEndDate = new Date(sprintStartDate);
        sprintEndDate.setDate(sprintEndDate.getDate() + SPRINT_DAYS - 1);

        const actualEnd = new Date(Math.min(sprintEndDate.getTime(), endDate.getTime()));
        const sprintDays = getDaysBetween(sprintStartDate, actualEnd) + 1;

        sprints.push({
          label: `S${sprintNum}`,
          x: getXPosition(sprintStartDate),
          width: sprintDays * dayWidth,
        });

        sprintNum++;
        sprintStartDate = new Date(sprintEndDate);
        sprintStartDate.setDate(sprintStartDate.getDate() + 1);
      }

      return sprints;
    }
  }, [zoomLevel, startDate, endDate, dayWidth, getXPosition]);

  // Render dependency arrows
  const renderDependencyArrows = () => {
    if (!showDependencies) return null;

    const arrows: React.ReactElement[] = [];

    sortedTasks.forEach((task) => {
      if (!task.dependencies || task.dependencies.length === 0) return;

      const targetPos = taskPositions.get(task.taskId);
      if (!targetPos) return;

      task.dependencies.forEach((depId) => {
        const sourcePos = taskPositions.get(depId);
        if (!sourcePos) return;

        // FS dependency arrow (Finish-to-Start)
        const startX = sourcePos.x + sourcePos.width;
        const startY = sourcePos.y + TASK_BAR_HEIGHT / 2;
        const endX = targetPos.x;
        const endY = targetPos.y + TASK_BAR_HEIGHT / 2;

        // Create path with curved corners
        const midX = (startX + endX) / 2;
        const path = `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX - 5} ${endY}`;

        arrows.push(
          <g key={`${depId}->${task.taskId}`}>
            <path
              d={path}
              fill="none"
              stroke={hoveredTask === task.taskId || hoveredTask === depId ? '#3b82f6' : '#94a3b8'}
              strokeWidth={hoveredTask === task.taskId || hoveredTask === depId ? 2 : 1}
              strokeDasharray={
                hoveredTask === task.taskId || hoveredTask === depId ? 'none' : '4,2'
              }
            />
            {/* Arrow head */}
            <polygon
              points={`${endX},${endY} ${endX - 6},${endY - 4} ${endX - 6},${endY + 4}`}
              fill={hoveredTask === task.taskId || hoveredTask === depId ? '#3b82f6' : '#94a3b8'}
            />
          </g>
        );
      });
    });

    return arrows;
  };

  return (
    <div className={clsx('bg-white rounded-lg border border-gray-200 overflow-hidden', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 bg-gray-200 rounded-lg p-1">
            {(['day', 'week', 'sprint'] as ZoomLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => setZoomLevel(level)}
                className={clsx(
                  'px-3 py-1 text-sm font-medium rounded transition-colors',
                  zoomLevel === level
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                )}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const today = new Date();
                if (today >= startDate && today <= endDate) {
                  const todayX = getXPosition(today);
                  const taskIndex = findTaskIndexForDate(today);
                  const taskY = taskIndex * ROW_HEIGHT;
                  scrollToPositionXY(todayX, taskY);
                }
              }}
              className="px-3 py-1 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
              title="Scroll to today"
            >
              Today
            </button>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showDependencies}
                onChange={(e) => setShowDependencies(e.target.checked)}
                className="rounded border-gray-300"
              />{' '}
              Dependencies
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showFloat}
                onChange={(e) => setShowFloat(e.target.checked)}
                className="rounded border-gray-300"
              />{' '}
              Float
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Legend */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-4 h-3 bg-red-500 rounded" />
              <span className="text-gray-500">Critical</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-3 bg-blue-500 rounded" />
              <span className="text-gray-500">Normal</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-3 bg-green-500 rounded" />
              <span className="text-gray-500">Complete</span>
            </div>
            {showFloat ? (
              <div className="flex items-center gap-1">
                <div className="w-4 h-3 bg-gray-300 rounded" />
                <span className="text-gray-500">Float</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Fixed Header Row */}
      <div className="flex border-b border-gray-200 bg-gray-50">
        {/* Task column header */}
        <div
          className="flex-shrink-0 px-3 flex items-center font-medium text-sm text-gray-700 border-r border-gray-200"
          style={{ width: LEFT_PANEL_WIDTH, height: HEADER_HEIGHT }}
        >
          Task
        </div>
        {/* Time headers - scrollable, synced with main content */}
        <div className="flex-1 overflow-hidden" style={{ height: HEADER_HEIGHT }}>
          <svg
            width={chartWidth}
            height={HEADER_HEIGHT}
            className="block"
            style={{ transform: `translateX(-${headerScrollLeft}px)` }}
          >
            <rect x={0} y={0} width={chartWidth} height={HEADER_HEIGHT} fill="#f9fafb" />
            {timeHeaders.map((header, index) => (
              <g
                key={index} // NOSONAR typescript:S6479
                className="cursor-pointer"
                onClick={() => handleHeaderClick(header.x, header)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') handleHeaderClick(header.x, header);
                }}
                role="button"
                tabIndex={0}
                aria-label={`Navigate to ${header.label}`}
              >
                <rect
                  x={header.x}
                  y={0}
                  width={header.width}
                  height={HEADER_HEIGHT}
                  fill="transparent"
                  stroke="#e5e7eb"
                  className="hover:fill-blue-50 transition-colors"
                />
                <text
                  x={header.x + header.width / 2}
                  y={HEADER_HEIGHT / 2 + 5}
                  textAnchor="middle"
                  className="text-xs fill-gray-600 pointer-events-none"
                >
                  {header.label}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>

      {/* Scrollable Chart container */}
      <div
        ref={scrollContainerRef}
        className="overflow-auto"
        style={{ maxHeight: 'calc(100vh - 350px)' }}
        onScroll={(e) => {
          // Update header scroll position to sync with content
          const target = e.target as HTMLDivElement;
          setHeaderScrollLeft(target.scrollLeft);
        }}
      >
        <div className="flex">
          {/* Left panel - Task names */}
          <div
            className="sticky left-0 z-10 bg-white border-r border-gray-200"
            style={{ width: LEFT_PANEL_WIDTH }}
          >
            {/* Task list */}
            {sortedTasks.map((task) => (
              <div
                key={task.taskId}
                className={clsx(
                  'px-3 border-b border-gray-100 flex items-center gap-2 cursor-pointer hover:bg-gray-50 transition-colors',
                  hoveredTask === task.taskId && 'bg-blue-50'
                )}
                style={{ height: ROW_HEIGHT }}
                onMouseEnter={() => setHoveredTask(task.taskId)}
                onMouseLeave={() => setHoveredTask(null)}
                onClick={() => onTaskClick?.(task.taskId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onTaskClick?.(task.taskId);
                  }
                }}
                role="button" // NOSONAR typescript:S6819 — Gantt row contains icon and text children; <button> cannot be flex row container
                tabIndex={0}
              >
                {task.isCritical ? (
                  <Icon name="warning" size="xs" className="text-red-500 flex-shrink-0" />
                ) : null}
                <span
                  className={clsx(
                    'text-sm truncate',
                    task.isCritical ? 'text-red-700 font-medium' : 'text-gray-700'
                  )}
                  title={task.description || task.taskId}
                >
                  {task.taskId}
                </span>
              </div>
            ))}
          </div>

          {/* Right panel - Gantt bars */}
          <div className="flex-1">
            <svg ref={svgRef} width={chartWidth} height={chartHeight} className="block">
              {/* Grid lines */}
              <g>
                {timeHeaders.map((header, index) => (
                  <line
                    key={index} // NOSONAR typescript:S6479
                    x1={header.x}
                    y1={0}
                    x2={header.x}
                    y2={chartHeight}
                    stroke="#f3f4f6"
                    strokeWidth={1}
                  />
                ))}
              </g>

              {/* Today line */}
              {(() => {
                const today = new Date();
                if (today >= startDate && today <= endDate) {
                  const todayX = getXPosition(today);
                  return (
                    <line
                      x1={todayX}
                      y1={0}
                      x2={todayX}
                      y2={chartHeight}
                      stroke="#ef4444"
                      strokeWidth={2}
                      strokeDasharray="4,4"
                    />
                  );
                }
                return null;
              })()}

              {/* Task bars */}
              {sortedTasks.map((task, index) => {
                const y = index * ROW_HEIGHT + (ROW_HEIGHT - TASK_BAR_HEIGHT) / 2;
                const startX = getXPosition(new Date(task.earlyStart));
                const endX = getXPosition(new Date(task.earlyFinish));
                const width = Math.max(dayWidth, endX - startX);

                // Float bar (extends beyond task bar)
                const floatWidth =
                  showFloat && task.totalFloat > 0
                    ? Math.min((task.totalFloat / 60) * (dayWidth / 8), chartWidth - startX - width)
                    : 0;

                // Progress fill
                const progressWidth = (width * task.percentComplete) / 100;

                // Determine bar color
                const incompleteBarColor = task.isCritical ? '#ef4444' : '#3b82f6';
                const barColor = task.percentComplete >= 100 ? '#22c55e' : incompleteBarColor;

                return (
                  <g
                    key={task.taskId}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredTask(task.taskId)}
                    onMouseLeave={() => setHoveredTask(null)}
                    onClick={() => onTaskClick?.(task.taskId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') onTaskClick?.(task.taskId);
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Task ${task.taskId}`}
                  >
                    {/* Row background on hover */}
                    {hoveredTask === task.taskId ? (
                      <rect
                        x={0}
                        y={index * ROW_HEIGHT}
                        width={chartWidth}
                        height={ROW_HEIGHT}
                        fill="#eff6ff"
                      />
                    ) : null}

                    {/* Float bar */}
                    {floatWidth > 0 ? (
                      <rect
                        x={startX + width}
                        y={y + 4}
                        width={floatWidth}
                        height={TASK_BAR_HEIGHT - 8}
                        rx={2}
                        fill="#e5e7eb"
                      />
                    ) : null}

                    {/* Task bar background */}
                    <rect
                      x={startX}
                      y={y}
                      width={width}
                      height={TASK_BAR_HEIGHT}
                      rx={4}
                      fill={barColor}
                      opacity={0.2}
                    />

                    {/* Progress fill */}
                    <rect
                      x={startX}
                      y={y}
                      width={progressWidth}
                      height={TASK_BAR_HEIGHT}
                      rx={4}
                      fill={barColor}
                    />

                    {/* Border */}
                    <rect
                      x={startX}
                      y={y}
                      width={width}
                      height={TASK_BAR_HEIGHT}
                      rx={4}
                      fill="none"
                      stroke={hoveredTask === task.taskId ? '#1d4ed8' : barColor}
                      strokeWidth={hoveredTask === task.taskId ? 2 : 1}
                    />

                    {/* Percent text */}
                    {width > 40 ? (
                      <text
                        x={startX + width / 2}
                        y={y + TASK_BAR_HEIGHT / 2 + 4}
                        textAnchor="middle"
                        className="text-xs font-medium"
                        fill={task.percentComplete >= 50 ? 'white' : barColor}
                      >
                        {task.percentComplete}%
                      </text>
                    ) : null}
                  </g>
                );
              })}

              {/* Dependency arrows */}
              {renderDependencyArrows()}
            </svg>
          </div>
        </div>
      </div>

      {/* Footer with summary */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 bg-gray-50 text-sm">
        <div className="flex items-center gap-4 text-gray-600">
          <span>
            <strong>{tasks.length}</strong> tasks
          </span>
          <span>
            <strong>{tasks.filter((t) => t.isCritical).length}</strong> critical
          </span>
          <span>
            <strong>{tasks.filter((t) => t.percentComplete >= 100).length}</strong> complete
          </span>
        </div>
        <div className="text-gray-500">
          {formatDate(startDate)} - {formatDate(endDate)} ({totalDays} days)
        </div>
      </div>

      {/* Period Overview Modal */}
      {modalOpen && selectedPeriod ? (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 cursor-default"
          onClick={closeModal}
          onKeyDown={(e) => {
            if (e.key === 'Escape') closeModal();
          }}
          role="button"
          tabIndex={0}
          aria-label="Close modal"
        >
          <div // NOSONAR typescript:S6847 — dialog div prevents event bubbling to backdrop; role="dialog" makes it an interactive landmark
            role="dialog" // NOSONAR typescript:S6819 — custom modal with overflow/sizing constraints; <dialog> lacks consistent CSS layout support
            aria-modal="true"
            aria-label={selectedPeriod.label}
            className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeModal();
            }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{selectedPeriod.label}</h3>
                <p className="text-sm text-gray-500">
                  {formatDate(selectedPeriod.start)}
                  {selectedPeriod.start.getTime() === selectedPeriod.end.getTime() ? null : (
                    <> - {formatDate(selectedPeriod.end)}</>
                  )}{' '}
                  ({getDaysBetween(selectedPeriod.start, selectedPeriod.end) + 1} days)
                </p>
              </div>
              <button
                onClick={closeModal}
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <Icon name="close" size="lg" className="text-gray-500" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-4 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 140px)' }}>
              {/* Summary Stats */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-blue-600">{tasksInPeriod.length}</div>
                  <div className="text-xs text-blue-600">Total Tasks</div>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {tasksInPeriod.filter((t) => t.isCritical).length}
                  </div>
                  <div className="text-xs text-red-600">Critical</div>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {tasksInPeriod.filter((t) => t.percentComplete >= 100).length}
                  </div>
                  <div className="text-xs text-green-600">Complete</div>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-amber-600">
                    {
                      tasksInPeriod.filter((t) => t.percentComplete > 0 && t.percentComplete < 100)
                        .length
                    }
                  </div>
                  <div className="text-xs text-amber-600">In Progress</div>
                </div>
              </div>

              {/* Task List */}
              {tasksInPeriod.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Tasks in this period</h4>
                  {tasksInPeriod.map((task) => (
                    <div
                      key={task.taskId}
                      className={clsx(
                        'flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors',
                        task.isCritical ? 'border-red-200 bg-red-50/50' : 'border-gray-200'
                      )}
                      onClick={() => {
                        closeModal();
                        onTaskClick?.(task.taskId);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          closeModal();
                          onTaskClick?.(task.taskId);
                        }
                      }}
                      role="button" // NOSONAR typescript:S6819 — task card row with nested icons and text; <button> cannot be block-level container
                      tabIndex={0}
                    >
                      {/* Status Indicator */}
                      {(() => {
                        const inProgressDotColor =
                          task.percentComplete > 0 ? 'bg-amber-500' : 'bg-gray-300';
                        const criticalDotColor = task.isCritical
                          ? 'bg-red-500'
                          : inProgressDotColor;
                        const dotColor =
                          task.percentComplete >= 100 ? 'bg-green-500' : criticalDotColor;
                        return (
                          <div className={clsx('w-3 h-3 rounded-full flex-shrink-0', dotColor)} />
                        );
                      })()}

                      {/* Task Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={clsx(
                              'font-medium text-sm',
                              task.isCritical ? 'text-red-700' : 'text-gray-900'
                            )}
                          >
                            {task.taskId}
                          </span>
                          {task.isCritical ? (
                            <span className="px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded">
                              Critical
                            </span>
                          ) : null}
                        </div>
                        {task.description ? (
                          <p className="text-xs text-gray-500 truncate">{task.description}</p>
                        ) : null}
                      </div>

                      {/* Progress */}
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="w-20">
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            {(() => {
                              const incompleteBarColor = task.isCritical
                                ? 'bg-red-500'
                                : 'bg-blue-500';
                              const barColorClass =
                                task.percentComplete >= 100 ? 'bg-green-500' : incompleteBarColor;
                              return (
                                <div
                                  className={clsx(
                                    'h-full rounded-full transition-all',
                                    barColorClass
                                  )}
                                  style={{ width: `${task.percentComplete}%` }}
                                />
                              );
                            })()}
                          </div>
                        </div>
                        {(() => {
                          const incompleteLabelColor = task.isCritical
                            ? 'text-red-600'
                            : 'text-gray-600';
                          const labelColorClass =
                            task.percentComplete >= 100 ? 'text-green-600' : incompleteLabelColor;
                          return (
                            <span
                              className={clsx(
                                'text-sm font-medium w-12 text-right',
                                labelColorClass
                              )}
                            >
                              {task.percentComplete}%
                            </span>
                          );
                        })()}
                      </div>

                      {/* Dates */}
                      <div className="text-xs text-gray-400 flex-shrink-0">
                        {formatDate(new Date(task.earlyStart))}
                      </div>

                      <Icon name="chevron_right" size="sm" className="text-gray-400" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Icon name="event_busy" size="xl" className="text-gray-300 mb-2" />
                  <p>No tasks scheduled for this period</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
