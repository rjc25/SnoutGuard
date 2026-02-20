'use client';

import { useCallback, useState } from 'react';
import { Bold, Eye, Italic, Link2, List, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SummaryEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: number;
  readOnly?: boolean;
}

type EditorTab = 'write' | 'preview';

export function SummaryEditor({
  value,
  onChange,
  placeholder = 'Write your summary here...',
  minHeight = 400,
  readOnly = false,
}: SummaryEditorProps) {
  const [tab, setTab] = useState<EditorTab>('write');

  const insertMarkdown = useCallback(
    (prefix: string, suffix: string = '') => {
      const textarea = document.getElementById('summary-editor') as HTMLTextAreaElement | null;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = value.substring(start, end);
      const before = value.substring(0, start);
      const after = value.substring(end);

      const newText = `${before}${prefix}${selectedText || 'text'}${suffix}${after}`;
      onChange(newText);

      // Reset cursor position after React re-renders
      requestAnimationFrame(() => {
        textarea.focus();
        const cursorPos = start + prefix.length + (selectedText || 'text').length;
        textarea.setSelectionRange(cursorPos, cursorPos);
      });
    },
    [value, onChange],
  );

  const handleBold = useCallback(() => insertMarkdown('**', '**'), [insertMarkdown]);
  const handleItalic = useCallback(() => insertMarkdown('_', '_'), [insertMarkdown]);
  const handleLink = useCallback(() => insertMarkdown('[', '](url)'), [insertMarkdown]);
  const handleList = useCallback(() => insertMarkdown('- '), [insertMarkdown]);

  // Simple markdown-to-HTML renderer for preview
  const renderPreview = useCallback((content: string) => {
    if (!content.trim()) {
      return '<p class="text-gray-400 italic">Nothing to preview</p>';
    }

    return content
      .split('\n\n')
      .map((block) => {
        // Headings
        if (block.startsWith('### ')) {
          return `<h3 class="text-base font-semibold text-gray-900 mt-4 mb-2">${block.slice(4)}</h3>`;
        }
        if (block.startsWith('## ')) {
          return `<h2 class="text-lg font-semibold text-gray-900 mt-4 mb-2">${block.slice(3)}</h2>`;
        }
        if (block.startsWith('# ')) {
          return `<h1 class="text-xl font-bold text-gray-900 mt-4 mb-2">${block.slice(2)}</h1>`;
        }

        // List items
        const lines = block.split('\n');
        if (lines.every((l) => l.startsWith('- ') || l.trim() === '')) {
          const items = lines
            .filter((l) => l.startsWith('- '))
            .map((l) => `<li class="text-gray-700">${formatInline(l.slice(2))}</li>`)
            .join('');
          return `<ul class="list-disc pl-5 space-y-1 my-2">${items}</ul>`;
        }

        // Regular paragraph
        return `<p class="text-gray-700 leading-relaxed my-2">${formatInline(block)}</p>`;
      })
      .join('');
  }, []);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Toolbar */}
      {!readOnly && (
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-1.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTab('write')}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded transition-colors',
                tab === 'write'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              <Pencil className="w-3.5 h-3.5 inline mr-1" />
              Write
            </button>
            <button
              type="button"
              onClick={() => setTab('preview')}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded transition-colors',
                tab === 'preview'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              <Eye className="w-3.5 h-3.5 inline mr-1" />
              Preview
            </button>
          </div>

          {tab === 'write' && (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={handleBold}
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors"
                title="Bold"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleItalic}
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors"
                title="Italic"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleLink}
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors"
                title="Link"
              >
                <Link2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleList}
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors"
                title="List"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Editor / Preview */}
      {tab === 'write' && !readOnly ? (
        <textarea
          id="summary-editor"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full border-0 p-4 font-mono text-sm text-gray-900 placeholder:text-gray-400 focus:ring-0 focus:outline-none resize-y"
          style={{ minHeight }}
        />
      ) : (
        <div
          className="p-4 prose prose-sm max-w-none"
          style={{ minHeight }}
          dangerouslySetInnerHTML={{ __html: renderPreview(value) }}
        />
      )}

      {/* Footer */}
      <div className="border-t border-gray-200 bg-gray-50 px-3 py-1.5 flex items-center justify-between">
        <span className="text-2xs text-gray-400">Markdown supported</span>
        <span className="text-2xs text-gray-400 tabular-nums">
          {value.length} characters
        </span>
      </div>
    </div>
  );
}

/**
 * Minimal inline Markdown formatting (bold, italic, links, code).
 */
function formatInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-xs">$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-brand-600 hover:underline">$1</a>');
}
