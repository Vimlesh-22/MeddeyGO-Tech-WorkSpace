const { randomUUID } = require('crypto');

// In-memory PDF job queue with basic FIFO processing
const jobs = new Map();
const queue = [];
let processing = false;

const JOB_TTL_MS = 1000 * 60 * 30; // 30 minutes

const getNow = () => new Date();

const cleanupExpiredJobs = () => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [jobId, job] of jobs.entries()) {
    if ((job.completedAt || job.updatedAt)?.getTime() < cutoff) {
      jobs.delete(jobId);
    }
  }
};

const processQueue = async () => {
  if (processing) return;
  const next = queue.shift();
  if (!next) return;

  processing = true;
  const job = jobs.get(next.jobId);
  if (!job) {
    processing = false;
    processQueue();
    return;
  }

  try {
    job.status = 'processing';
    job.startedAt = getNow();
    job.updatedAt = job.startedAt;

    const result = await next.worker();
    job.status = 'completed';
    job.result = result;
    job.completedAt = getNow();
    job.updatedAt = job.completedAt;
  } catch (error) {
    job.status = 'failed';
    job.error = {
      message: error?.message || 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
    };
    job.completedAt = getNow();
    job.updatedAt = job.completedAt;
  } finally {
    processing = false;
    cleanupExpiredJobs();
    setImmediate(processQueue);
  }
};

const enqueuePdfJob = (payload, worker) => {
  const jobId = randomUUID();
  const now = getNow();
  jobs.set(jobId, {
    id: jobId,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    payload,
    result: null,
    error: null,
  });

  queue.push({ jobId, worker });
  setImmediate(processQueue);
  return jobId;
};

const getJob = (jobId) => {
  const job = jobs.get(jobId);
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    result: job.result,
    error: job.error,
  };
};

module.exports = {
  enqueuePdfJob,
  getJob,
};
