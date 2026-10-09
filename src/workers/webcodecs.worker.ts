import { runSequentialPipeline, SequentialUnavailable } from '../services/webcodecs/sequentialPipeline';
import type { VideoPipelineRequest, VideoPipelineResponse } from '../services/webcodecs/workerTypes';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<VideoPipelineRequest>) => void) | null;
  postMessage: (response: VideoPipelineResponse, transfer?: Transferable[]) => void;
};

scope.onmessage = async ({ data }) => {
  let reported = false;
  try {
    const result = await runSequentialPipeline(data, new AbortController().signal, (response) => {
      if (response.type === 'error') reported = true;
      scope.postMessage(response);
    });
    scope.postMessage({ type: 'complete', buffer: result.buffer, stats: result.stats }, [result.buffer]);
  } catch (error) {
    if (error instanceof SequentialUnavailable) {
      scope.postMessage({ type: 'unsupported', reason: error.message });
    } else if (!reported) {
      scope.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
};
