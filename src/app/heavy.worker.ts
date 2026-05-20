/// <reference lib="webworker" />

import { processWorkerMessage } from './worker/web-worker';

addEventListener('message', ({ data }) => {
  processWorkerMessage(data).then(response => {
    postMessage(response.response, response.transferable);
  });
});
