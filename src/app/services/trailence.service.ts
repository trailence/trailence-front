const Trailence = {
  listenToImportedFiles(callback: (message: {fileId: number, chunks?: number, chunkIndex?: number, data?: string}) => void): void {
  },
  downloadUsingBrowser(call: {url: string}): Promise<{success: boolean}> {
    window.open(call.url, '_blank');
    return Promise.resolve({success: true});
  }
};
export default Trailence;
