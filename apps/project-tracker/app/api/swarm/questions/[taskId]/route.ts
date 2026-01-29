import { NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PATHS, MONOREPO_ROOT, getTaskAnswersPath, getTaskQuestionsPath } from '@/lib/paths';

interface RouteContext {
  params: Promise<{ taskId: string }>;
}

interface Question {
  id: number;
  type: 'codebase' | 'agent' | 'human';
  priority: 'blocking' | 'important' | 'nice-to-have';
  context: string;
  question: string;
  suggestedSources: string;
}

interface Answer {
  questionId: number;
  answer: string;
}

const QUESTION_BLOCK_RE = /\[QUESTION\]([\s\S]*?)\[\/QUESTION\]/g;
const QUESTION_TYPE_RE = /type:\s*(codebase|agent|human)/i;
const QUESTION_PRIORITY_RE = /priority:\s*(blocking|important|nice-to-have)/i;
const QUESTION_CONTEXT_RE = /context:\s*(.+)/i;
const QUESTION_TEXT_RE = /question:\s*(.+)/i;
const QUESTION_SOURCES_RE = /suggested_sources:\s*(.+)/i;

const ANSWER_QUESTION_HEADER_RE = /^##\s+Question\s+(\d+)\b/i;
const ANSWER_SECTION_SEPARATOR_RE = /^\s*---\s*$/;

