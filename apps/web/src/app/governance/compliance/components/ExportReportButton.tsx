'use client';

import { useState } from 'react';
import { Button } from '@intelliflow/ui';
import { useTimezoneContext } from '@/providers/TimezoneProvider';

interface ExportReportButtonProps {
  className?: string;
}

type JsPDFDoc = {
  internal: { pageSize: { getWidth: () => number } };
  setFontSize: (size: number) => void;
  setFont: (family: string, style: string) => void;
  setTextColor: (r: number, g: number, b: number) => void;
  setDrawColor: (r: number, g: number, b: number) => void;
  text: (text: string, x: number, y: number, options?: { align: string }) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  addPage: () => void;
  setPage: (page: number) => void;
  getNumberOfPages: () => number;
  save: (filename: string) => void;
};

function applyStatusColor(doc: JsPDFDoc, status: string): void {
  if (status === 'Compliant') {
    doc.setTextColor(16, 185, 129); // emerald
  } else if (status === 'Critical') {
    doc.setTextColor(239, 68, 68); // red
  } else {
    doc.setTextColor(245, 158, 11); // amber
  }
}

function makePageChecker(doc: JsPDFDoc, getYPos: () => number, setYPos: (y: number) => void) {
  return (requiredSpace: number) => {
    if (getYPos() + requiredSpace > 280) {
      doc.addPage();
      setYPos(20);
    }
  };
}

interface RiskEntry {
  id: string;
  title: string;
  status: string;
  mitigationPlan?: string;
}

