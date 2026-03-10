'use client';

import { useState, useCallback, useRef, type ChangeEvent, type KeyboardEvent } from 'react';

export interface QuickLogAttachment {
  file: File;
  previewUrl?: string;
}

export interface QuickLogComposerProps {
  /** Placeholder text for the textarea */
  placeholder?: string;
  /** Called when the user submits. Receives note text + optional attachments */
  onSubmit: (note: string, attachments?: QuickLogAttachment[]) => void;
  /** Whether the submit action is in progress */
  isSubmitting?: boolean;
  /** Label for the submit button (default: "Log Activity") */
  submitLabel?: string;
  /** Label shown while submitting (default: "Logging...") */
  submittingLabel?: string;
  /** Max file size in MB (default: 10) */
  maxFileSizeMB?: number;
  /** Accepted file types (default: images, pdf, doc, txt) */
  acceptedTypes?: string;
}

const TOOLBAR_BTN =
  'p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors';
const TOOLBAR_BTN_ACTIVE =
  'p-1.5 text-[#137fec] bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded transition-colors';

function insertMarkdown(
  textarea: HTMLTextAreaElement,
  prefix: string,
  suffix: string,
  setNote: (fn: (prev: string) => string) => void
) {
  const { selectionStart, selectionEnd, value } = textarea;
  const selected = value.slice(selectionStart, selectionEnd);
  const replacement = `${prefix}${selected || 'text'}${suffix}`;

  setNote(() => value.slice(0, selectionStart) + replacement + value.slice(selectionEnd));

  // Restore cursor after React re-render
  requestAnimationFrame(() => {
    const cursorPos = selected
      ? selectionStart + replacement.length
      : selectionStart + prefix.length + 'text'.length;
    textarea.focus();
    textarea.setSelectionRange(
      selected ? selectionStart + prefix.length : selectionStart + prefix.length,
      selected ? selectionStart + prefix.length + selected.length : cursorPos
    );
  });
}

export function QuickLogComposer({
  placeholder = 'Log a note, call, or email...',
  onSubmit,
  isSubmitting = false,
  submitLabel = 'Log Activity',
  submittingLabel = 'Logging...',
  maxFileSizeMB = 10,
  acceptedTypes = 'image/*,.pdf,.doc,.docx,.txt,.csv',
}: QuickLogComposerProps) {
  const [note, setNote] = useState('');
  const [attachments, setAttachments] = useState<QuickLogAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = note.trim();
    if (!trimmed && attachments.length === 0) return;
    onSubmit(trimmed, attachments.length > 0 ? attachments : undefined);
    setNote('');
    setAttachments((prev) => {
      prev.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
      return [];
    });
  }, [note, attachments, onSubmit]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleBold = useCallback(() => {
    if (!textareaRef.current) return;
    insertMarkdown(textareaRef.current, '**', '**', setNote);
  }, []);

  const handleList = useCallback(() => {
    if (!textareaRef.current) return;
    const ta = textareaRef.current;
    const { selectionStart, value } = ta;
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const prefix = value.slice(lineStart, selectionStart).startsWith('- ') ? '' : '- ';
    if (prefix) {
      setNote(() => value.slice(0, lineStart) + '- ' + value.slice(lineStart));
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(selectionStart + 2, selectionStart + 2);
      });
    }
  }, []);

  const handleFileSelect = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      const maxBytes = maxFileSizeMB * 1024 * 1024;
      const newAttachments: QuickLogAttachment[] = [];

      for (const file of Array.from(files)) {
        if (file.size > maxBytes) continue;
        const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
        newAttachments.push({ file, previewUrl });
      }

      setAttachments((prev) => [...prev, ...newAttachments]);
      // Reset input so the same file can be re-selected
      e.target.value = '';
    },
    [maxFileSizeMB]
  );

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => {
      const removed = prev[index];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const hasContent = note.trim().length > 0 || attachments.length > 0;

  return (
    <div className="p-4 border-b border-slate-100 dark:border-slate-800">
      <div className="flex gap-3">
        <div className="pt-1">
          <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
            <span className="material-symbols-outlined !text-[20px]">edit_note</span>
          </div>
        </div>
        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec] min-h-[80px] p-3 placeholder:text-slate-400"
            placeholder={placeholder}
          />

          {/* Attachment previews */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {attachments.map((att, i) => (
                <div
                  key={`${att.file.name}-${i}`}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs text-slate-600 dark:text-slate-300 group"
                >
                  {att.previewUrl ? (
                    <img
                      src={att.previewUrl}
                      alt={att.file.name}
                      className="w-5 h-5 rounded object-cover"
                    />
                  ) : (
                    <span className="material-symbols-outlined !text-[14px] text-slate-400">
                      description
                    </span>
                  )}
                  <span className="max-w-[120px] truncate">{att.file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className="ml-0.5 text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <span className="material-symbols-outlined !text-[14px]">close</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-between items-center mt-2">
            <div className="flex gap-1">
              {/* Attach file */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={acceptedTypes}
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Attach file"
                className={attachments.length > 0 ? TOOLBAR_BTN_ACTIVE : TOOLBAR_BTN}
              >
                <span className="material-symbols-outlined !text-[20px]">attach_file</span>
              </button>

              {/* Bold */}
              <button
                type="button"
                onClick={handleBold}
                title="Bold (Ctrl+B)"
                className={TOOLBAR_BTN}
              >
                <span className="material-symbols-outlined !text-[20px]">format_bold</span>
              </button>

              {/* List */}
              <button
                type="button"
                onClick={handleList}
                title="Bullet list"
                className={TOOLBAR_BTN}
              >
                <span className="material-symbols-outlined !text-[20px]">list</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 hidden sm:inline">Ctrl+Enter to submit</span>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!hasContent || isSubmitting}
                className="bg-[#137fec] text-white text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? submittingLabel : submitLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
