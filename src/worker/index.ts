/**
 * Background worker entry point.
 * Placeholder for the BullMQ video-processing worker.
 */
export function startWorker() {
  if (process.env.NODE_ENV !== "production") {
    console.log("[worker] startWorker invoked");
  }
}