// Parse [QUESTION] blocks from file content
function parseQuestions(content: string): Question[] {
  const questions: Question[] = [];
  QUESTION_BLOCK_RE.lastIndex = 0;
  let match;
  let id = 1;

  while ((match = QUESTION_BLOCK_RE.exec(content)) !== null) {
    const block = match[1];

    const typeMatch = QUESTION_TYPE_RE.exec(block);
    const priorityMatch = QUESTION_PRIORITY_RE.exec(block);
    const contextMatch = QUESTION_CONTEXT_RE.exec(block);
    const questionMatch = QUESTION_TEXT_RE.exec(block);
    const sourcesMatch = QUESTION_SOURCES_RE.exec(block);

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

// Find question file for a task
function findQuestionFile(
  taskId: string,
  specifyDir: string
): { path: string; source: string } | null {
  const locations = [
    { path: getTaskQuestionsPath(taskId, 'spec'), source: 'spec' },
    { path: getTaskQuestionsPath(taskId, 'plan'), source: 'plan' },
    { path: join(specifyDir, 'specifications', `${taskId}.md.tmp`), source: 'spec' },
    { path: join(specifyDir, 'planning', `${taskId}.md.tmp`), source: 'plan' },
    { path: join(specifyDir, 'specifications', `${taskId}.md`), source: 'spec' },
    { path: join(specifyDir, 'planning', `${taskId}.md`), source: 'plan' },
  ];

  for (const loc of locations) {
    if (existsSync(loc.path)) {
      try {
        const content = readFileSync(loc.path, 'utf-8');
        if (content.includes('[QUESTION]')) {
          return loc;
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

function sanitizeAnswerText(answerText: string): string | null {
  const answer = answerText.trim();
  if (!answer) return null;
  if (answer.includes('REQUIRES HUMAN INPUT')) return null;

  const normalized = answer.replace(/\s+/g, ' ').trim().toLowerCase();
  if (normalized === '(not provided)') return null;

  return answer;
}

function parseAnswerInlineText(line: string): string | null {
  const trimmed = line.trimStart();
  if (!trimmed.toLowerCase().startsWith('**answer')) return null;

  const boldCloseIndex = trimmed.indexOf('**', 2);
  if (boldCloseIndex <= 2) return null;

  let inline = trimmed.slice(boldCloseIndex + 2).trimStart();
  if (inline.startsWith(':')) inline = inline.slice(1).trimStart();
  return inline;
}

function parseExistingAnswers(answersContent: string): Record<number, string> {
  const existingAnswers: Record<number, string> = {};
  const lines = answersContent.split(/\r?\n/);

  let currentQuestionId: number | null = null;
  let collectingAnswer = false;
  let answerLines: string[] = [];

  const flush = () => {
    if (currentQuestionId === null || !collectingAnswer) return;

    const answer = sanitizeAnswerText(answerLines.join('\n'));
    answerLines = [];
    collectingAnswer = false;
    if (answer) existingAnswers[currentQuestionId] = answer;
  };

  for (const line of lines) {
    const questionMatch = ANSWER_QUESTION_HEADER_RE.exec(line);
    if (questionMatch?.[1]) {
      flush();
      currentQuestionId = Number.parseInt(questionMatch[1], 10);
      collectingAnswer = false;
      answerLines = [];
      continue;
    }

    if (currentQuestionId === null) continue;

    if (ANSWER_SECTION_SEPARATOR_RE.test(line)) {
      flush();
      currentQuestionId = null;
      continue;
    }

    const inlineAnswer = parseAnswerInlineText(line);
    if (inlineAnswer !== null) {
      collectingAnswer = true;
      answerLines = [];
      if (inlineAnswer) answerLines.push(inlineAnswer);
      continue;
    }

    if (collectingAnswer) {
      answerLines.push(line);
    }
  }

  flush();
  return existingAnswers;
}

// GET - Get questions for a specific task
export async function GET(request: Request, context: RouteContext) {
  try {
    const { taskId } = await context.params;

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID required' }, { status: 400 });
    }

    const specifyDir = join(MONOREPO_ROOT, '.specify');

    const questionFile = findQuestionFile(taskId, specifyDir);

    if (!questionFile) {
      return NextResponse.json({
        success: true,
        taskId,
        hasQuestions: false,
        questions: [],
      });
    }

    const content = readFileSync(questionFile.path, 'utf-8');
    const questions = parseQuestions(content);

    // Check if answers already exist
    const answersFile = getTaskAnswersPath(taskId);
    const existingAnswers: Record<number, string> = {};

    if (existsSync(answersFile)) {
      const answersContent = readFileSync(answersFile, 'utf-8');
      Object.assign(existingAnswers, parseExistingAnswers(answersContent));
    }

    // Merge existing answers with questions
    const questionsWithAnswers = questions.map((q) => ({
      ...q,
      answer: existingAnswers[q.id] || null,
    }));

    return NextResponse.json({
      success: true,
      taskId,
      source: questionFile.source,
      hasQuestions: questions.length > 0,
      questions: questionsWithAnswers,
      filePath: questionFile.path,
    });
  } catch (error) {
    console.error('Error getting task questions:', error);
    return NextResponse.json({ error: 'Failed to get questions' }, { status: 500 });
  }
}

// POST - Submit answers to questions
export async function POST(request: Request, context: RouteContext) {
  try {
    const { taskId } = await context.params;

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID required' }, { status: 400 });
    }

    const body = await request.json();
    const { answers } = body as { answers: Answer[] };

    if (!answers || !Array.isArray(answers)) {
      return NextResponse.json({ error: 'Answers array required' }, { status: 400 });
    }

    const specifyDir = join(MONOREPO_ROOT, '.specify');
    const tasksDir = PATHS.artifacts.tasks;

    // Ensure tasks directory exists
    if (!existsSync(tasksDir)) {
      mkdirSync(tasksDir, { recursive: true });
    }

    // Find the question file to get original questions
    const questionFile = findQuestionFile(taskId, specifyDir);

    if (!questionFile) {
      return NextResponse.json({ error: 'No questions found for task' }, { status: 404 });
    }

    const content = readFileSync(questionFile.path, 'utf-8');
    const questions = parseQuestions(content);

    // Build answers file
    const answersPath = getTaskAnswersPath(taskId);
    let answersContent = `# Human Answers for ${taskId}\n`;
    answersContent += `Answered at: ${new Date().toISOString()}\n\n`;

    for (const q of questions) {
      const answer = answers.find((a) => a.questionId === q.id);
      answersContent += `## Question ${q.id}\n`;
      answersContent += `**Type:** ${q.type}\n`;
      answersContent += `**Priority:** ${q.priority}\n`;
      answersContent += `**Context:** ${q.context}\n`;
      answersContent += `**Question:** ${q.question}\n\n`;

      if (answer && answer.answer) {
        answersContent += `**Answer (from human):**\n${answer.answer}\n\n`;
      } else {
        answersContent += `**Answer:** (not provided)\n\n`;
      }

      answersContent += `---\n\n`;
    }

    writeFileSync(answersPath, answersContent, 'utf-8');

    // Update intervention status (remove from needs_human if all questions answered)
    const allAnswered = questions.every((q) =>
      answers.find((a) => a.questionId === q.id && a.answer)
    );

    return NextResponse.json({
      success: true,
      taskId,
      answersFile: answersPath,
      questionsAnswered: answers.filter((a) => a.answer).length,
      totalQuestions: questions.length,
      allAnswered,
      message: allAnswered
        ? 'All questions answered. Run the task again to continue.'
        : 'Partial answers saved. Provide remaining answers to continue.',
    });
  } catch (error) {
    console.error('Error saving answers:', error);
    return NextResponse.json({ error: 'Failed to save answers' }, { status: 500 });
  }
}