function addRisksSection(
  doc: JsPDFDoc,
  risksData: { success: boolean; data?: { summary: Record<string, unknown>; risks: RiskEntry[] } },
  yPosRef: { value: number },
  checkNewPage: (space: number) => void
): void {
  if (!risksData.success || !risksData.data) return;
  const { summary, risks } = risksData.data as {
    summary: {
      total: number;
      byStatus: { accepted: number; mitigated: number; requires_action: number };
      byProbability: { high: number; medium: number; low: number };
      byImpact: { high: number; medium: number; low: number };
    };
    risks: RiskEntry[];
  };

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total Risks: ${summary.total}`, 14, yPosRef.value);
  yPosRef.value += 6;
  doc.text(`Accepted: ${summary.byStatus.accepted}`, 14, yPosRef.value);
  doc.text(`Mitigated: ${summary.byStatus.mitigated}`, 60, yPosRef.value);
  doc.text(`Requires Action: ${summary.byStatus.requires_action}`, 110, yPosRef.value);
  yPosRef.value += 10;

  doc.setFont('helvetica', 'bold');
  doc.text('Risk Distribution:', 14, yPosRef.value);
  yPosRef.value += 6;
  doc.setFont('helvetica', 'normal');
  doc.text(`High Probability: ${summary.byProbability.high}`, 14, yPosRef.value);
  doc.text(`High Impact: ${summary.byImpact.high}`, 80, yPosRef.value);
  yPosRef.value += 6;
  doc.text(`Medium Probability: ${summary.byProbability.medium}`, 14, yPosRef.value);
  doc.text(`Medium Impact: ${summary.byImpact.medium}`, 80, yPosRef.value);
  yPosRef.value += 6;
  doc.text(`Low Probability: ${summary.byProbability.low}`, 14, yPosRef.value);
  doc.text(`Low Impact: ${summary.byImpact.low}`, 80, yPosRef.value);
  yPosRef.value += 10;

  const requiresAction = risks.filter((r) => r.status === 'requires_action');
  if (requiresAction.length === 0) return;

  checkNewPage(30 + requiresAction.length * 15);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(239, 68, 68);
  doc.text('Risks Requiring Action:', 14, yPosRef.value);
  doc.setTextColor(0, 0, 0);
  yPosRef.value += 8;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  for (const risk of requiresAction) {
    checkNewPage(15);
    doc.text(`• ${risk.id}: ${risk.title}`, 18, yPosRef.value);
    yPosRef.value += 5;
    if (risk.mitigationPlan) {
      doc.setTextColor(100, 100, 100);
      doc.text(`  Plan: ${risk.mitigationPlan.substring(0, 80)}...`, 22, yPosRef.value);
      doc.setTextColor(0, 0, 0);
      yPosRef.value += 5;
    }
    yPosRef.value += 3;
  }
}

interface TimelineEvent {
  status: string;
  date: string;
  title: string;
  standard: string;
}

function addTimelineSection(
  doc: JsPDFDoc,
  timelineData: { success: boolean; data?: { events: TimelineEvent[] } },
  yPosRef: { value: number },
  checkNewPage: (space: number) => void,
  timezone: string = 'UTC'
): void {
  if (!timelineData.success || !timelineData.data) return;

  const upcomingEvents = timelineData.data.events
    .filter((e) => e.status === 'scheduled' && new Date(e.date) >= new Date())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 10);

  if (upcomingEvents.length === 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('No upcoming events scheduled.', 14, yPosRef.value);
    return;
  }

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  for (const event of upcomingEvents) {
    checkNewPage(15);
    const eventDate = new Date(event.date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: timezone,
    });
    doc.text(`${eventDate}`, 14, yPosRef.value);
    doc.text(`${event.title}`, 50, yPosRef.value);
    doc.setTextColor(100, 100, 100);
    doc.text(`(${event.standard})`, 150, yPosRef.value);
    doc.setTextColor(0, 0, 0);
    yPosRef.value += 7;
  }
}

export function ExportReportButton({ className }: Readonly<ExportReportButtonProps>) {
  const { timezone } = useTimezoneContext();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const [risksRes, timelineRes] = await Promise.all([
        fetch('/api/compliance/risks'),
        fetch('/api/compliance/timeline'),
      ]);
      const risksData = await risksRes.json();
      const timelineData = await timelineRes.json();

      // jsPDF class structurally satisfies JsPDFDoc (local subset type)
      const doc: JsPDFDoc = new jsPDF() as JsPDFDoc;
      const pageWidth = doc.internal.pageSize.getWidth();
      const yPosRef = { value: 20 };
      const checkNewPage = makePageChecker(doc, () => yPosRef.value, (y) => { yPosRef.value = y; });

      // Title
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('Compliance Report', pageWidth / 2, yPosRef.value, { align: 'center' });
      yPosRef.value += 10;

      // Generated date
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(128, 128, 128);
      doc.text(`Generated: ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: timezone })}`, pageWidth / 2, yPosRef.value, { align: 'center' });
      yPosRef.value += 15;
      doc.setTextColor(0, 0, 0);

      // Compliance Standards Section
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Compliance Standards Overview', 14, yPosRef.value);
      yPosRef.value += 10;

      const standards = [
        { name: 'ISO 27001', score: 92, status: 'Compliant', controls: '104/114' },
        { name: 'ISO 42001', score: 45, status: 'Critical', controls: '5/12' },
        { name: 'ISO 14001', score: 78, status: 'Attention', controls: '6/8' },
        { name: 'GDPR', score: 98, status: 'Compliant', controls: '12/12' },
        { name: 'SOC 2', score: 89, status: 'Compliant', controls: '8/10' },
        { name: 'OWASP', score: 96, status: 'Compliant', controls: '9/10' },
      ];

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Standard', 14, yPosRef.value);
      doc.text('Score', 60, yPosRef.value);
      doc.text('Status', 90, yPosRef.value);
      doc.text('Controls', 130, yPosRef.value);
      yPosRef.value += 2;
      doc.setDrawColor(200, 200, 200);
      doc.line(14, yPosRef.value, 180, yPosRef.value);
      yPosRef.value += 5;

      doc.setFont('helvetica', 'normal');
      for (const standard of standards) {
        doc.text(standard.name, 14, yPosRef.value);
        doc.text(`${standard.score}%`, 60, yPosRef.value);
        applyStatusColor(doc, standard.status);
        doc.text(standard.status, 90, yPosRef.value);
        doc.setTextColor(0, 0, 0);
        doc.text(standard.controls, 130, yPosRef.value);
        yPosRef.value += 7;
      }
      yPosRef.value += 10;

      // Risk Summary Section
      checkNewPage(60);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Risk Summary', 14, yPosRef.value);
      yPosRef.value += 10;
      addRisksSection(doc, risksData, yPosRef, checkNewPage);
      yPosRef.value += 5;

      // Upcoming Events Section
      checkNewPage(50);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Upcoming Compliance Events', 14, yPosRef.value);
      yPosRef.value += 10;
      addTimelineSection(doc, timelineData, yPosRef, checkNewPage, timezone);

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`IntelliFlow CRM - Compliance Report - Page ${i} of ${pageCount}`, pageWidth / 2, 290, { align: 'center' });
      }

      doc.save(`compliance-report-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Failed to export report:', error);
      alert('Failed to generate PDF report. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button onClick={handleExport} disabled={exporting} className={className}>
      <span className="material-symbols-outlined text-lg mr-2">
        {exporting ? 'progress_activity' : 'download'}
      </span>
      {exporting ? 'Exporting...' : 'Export Report'}
    </Button>
  );
}
