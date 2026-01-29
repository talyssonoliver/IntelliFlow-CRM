import { NextRequest, NextResponse } from 'next/server';
import { getJob, cleanupOldJobs } from '../job-storage';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');

  if (!jobId) {
    return NextResponse.json({
      success: false,
      error: 'Missing jobId parameter',
    }, { status: 400 });
  }

  const job = getJob(jobId);

  if (!job) {
    // Job not found - it might have completed before polling started
    // Return a "not found" status that the client can handle
    return NextResponse.json({
      success: true,
      data: null,
      message: 'Job not found or already completed',
    });
  }

  // Clean up old completed jobs (older than 5 minutes)
  cleanupOldJobs(5);

  return NextResponse.json({
    success: true,
    data: job,
  });
}
