/// <reference lib="webworker" />

import { processWorkerMessage } from './worker/web-worker';

addEventListener('message', ({ data }) => {
  void processWorkerMessage(data).then(response => {
    postMessage(response.response, response.transferable);
  });
});
