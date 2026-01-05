/**
 * Job Storage Module
 *
 * In-memory storage for generation jobs.
 * In production, use Redis or database for persistence.
 */

export interface GenerationJob {
  id: string;
  reports: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  currentReport?: string;
  results: Array<{
    report: string;
    success: boolean;
    message: string;
    duration: number;
  }>;
  startedAt: string;
  completedAt?: string;
}

// In-memory storage for generation jobs
const generationJobs = new Map<string, GenerationJob>();

export function getJob(jobId: string): GenerationJob | undefined {
  return generationJobs.get(jobId);
}

export function setJob(job: GenerationJob): void {
  generationJobs.set(job.id, job);
}

export function updateJobProgress(jobId: string, updates: Partial<GenerationJob>): void {
  const job = generationJobs.get(jobId);
  if (job) {
    generationJobs.set(jobId, { ...job, ...updates });
  }
}

export function deleteJob(jobId: string): boolean {
  return generationJobs.delete(jobId);
}

export function getAllJobs(): GenerationJob[] {
  return Array.from(generationJobs.values());
}

/**
 * Clean up old completed jobs (older than specified minutes)
 */
export function cleanupOldJobs(maxAgeMinutes: number = 5): void {
  const now = Date.now();
  const maxAgeMs = maxAgeMinutes * 60 * 1000;

  for (const [id, job] of generationJobs.entries()) {
    if (job.completedAt) {
      const completedTime = new Date(job.completedAt).getTime();
      if (now - completedTime > maxAgeMs) {
        generationJobs.delete(id);
      }
    }
  }
}
