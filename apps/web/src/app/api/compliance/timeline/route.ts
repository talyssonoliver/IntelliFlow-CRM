import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import type { ComplianceEvent, ComplianceTimelineResponse } from '../types';

// Find project root by looking for package.json
function findProjectRoot(startDir: string): string {
  let currentDir = startDir;
  while (currentDir !== path.parse(currentDir).root) {
    if (fs.existsSync(path.join(currentDir, 'package.json'))) {
      // Check if this is the monorepo root (has turbo.json or pnpm-workspace.yaml)
      if (
        fs.existsSync(path.join(currentDir, 'turbo.json')) ||
        fs.existsSync(path.join(currentDir, 'pnpm-workspace.yaml'))
      ) {
        return currentDir;
      }
    }
    currentDir = path.dirname(currentDir);
  }
  return startDir;
}

function loadCalendarData(): ComplianceEvent[] {
  const projectRoot = findProjectRoot(process.cwd());
  const calendarPath = path.join(projectRoot, 'artifacts', 'misc', 'compliance-calendar.json');

  try {
    if (fs.existsSync(calendarPath)) {
      const content = fs.readFileSync(calendarPath, 'utf-8');
      const data = JSON.parse(content);
      return data.events || [];
    }
  } catch (error) {
    console.error('Failed to load compliance calendar:', error);
  }

  return [];
}

function filterEventsByMonth(events: ComplianceEvent[], month: string): ComplianceEvent[] {
  // month format: "2026-01" or "2026-02"
  return events.filter((event) => event.date.startsWith(month));
}

function filterEventsByQuarter(events: ComplianceEvent[], quarter: string): ComplianceEvent[] {
  // quarter format: "Q1-2026" or "Q2-2026"
  const match = quarter.match(/Q(\d)-(\d{4})/);
  if (!match) return events;

  const q = parseInt(match[1], 10);
  const year = match[2];

  const startMonth = (q - 1) * 3 + 1;
  const months = [startMonth, startMonth + 1, startMonth + 2].map((m) =>
    `${year}-${m.toString().padStart(2, '0')}`
  );

  return events.filter((event) => months.some((month) => event.date.startsWith(month)));
}

function getUpcomingEvents(events: ComplianceEvent[]): ComplianceEvent[] {
  const today = new Date().toISOString().split('T')[0];
  return events
    .filter((event) => event.date >= today && event.status === 'scheduled')
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const quarter = searchParams.get('quarter');

    let events = loadCalendarData();

    // Apply filters
    if (month) {
      events = filterEventsByMonth(events, month);
    } else if (quarter) {
      events = filterEventsByQuarter(events, quarter);
    }

    // Sort by date
    events.sort((a, b) => a.date.localeCompare(b.date));

    // Get upcoming count from all events (not filtered)
    const allEvents = loadCalendarData();
    const upcomingEvents = getUpcomingEvents(allEvents);

    const currentMonth = month || new Date().toISOString().slice(0, 7);

    const response: ComplianceTimelineResponse = {
      events,
      currentMonth,
      upcomingCount: upcomingEvents.length,
    };

    return NextResponse.json(
      { success: true, data: response },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Timeline API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load timeline data' },
      { status: 500 }
    );
  }
}
