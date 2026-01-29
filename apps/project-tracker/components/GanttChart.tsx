'use client';

import React, { useState, useMemo, useRef, useCallback } from 'react';
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

function formatDate(date: Date): string {
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
      end: weekEnd > end ? end : weekEnd,
      label: `W${Math.ceil((current.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1}`,
    });

    current.setDate(current.getDate() + 7);
  }

  return weeks;
}

export default function GanttChart({
  tasks,
  sprintStart,
  sprintEnd,
  onTaskClick,
  className,
}: GanttChartProps) {
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('week');
  const [showDependencies, setShowDependencies] = useState(true);
  const [showFloat, setShowFloat] = useState(true);
  const [hoveredTask, setHoveredTask] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const startDate = useMemo(() => new Date(sprintStart), [sprintStart]);
  const endDate = useMemo(() => new Date(sprintEnd), [sprintEnd]);

  // Calculate chart dimensions based on zoom level
  const totalDays = useMemo(() => getDaysBetween(startDate, endDate) + 1, [startDate, endDate]);
  const dayWidth = useMemo(() => {
    switch (zoomLevel) {
      case 'day': return 40;
      case 'week': return 20;
      case 'sprint': return 10;
      default: return 20;
    }
  }, [zoomLevel]);
  const chartWidth = useMemo(() => totalDays * dayWidth, [totalDays, dayWidth]);
  const chartHeight = useMemo(() => tasks.length * ROW_HEIGHT + HEADER_HEIGHT, [tasks.length]);

  // Get position for a date - memoized to depend on dayWidth
  const getXPosition = useCallback((date: Date): number => {
    const daysDiff = getDaysBetween(startDate, date);
    return daysDiff * dayWidth;
  }, [startDate, dayWidth]);

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
      const y = HEADER_HEIGHT + index * ROW_HEIGHT + (ROW_HEIGHT - TASK_BAR_HEIGHT) / 2;
      const width = Math.max(
        dayWidth,
        getXPosition(new Date(task.earlyFinish)) - x
      );
      positions.set(task.taskId, { x: LEFT_PANEL_WIDTH + x, y, width });
    });
    return positions;
  }, [sortedTasks, dayWidth, getXPosition]);

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
      // Sprint view - show months
      const months: { label: string; x: number; width: number }[] = [];
      let currentMonth = startDate.getMonth();
      let monthStart = new Date(startDate);

      for (const date of getDateRange(startDate, endDate)) {
        if (date.getMonth() !== currentMonth) {
          months.push({
            label: monthStart.toLocaleDateString('en-GB', { month: 'short' }),
            x: getXPosition(monthStart),
            width: getXPosition(date) - getXPosition(monthStart),
          });
          monthStart = new Date(date);
          currentMonth = date.getMonth();
        }
      }
      // Push last month
      months.push({
        label: monthStart.toLocaleDateString('en-GB', { month: 'short' }),
        x: getXPosition(monthStart),
        width: chartWidth - getXPosition(monthStart),
      });

      return months;
    }
  }, [zoomLevel, startDate, endDate, dayWidth, chartWidth, getXPosition]);

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
              strokeDasharray={hoveredTask === task.taskId || hoveredTask === depId ? 'none' : '4,2'}
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
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showDependencies}
                onChange={(e) => setShowDependencies(e.target.checked)}
                className="rounded border-gray-300"
              />
              Dependencies
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showFloat}
                onChange={(e) => setShowFloat(e.target.checked)}
                className="rounded border-gray-300"
              />
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
            {showFloat && (
              <div className="flex items-center gap-1">
                <div className="w-4 h-3 bg-gray-300 rounded" />
                <span className="text-gray-500">Float</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chart container */}
      <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 300px)' }}>
        <div className="flex">
          {/* Left panel - Task names */}
          <div
            className="sticky left-0 z-10 bg-white border-r border-gray-200"
            style={{ width: LEFT_PANEL_WIDTH }}
          >
            {/* Header */}
            <div
              className="border-b border-gray-200 px-3 flex items-center font-medium text-sm text-gray-700 bg-gray-50"
              style={{ height: HEADER_HEIGHT }}
            >
              Task
            </div>

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
              >
                {task.isCritical && (
                  <Icon name="warning" size="xs" className="text-red-500 flex-shrink-0" />
                )}
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
            <svg
              ref={svgRef}
              width={chartWidth + LEFT_PANEL_WIDTH}
              height={chartHeight}
              className="block"
            >
              {/* Time scale header */}
              <g>
                <rect
                  x={0}
                  y={0}
                  width={chartWidth}
                  height={HEADER_HEIGHT}
                  fill="#f9fafb"
                />
                {timeHeaders.map((header, index) => (
                  <g key={index}>
                    <rect
                      x={header.x}
                      y={0}
                      width={header.width}
                      height={HEADER_HEIGHT}
                      fill="none"
                      stroke="#e5e7eb"
                    />
                    <text
                      x={header.x + header.width / 2}
                      y={HEADER_HEIGHT / 2 + 5}
                      textAnchor="middle"
                      className="text-xs fill-gray-600"
                    >
                      {header.label}
                    </text>
                  </g>
                ))}
              </g>

              {/* Grid lines */}
              <g>
                {timeHeaders.map((header, index) => (
                  <line
                    key={index}
                    x1={header.x}
                    y1={HEADER_HEIGHT}
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
                      y1={HEADER_HEIGHT}
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
                const y = HEADER_HEIGHT + index * ROW_HEIGHT + (ROW_HEIGHT - TASK_BAR_HEIGHT) / 2;
                const startX = getXPosition(new Date(task.earlyStart));
                const endX = getXPosition(new Date(task.earlyFinish));
                const width = Math.max(dayWidth, endX - startX);

                // Float bar (extends beyond task bar)
                const floatWidth = showFloat && task.totalFloat > 0
                  ? Math.min(task.totalFloat / 60 * (dayWidth / 8), chartWidth - startX - width)
                  : 0;

                // Progress fill
                const progressWidth = (width * task.percentComplete) / 100;

                // Determine bar color
                const barColor = task.percentComplete >= 100
                  ? '#22c55e' // green
                  : task.isCritical
                    ? '#ef4444' // red
                    : '#3b82f6'; // blue

                return (
                  <g
                    key={task.taskId}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredTask(task.taskId)}
                    onMouseLeave={() => setHoveredTask(null)}
                    onClick={() => onTaskClick?.(task.taskId)}
                  >
                    {/* Row background on hover */}
                    {hoveredTask === task.taskId && (
                      <rect
                        x={0}
                        y={HEADER_HEIGHT + index * ROW_HEIGHT}
                        width={chartWidth}
                        height={ROW_HEIGHT}
                        fill="#eff6ff"
                      />
                    )}

                    {/* Float bar */}
                    {floatWidth > 0 && (
                      <rect
                        x={startX + width}
                        y={y + 4}
                        width={floatWidth}
                        height={TASK_BAR_HEIGHT - 8}
                        rx={2}
                        fill="#e5e7eb"
                      />
                    )}

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
                    {width > 40 && (
                      <text
                        x={startX + width / 2}
                        y={y + TASK_BAR_HEIGHT / 2 + 4}
                        textAnchor="middle"
                        className="text-xs font-medium"
                        fill={task.percentComplete >= 50 ? 'white' : barColor}
                      >
                        {task.percentComplete}%
                      </text>
                    )}
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
    </div>
  );
}
