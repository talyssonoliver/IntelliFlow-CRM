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

    const typeMatch = /type:\s*(codebase|agent|human)/i.exec(block);
    const priorityMatch = /priority:\s*(blocking|important|nice-to-have)/i.exec(block);
    const contextMatch = /context:\s*(.+)/i.exec(block);
    const questionMatch = /question:\s*(.+)/i.exec(block);
    const sourcesMatch = /suggested_sources:\s*(.+)/i.exec(block);

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

// Load question logs from the tasks artifacts directory
function loadQuestionsFromTasksDir(tasksDir: string): TaskQuestions[] {
  if (!existsSync(tasksDir)) return [];
  const result: TaskQuestions[] = [];
  for (const file of readdirSync(tasksDir)) {
    if (
      !file.endsWith('_claude_spec_questions.log') &&
      !file.endsWith('_claude_plan_questions.log')
    ) {
      continue;
    }
    const taskId = file.replace(/_claude_(spec|plan)_questions\.log$/, '');
    const source = file.includes('_spec_') ? 'spec' : 'plan';
    const filePath = join(tasksDir, file);
    try {
      const questions = parseQuestions(readFileSync(filePath, 'utf-8'));
      if (questions.length > 0) {
        result.push({ taskId, status: 'NEEDS_HUMAN', source, questions, filePath });
      }
    } catch {
      // Skip unreadable files
    }
  }
  return result;
}

// Load questions from a single .specify sub-directory (specifications or planning)
function loadQuestionsFromSpecDir(
  dirPath: string,
  source: 'spec' | 'plan',
  existingTaskIds: Set<string>
): TaskQuestions[] {
  if (!existsSync(dirPath)) return [];
  const result: TaskQuestions[] = [];
  for (const file of readdirSync(dirPath)) {
    if (!file.endsWith('.md.tmp') && !file.endsWith('.md')) continue;
    const filePath = join(dirPath, file);
    try {
      const questions = parseQuestions(readFileSync(filePath, 'utf-8'));
      if (questions.length === 0) continue;
      const taskId = file.replace(/\.md(\.tmp)?$/, '');
      if (existingTaskIds.has(taskId)) continue;
      result.push({ taskId, status: 'PENDING_QUESTIONS', source, questions, filePath });
    } catch {
      // Skip unreadable files
    }
  }
  return result;
}

// Get all tasks with pending questions
export async function GET() {
  try {
    const tasksDir = PATHS.artifacts.tasks;
    const specifyDir = join(MONOREPO_ROOT, '.specify');

    const tasksWithQuestions: TaskQuestions[] = loadQuestionsFromTasksDir(tasksDir);
    const existingTaskIds = new Set(tasksWithQuestions.map((t) => t.taskId));

    const specDirMap: Array<[string, 'spec' | 'plan']> = [
      [join(specifyDir, 'specifications'), 'spec'],
      [join(specifyDir, 'planning'), 'plan'],
    ];
    for (const [dirPath, source] of specDirMap) {
      const more = loadQuestionsFromSpecDir(dirPath, source, existingTaskIds);
      for (const item of more) {
        tasksWithQuestions.push(item);
        existingTaskIds.add(item.taskId);
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
