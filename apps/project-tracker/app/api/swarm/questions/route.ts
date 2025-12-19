import { NextResponse } from 'next/server';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PATHS, MONOREPO_ROOT } from '@/lib/paths';

interface Question {
  id: number;
  type: 'codebase' | 'agent' | 'human';
  priority: 'blocking' | 'important' | 'nice-to-have';
  context: string;
  question: string;
  suggestedSources: string;
  answer?: string;
}

interface TaskQuestions {
  taskId: string;
  status: string;
  source: 'spec' | 'plan';
  questions: Question[];
  filePath: string;
}

// Parse [QUESTION] blocks from file content
function parseQuestions(content: string): Question[] {
  const questions: Question[] = [];
  const questionRegex = /\[QUESTION\]([\s\S]*?)\[\/QUESTION\]/g;
  let match;
  let id = 1;

  while ((match = questionRegex.exec(content)) !== null) {
    const block = match[1];

    const typeMatch = block.match(/type:\s*(codebase|agent|human)/i);
    const priorityMatch = block.match(/priority:\s*(blocking|important|nice-to-have)/i);
    const contextMatch = block.match(/context:\s*(.+)/i);
    const questionMatch = block.match(/question:\s*(.+)/i);
    const sourcesMatch = block.match(/suggested_sources:\s*(.+)/i);

    questions.push({
      id: id++,
      type: (typeMatch?.[1]?.toLowerCase() || 'human') as Question['type'],
      priority: (priorityMatch?.[1]?.toLowerCase() || 'blocking') as Question['priority'],
      context: contextMatch?.[1]?.trim() || '',
      question: questionMatch?.[1]?.trim() || '',
      suggestedSources: sourcesMatch?.[1]?.trim() || '',
    });
  }

  return questions;
}

// Get all tasks with pending questions
export async function GET() {
  try {
    const tasksDir = PATHS.artifacts.tasks;
    const specifyDir = join(MONOREPO_ROOT, '.specify');

    const tasksWithQuestions: TaskQuestions[] = [];

    // Check tasks directory for question logs
    if (existsSync(tasksDir)) {
      const files = readdirSync(tasksDir);

      for (const file of files) {
        if (
          file.endsWith('_claude_spec_questions.log') ||
          file.endsWith('_claude_plan_questions.log')
        ) {
          const taskId = file.replace(/_claude_(spec|plan)_questions\.log$/, '');
          const source = file.includes('_spec_') ? 'spec' : 'plan';
          const filePath = join(tasksDir, file);

          try {
            const content = readFileSync(filePath, 'utf-8');
            const questions = parseQuestions(content);

            if (questions.length > 0) {
              tasksWithQuestions.push({
                taskId,
                status: 'NEEDS_HUMAN',
                source: source as 'spec' | 'plan',
                questions,
                filePath,
              });
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    }

    // Also check .specify directories for in-progress files with questions
    const specDirs = ['specifications', 'planning'];
    for (const dir of specDirs) {
      const dirPath = join(specifyDir, dir);
      if (existsSync(dirPath)) {
        const files = readdirSync(dirPath);

        for (const file of files) {
          if (file.endsWith('.md.tmp') || file.endsWith('.md')) {
            const filePath = join(dirPath, file);
            try {
              const content = readFileSync(filePath, 'utf-8');
              const questions = parseQuestions(content);

              if (questions.length > 0) {
                const taskId = file.replace(/\.md(\.tmp)?$/, '');
                // Skip if already added from tasks dir
                if (!tasksWithQuestions.find((t) => t.taskId === taskId)) {
                  tasksWithQuestions.push({
                    taskId,
                    status: 'PENDING_QUESTIONS',
                    source: dir === 'specifications' ? 'spec' : 'plan',
                    questions,
                    filePath,
                  });
                }
              }
            } catch {
              // Skip unreadable files
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      count: tasksWithQuestions.length,
      tasks: tasksWithQuestions,
    });
  } catch (error) {
    console.error('Error getting questions:', error);
    return NextResponse.json({ error: 'Failed to get questions' }, { status: 500 });
  }
}
