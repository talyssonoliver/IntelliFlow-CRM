import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // 2 minute timeout for tests

interface TestResult {
  success: boolean;
  testType: string;
  output: string;
  endpointsTested?: number;
  passed?: number;
  failed?: number;
  duration?: number;
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { testType } = await request.json();

    if (!testType || !['quick', 'comprehensive'].includes(testType)) {
      return NextResponse.json(
        { error: 'Invalid test type. Use "quick" or "comprehensive".' },
        { status: 400 }
      );
    }

    const projectRoot = path.resolve(process.cwd(), '../..');
    const scriptPath =
      testType === 'quick'
        ? 'artifacts/misc/k6/scripts/authenticated-load-test.js'
        : 'artifacts/misc/k6/scripts/comprehensive-load-test.js';

    const fullScriptPath = path.join(projectRoot, scriptPath);

    if (!fs.existsSync(fullScriptPath)) {
      return NextResponse.json({ error: `Test script not found: ${scriptPath}` }, { status: 404 });
    }

    // Read env vars from .env.local
    const envPath = path.join(projectRoot, '.env.local');
    let supabaseUrl = '';
    let supabaseAnonKey = '';

    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const urlMatch = envContent.match(/SUPABASE_URL=([^\r\n]+)/);
      const keyMatch = envContent.match(/SUPABASE_ANON_KEY=([^\r\n]+)/);
      if (urlMatch) supabaseUrl = urlMatch[1].trim();
      if (keyMatch) supabaseAnonKey = keyMatch[1].trim();
    }

    // Run k6 test
    const k6Path =
      process.platform === 'win32'
        ? 'C:\\Users\\talys\\tools\\k6\\k6-v0.49.0-windows-amd64\\k6.exe'
        : 'k6';

    const result = await new Promise<TestResult>((resolve) => {
      const env = {
        ...process.env,
        SUPABASE_URL: supabaseUrl,
        SUPABASE_ANON_KEY: supabaseAnonKey,
        BASE_URL: 'http://localhost:3000',
      };

      const startTime = Date.now();
      let output = '';

      const child = spawn(k6Path, ['run', fullScriptPath], {
        cwd: projectRoot,
        env,
        shell: true,
      });

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        const duration = Math.round((Date.now() - startTime) / 1000);

        // Parse output for summary
        const endpointsMatch = output.match(/Endpoints Tested: (\d+)/);
        const passedMatch = output.match(/Total: (\d+) passed/);
        const failedMatch = output.match(/(\d+) failed/);

        resolve({
          success: code === 0,
          testType,
          output: output.slice(-5000), // Last 5000 chars
          endpointsTested: endpointsMatch ? parseInt(endpointsMatch[1]) : undefined,
          passed: passedMatch ? parseInt(passedMatch[1]) : undefined,
          failed: failedMatch ? parseInt(failedMatch[1]) : undefined,
          duration,
        });
      });

      child.on('error', (err) => {
        resolve({
          success: false,
          testType,
          output: '',
          error: err.message,
          duration: Math.round((Date.now() - startTime) / 1000),
        });
      });

      // Timeout after 90 seconds
      setTimeout(() => {
        child.kill();
        resolve({
          success: false,
          testType,
          output: output.slice(-5000),
          error: 'Test timed out after 90 seconds',
          duration: 90,
        });
      }, 90000);
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error running k6 test:', error);
    return NextResponse.json(
      { error: 'Failed to run k6 test', details: String(error) },
      { status: 500 }
    );
  }
}

// GET endpoint to check test status
export async function GET() {
  const projectRoot = path.resolve(process.cwd(), '../..');
  const k6LatestPath = path.join(projectRoot, 'artifacts/benchmarks/k6-latest.json');

  if (!fs.existsSync(k6LatestPath)) {
    return NextResponse.json({ status: 'no_results', message: 'No test results found' });
  }

  try {
    const data = JSON.parse(fs.readFileSync(k6LatestPath, 'utf-8'));
    return NextResponse.json({
      status: 'completed',
      testType: data.test_type,
      timestamp: data.timestamp,
      endpointsTested: data.endpoints_tested,
      metrics: data.metrics,
    });
  } catch {
    return NextResponse.json({ status: 'error', message: 'Failed to parse results' });
  }
}
