/**
 * Typed request/response wrapper around the analysis worker.
 *
 * Responsibility: hide the id bookkeeping and promise plumbing behind a
 * single `request(type, payload, transfer?)` call so App.tsx never touches
 * `postMessage`/`onmessage` directly. One instance owns one worker.
 *
 * A worker-level `error` or `messageerror` event (an uncaught exception in
 * the worker, or a message that failed to deserialize) rejects every
 * pending request with a descriptive Error and clears the map, rather than
 * leaving those promises to hang forever; `terminate()` does the same
 * before actually terminating the worker. No request is ever left pending.
 *
 * Interface: class AnalysisClient(worker).request(type, payload, transfer?) -> Promise<result>; terminate().
 */
import type { WorkerRequest, WorkerResponse, WorkerResult } from './protocol.ts';

type RequestType = WorkerRequest['type'];

/** Payload type for a given request type, taken from the WorkerRequest union. */
type PayloadFor<T extends RequestType> = Extract<WorkerRequest, { type: T }>['payload'];

// The worker names its 'load' result 'loaded'; every other request type
// names its result identically to the request. This mapping expresses that
// one exception without making the common case unwieldy.
type ResultTypeFor<T extends RequestType> = T extends 'load' ? 'loaded' : T;

/** Result type for a given request type, taken from the WorkerResult union. */
type ResultFor<T extends RequestType> = Extract<WorkerResult, { type: ResultTypeFor<T> }>;

interface Pending {
  resolve: (result: WorkerResult) => void;
  reject: (error: Error) => void;
}

export class AnalysisClient {
  private readonly worker: Worker;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(worker: Worker) {
    this.worker = worker;
    this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const res = ev.data;
      const p = this.pending.get(res.id);
      if (p === undefined) return;
      this.pending.delete(res.id);
      if (res.ok) p.resolve(res.result);
      else p.reject(new Error(res.error));
    };
    this.worker.onerror = (ev: ErrorEvent) => {
      this.rejectAll(new Error(`worker error: ${ev.message}`));
    };
    this.worker.onmessageerror = () => {
      this.rejectAll(new Error('worker message could not be deserialized'));
    };
  }

  /** Rejects every pending request with `error` and clears the map. */
  private rejectAll(error: Error): void {
    for (const p of this.pending.values()) p.reject(error);
    this.pending.clear();
  }

  request<T extends RequestType>(
    type: T,
    payload: PayloadFor<T>,
    transfer: Transferable[] = [],
  ): Promise<ResultFor<T>> {
    const id = this.nextId++;
    return new Promise<ResultFor<T>>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (result: WorkerResult) => void,
        reject,
      });
      const request = { id, type, payload } as WorkerRequest;
      this.worker.postMessage(request, transfer);
    });
  }

  terminate(): void {
    this.rejectAll(new Error('worker terminated'));
    this.worker.terminate();
  }
}
