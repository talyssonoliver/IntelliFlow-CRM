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
      // Parse existing answers (simple format: ## Question N followed by answer)
      const answerMatches = answersContent.matchAll(
        /## Question (\d+)[\s\S]*?\*\*Answer.*?\*\*:?\s*([\s\S]*?)(?=## Question|\n---|$)/g
      );
      for (const match of answerMatches) {
        const qId = parseInt(match[1], 10);
        const answer = match[2].trim();
        if (answer && !answer.includes('REQUIRES HUMAN INPUT')) {
          existingAnswers[qId] = answer;
        }
      }
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
