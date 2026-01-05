'use client';

import { useState } from 'react';
import { Button } from '@intelliflow/ui';

interface ExportReportButtonProps {
  className?: string;
}

export function ExportReportButton({ className }: ExportReportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);

    try {
      // Dynamically import jsPDF to enable code splitting
      const { default: jsPDF } = await import('jspdf');

      // Fetch all compliance data in parallel
      const [risksRes, timelineRes] = await Promise.all([
        fetch('/api/compliance/risks'),
        fetch('/api/compliance/timeline'),
      ]);

      const risksData = await risksRes.json();
      const timelineData = await timelineRes.json();

      // Create PDF document
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      let yPos = 20;

      // Helper function to add a new page if needed
      const checkNewPage = (requiredSpace: number) => {
        if (yPos + requiredSpace > 280) {
          doc.addPage();
          yPos = 20;
        }
      };

      // Title
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('Compliance Report', pageWidth / 2, yPos, { align: 'center' });
      yPos += 10;

      // Generated date
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(128, 128, 128);
      doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, yPos, { align: 'center' });
      yPos += 15;

      // Reset text color
      doc.setTextColor(0, 0, 0);

      // Compliance Standards Section
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Compliance Standards Overview', 14, yPos);
      yPos += 10;

      const standards = [
        { name: 'ISO 27001', score: 92, status: 'Compliant', controls: '104/114' },
        { name: 'ISO 42001', score: 45, status: 'Critical', controls: '5/12' },
        { name: 'ISO 14001', score: 78, status: 'Attention', controls: '6/8' },
        { name: 'GDPR', score: 98, status: 'Compliant', controls: '12/12' },
        { name: 'SOC 2', score: 89, status: 'Compliant', controls: '8/10' },
        { name: 'OWASP', score: 96, status: 'Compliant', controls: '9/10' },
      ];

      // Table header
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Standard', 14, yPos);
      doc.text('Score', 60, yPos);
      doc.text('Status', 90, yPos);
      doc.text('Controls', 130, yPos);
      yPos += 2;

      // Table line
      doc.setDrawColor(200, 200, 200);
      doc.line(14, yPos, 180, yPos);
      yPos += 5;

      // Table rows
      doc.setFont('helvetica', 'normal');
      for (const standard of standards) {
        doc.text(standard.name, 14, yPos);
        doc.text(`${standard.score}%`, 60, yPos);

        // Color-coded status
        if (standard.status === 'Compliant') {
          doc.setTextColor(16, 185, 129); // emerald
        } else if (standard.status === 'Critical') {
          doc.setTextColor(239, 68, 68); // red
        } else {
          doc.setTextColor(245, 158, 11); // amber
        }
        doc.text(standard.status, 90, yPos);
        doc.setTextColor(0, 0, 0);

        doc.text(standard.controls, 130, yPos);
        yPos += 7;
      }

      yPos += 10;

      // Risk Summary Section
      checkNewPage(60);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Risk Summary', 14, yPos);
      yPos += 10;

      if (risksData.success && risksData.data) {
        const { summary, risks } = risksData.data;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Total Risks: ${summary.total}`, 14, yPos);
        yPos += 6;
        doc.text(`Accepted: ${summary.byStatus.accepted}`, 14, yPos);
        doc.text(`Mitigated: ${summary.byStatus.mitigated}`, 60, yPos);
        doc.text(`Requires Action: ${summary.byStatus.requires_action}`, 110, yPos);
        yPos += 10;

        // Risk Heat Map Summary
        doc.setFont('helvetica', 'bold');
        doc.text('Risk Distribution:', 14, yPos);
        yPos += 6;
        doc.setFont('helvetica', 'normal');
        doc.text(`High Probability: ${summary.byProbability.high}`, 14, yPos);
        doc.text(`High Impact: ${summary.byImpact.high}`, 80, yPos);
        yPos += 6;
        doc.text(`Medium Probability: ${summary.byProbability.medium}`, 14, yPos);
        doc.text(`Medium Impact: ${summary.byImpact.medium}`, 80, yPos);
        yPos += 6;
        doc.text(`Low Probability: ${summary.byProbability.low}`, 14, yPos);
        doc.text(`Low Impact: ${summary.byImpact.low}`, 80, yPos);
        yPos += 10;

        // Risks requiring action
        const requiresAction = risks.filter((r: { status: string }) => r.status === 'requires_action');
        if (requiresAction.length > 0) {
          checkNewPage(30 + requiresAction.length * 15);
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(239, 68, 68);
          doc.text('Risks Requiring Action:', 14, yPos);
          doc.setTextColor(0, 0, 0);
          yPos += 8;

          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          for (const risk of requiresAction) {
            checkNewPage(15);
            doc.text(`• ${risk.id}: ${risk.title}`, 18, yPos);
            yPos += 5;
            if (risk.mitigationPlan) {
              doc.setTextColor(100, 100, 100);
              doc.text(`  Plan: ${risk.mitigationPlan.substring(0, 80)}...`, 22, yPos);
              doc.setTextColor(0, 0, 0);
              yPos += 5;
            }
            yPos += 3;
          }
        }
      }

      yPos += 5;

      // Upcoming Events Section
      checkNewPage(50);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Upcoming Compliance Events', 14, yPos);
      yPos += 10;

      if (timelineData.success && timelineData.data) {
        const upcomingEvents = timelineData.data.events
          .filter((e: { status: string; date: string }) => e.status === 'scheduled' && new Date(e.date) >= new Date())
          .sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date))
          .slice(0, 10);

        if (upcomingEvents.length > 0) {
          doc.setFontSize(10);
          doc.setFont('helvetica', 'normal');

          for (const event of upcomingEvents) {
            checkNewPage(15);
            const eventDate = new Date(event.date).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });
            doc.text(`${eventDate}`, 14, yPos);
            doc.text(`${event.title}`, 50, yPos);
            doc.setTextColor(100, 100, 100);
            doc.text(`(${event.standard})`, 150, yPos);
            doc.setTextColor(0, 0, 0);
            yPos += 7;
          }
        } else {
          doc.setFontSize(10);
          doc.setFont('helvetica', 'normal');
          doc.text('No upcoming events scheduled.', 14, yPos);
        }
      }

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `IntelliFlow CRM - Compliance Report - Page ${i} of ${pageCount}`,
          pageWidth / 2,
          290,
          { align: 'center' }
        );
      }

      // Save the PDF
      doc.save(`compliance-report-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Failed to export report:', error);
      alert('Failed to generate PDF report. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button
      onClick={handleExport}
      disabled={exporting}
      className={className}
    >
      <span className="material-symbols-outlined text-lg mr-2">
        {exporting ? 'progress_activity' : 'download'}
      </span>
      {exporting ? 'Exporting...' : 'Export Report'}
    </Button>
  );
}
