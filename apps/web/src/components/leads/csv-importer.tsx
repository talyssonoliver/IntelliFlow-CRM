'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Card, Skeleton } from '@intelliflow/ui';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { PageHeader } from '@/components/shared';
import { invalidateLeadsCache } from '@/app/leads/(list)/actions';
import { revalidateLeadCaches } from '@/app/leads/actions';
import {
  LEAD_IMPORT_FIELDS,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  autoDetectMapping,
  buildRowResults,
  parseCsv,
  type ColumnMapping,
  type LeadImportField,
  type ParsedCsv,
  type RowResult,
} from '@/lib/leads/field-mapper';

/**
 * Import Leads (PG-063). Client-only CSV importer: select → map → import. The
 * parse / sanitise / validate logic lives in `lib/leads/field-mapper.ts` (pure,
 * unit-tested); this component owns the file read, the mapping UI, the preview,
 * and the per-row `api.lead.create` calls. The RAW string record is sent to the
 * mutation (the server re-runs the same schema), so no Value Object is
 * serialised. Invalid rows are surfaced with reasons — never silently dropped.
 */

const PREVIEW_LIMIT = 10;
const INPUT_CLASS =
  'w-full px-3 h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#137fec] focus:border-transparent outline-none transition-all';

type ImporterStep = 'select' | 'map' | 'result';

interface ImportResult {
  imported: number;
  /** Rows that failed server-side, with the spreadsheet row number + reason. */
  failures: Array<{ row: number; reason: string }>;
  /** Rows excluded by client validation, with the row number + reasons. */
  skipped: Array<{ row: number; errors: string[] }>;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Unknown error';
}

// ---------------------------------------------------------------------------
// Step 1 — file select
// ---------------------------------------------------------------------------

