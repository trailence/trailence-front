const Trailence = {
  listenToImportedFiles(callback: (message: {fileId: number, chunks?: number, chunkIndex?: number, data?: string}) => void): void {
  },
  downloadUsingBrowser(call: {url: string}): Promise<{success: boolean}> {
    window.open(call.url, '_blank');
    return Promise.resolve({success: true});
  },
  canInstallUpdate(call: {}): Promise<{allowed: boolean}> {
    return Promise.reject(new Error('Not in android'));
  },
  requestInstallPermission(call: {}): Promise<{allowed: boolean}> {
    return Promise.reject(new Error('Not in android'));
  },
  downloadAndInstall(call: {url: string}, callback: (status: {done: boolean, error: string | null, i18n: string | null, progress: number | null}) => void): void {
    throw new Error('Not in android');
  }
};
export default Trailence;