function FileSelect({
  fileError,
  onFile,
}: Readonly<{ fileError: string | null; onFile: (file: File) => void }>) {
  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">Upload a CSV</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Up to {MAX_IMPORT_ROWS} rows and {MAX_IMPORT_FILE_BYTES / (1024 * 1024)} MB. A header row is
        required; you&apos;ll map columns to lead fields next.
      </p>
      <label
        htmlFor="lead-csv-file"
        className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 p-8 cursor-pointer hover:border-[#137fec] transition-colors"
      >
        <span aria-hidden="true" className="material-symbols-outlined !text-[32px] text-slate-400">
          upload_file
        </span>
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Choose a .csv file
        </span>
        <input
          id="lead-csv-file"
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
          }}
        />
      </label>
      {fileError && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {fileError}
        </p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — column mapping + preview
// ---------------------------------------------------------------------------

function MappingControls({
  headers,
  mapping,
  onChange,
}: Readonly<{
  headers: string[];
  mapping: ColumnMapping;
  onChange: (field: LeadImportField, columnIndex: number | undefined) => void;
}>) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {LEAD_IMPORT_FIELDS.map((field) => (
        <div key={field.key}>
          <label
            htmlFor={`map-${field.key}`}
            className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            {field.label}
            {field.required && <span className="text-red-500"> *</span>}
          </label>
          <select
            id={`map-${field.key}`}
            className={INPUT_CLASS}
            value={mapping[field.key] ?? ''}
            onChange={(e) =>
              onChange(field.key, e.target.value === '' ? undefined : Number(e.target.value))
            }
          >
            <option value="">— Skip —</option>
            {headers.map((header, index) => (
              <option key={`${field.key}-${index}`} value={index}>
                {header || `Column ${index + 1}`}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

function PreviewRow({ result }: Readonly<{ result: RowResult }>) {
  const { record, validation } = result;
  return (
    <tr className="border-t border-slate-100 dark:border-slate-800 align-top">
      <td className="py-2 pr-3 text-slate-500">{result.line}</td>
      <td className="py-2 pr-3 text-slate-900 dark:text-white">{record.email || '—'}</td>
      <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">
        {[record.firstName, record.lastName].filter(Boolean).join(' ') || '—'}
      </td>
      <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{record.company || '—'}</td>
      <td className="py-2">
        {validation.ok ? (
          <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400">
            <span aria-hidden="true" className="material-symbols-outlined !text-[16px]">
              check_circle
            </span>{' '}
            Valid
          </span>
        ) : (
          <span className="text-red-600 dark:text-red-400">{validation.errors.join('; ')}</span>
        )}
      </td>
    </tr>
  );
}

function MapStep({
  parsed,
  mapping,
  rowResults,
  validCount,
  invalidCount,
  importing,
  progress,
  onChangeMapping,
  onImport,
  onCancel,
}: Readonly<{
  parsed: ParsedCsv;
  mapping: ColumnMapping;
  rowResults: RowResult[];
  validCount: number;
  invalidCount: number;
  importing: boolean;
  progress: { done: number; total: number };
  onChangeMapping: (field: LeadImportField, columnIndex: number | undefined) => void;
  onImport: () => void;
  onCancel: () => void;
}>) {
  const emailMapped = mapping.email !== undefined;
  const canImport = emailMapped && validCount > 0 && !importing;
  // Move focus to the step heading on entry so a keyboard/AT user is not stranded
  // on a now-unmounted control after the file-select → map transition.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-base font-semibold text-slate-900 dark:text-white mb-4 outline-none"
        >
          Map columns to lead fields
        </h2>
        <MappingControls headers={parsed.headers} mapping={mapping} onChange={onChangeMapping} />
        {!emailMapped && (
          <p role="alert" className="mt-3 text-sm text-amber-600 dark:text-amber-400">
            Map a column to Email to enable import.
          </p>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Preview &amp; validation
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            <span className="text-green-700 dark:text-green-400 font-semibold">{validCount}</span>{' '}
            valid,{' '}
            <span className="text-red-600 dark:text-red-400 font-semibold">{invalidCount}</span>{' '}
            invalid
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">
              First {PREVIEW_LIMIT} rows with mapped values and per-row validation
            </caption>
            <thead>
              <tr className="text-left text-slate-500">
                <th scope="col" className="py-1 pr-3 font-medium">
                  Row
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Email
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Name
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Company
                </th>
                <th scope="col" className="py-1 font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {rowResults.slice(0, PREVIEW_LIMIT).map((result) => (
                <PreviewRow key={result.index} result={result} />
              ))}
            </tbody>
          </table>
        </div>
        {rowResults.length > PREVIEW_LIMIT && (
          <p className="mt-2 text-xs text-slate-400">
            Showing first {PREVIEW_LIMIT} of {rowResults.length} rows.
          </p>
        )}
      </Card>

      {importing && (
        <output aria-live="polite" className="text-sm text-slate-600 dark:text-slate-300">
          {`Importing row ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`}
        </output>
      )}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={importing}
          className="px-4 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onImport}
          disabled={!canImport}
          className="px-6 h-10 rounded-lg bg-[#137fec] text-white text-sm font-semibold hover:bg-blue-600 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {importing
            ? 'Importing…'
            : `Import ${validCount} valid lead${validCount === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — result
// ---------------------------------------------------------------------------

function ResultStep({ result, onReset }: Readonly<{ result: ImportResult; onReset: () => void }>) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <output aria-live="polite" className="block">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-base font-semibold text-slate-900 dark:text-white mb-2 outline-none"
          >
            Import complete
          </h2>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            <span className="font-semibold text-green-700 dark:text-green-400">
              {result.imported}
            </span>{' '}
            lead{result.imported === 1 ? '' : 's'} imported
            {result.skipped.length > 0 && ` · ${result.skipped.length} skipped (invalid)`}
            {result.failures.length > 0 && ` · ${result.failures.length} failed`}.
          </p>
        </output>

        {result.skipped.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
              Skipped rows (not imported)
            </h3>
            <ul className="text-sm text-red-600 dark:text-red-400 list-disc pl-5 space-y-1">
              {result.skipped.map((s) => (
                <li key={`skip-${s.row}`}>
                  Row {s.row}: {s.errors.join('; ')}
                </li>
              ))}
            </ul>
          </div>
        )}

        {result.failures.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
              Failed rows (server error)
            </h3>
            <ul className="text-sm text-red-600 dark:text-red-400 list-disc pl-5 space-y-1">
              {result.failures.map((f) => (
                <li key={`fail-${f.row}`}>
                  Row {f.row}: {f.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onReset}
          className="px-4 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          Import another file
        </button>
        <Link
          href="/leads"
          className="px-6 h-10 inline-flex items-center rounded-lg bg-[#137fec] text-white text-sm font-semibold hover:bg-blue-600 transition-colors shadow-sm"
        >
          Back to Leads
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export function CsvImporter() {
  const { isLoading: authLoading, isAuthenticated, user } = useRequireAuth();
  const utils = api.useUtils();
  const createLead = api.lead.create.useMutation();

  const [step, setStep] = useState<ImporterStep>('select');
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [fileError, setFileError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<ImportResult | null>(null);

  const rowResults = useMemo(
    () => (parsed ? buildRowResults(parsed, mapping) : []),
    [parsed, mapping]
  );
  const validCount = useMemo(() => rowResults.filter((r) => r.validation.ok).length, [rowResults]);
  const invalidCount = rowResults.length - validCount;

  const handleFile = async (file: File) => {
    setFileError(null);
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setFileError(
        `File is too large (max ${MAX_IMPORT_FILE_BYTES / (1024 * 1024)} MB). Split your file.`
      );
      return;
    }
    const text = await file.text();
    const nextParsed = parseCsv(text);
    if (nextParsed.headers.length === 0 || nextParsed.rows.length === 0) {
      setFileError('No data rows found. The file needs a header row and at least one data row.');
      return;
    }
    if (nextParsed.rows.length > MAX_IMPORT_ROWS) {
      setFileError(
        `Too many rows (${nextParsed.rows.length}; max ${MAX_IMPORT_ROWS}). Split your file — rows are never truncated.`
      );
      return;
    }
    setParsed(nextParsed);
    setMapping(autoDetectMapping(nextParsed.headers));
    setStep('map');
  };

  const handleChangeMapping = (field: LeadImportField, columnIndex: number | undefined) => {
    setMapping((prev) => {
      const next = { ...prev };
      if (columnIndex === undefined) delete next[field];
      else next[field] = columnIndex;
      return next;
    });
  };

  const runImport = async () => {
    const toImport = rowResults.filter((r) => r.validation.ok);
    setImporting(true);
    setProgress({ done: 0, total: toImport.length });
    let imported = 0;
    const failures: ImportResult['failures'] = [];
    for (let i = 0; i < toImport.length; i++) {
      const current = toImport[i];
      try {
        // Send the RAW record; the server re-validates with the same schema and
        // applies the phone→PhoneNumber transform. A per-row failure does not
        // abort the run — remaining rows are still attempted.
        await createLead.mutateAsync(
          current.record as Parameters<typeof createLead.mutateAsync>[0]
        );
        imported++;
      } catch (error) {
        failures.push({ row: current.line, reason: errorMessage(error) });
      }
      setProgress({ done: i + 1, total: toImport.length });
    }
    const skipped = rowResults
      .filter((r) => !r.validation.ok)
      .map((r) => ({
        row: r.line,
        errors: r.validation.ok ? [] : r.validation.errors,
      }));
    // After at least one successful import, refresh the leads list + stats so the
    // imported rows are visible immediately (the list query has a 5-min staleTime
    // and the first page is server-cache-tagged). Mirrors lead-list.tsx's pattern.
    if (imported > 0) {
      utils.lead.list.invalidate();
      utils.lead.stats.invalidate();
      invalidateLeadsCache();
      if (user?.id) await revalidateLeadCaches(user.id);
    }
    setResult({ imported, failures, skipped });
    setImporting(false);
    setStep('result');
  };

  const reset = () => {
    setStep('select');
    setParsed(null);
    setMapping({});
    setFileError(null);
    setResult(null);
    setProgress({ done: 0, total: 0 });
  };

  if (authLoading || !isAuthenticated) {
    return (
      <div className="flex flex-col gap-8 p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Leads', href: '/leads' },
          { label: 'Import' },
        ]}
        title="Import Leads"
        description="Upload a CSV, map its columns, and import valid leads."
      />
      {step === 'select' && <FileSelect fileError={fileError} onFile={handleFile} />}
      {step === 'map' && parsed && (
        <MapStep
          parsed={parsed}
          mapping={mapping}
          rowResults={rowResults}
          validCount={validCount}
          invalidCount={invalidCount}
          importing={importing}
          progress={progress}
          onChangeMapping={handleChangeMapping}
          onImport={runImport}
          onCancel={reset}
        />
      )}
      {step === 'result' && result && <ResultStep result={result} onReset={reset} />}
    </div>
  );
}

export default CsvImporter;
