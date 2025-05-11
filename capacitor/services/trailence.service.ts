import { registerPlugin } from '@capacitor/core';

export interface TrailencePlugin {

  startSaveFile(call: {filename: string, type: string, isZip?: boolean}): Promise<{id: number | boolean}>;

  saveFileChunk(call: {id: number, data?: string, isEnd?: boolean}): Promise<{success: boolean}>;

  startZipFile(call: {id: number, filename: string}): Promise<{success: boolean}>;

  listenToImportedFiles(callback: (message: {fileId: number, chunks?: number, filename?: string, chunkIndex?: number, data?: string}) => void): void;

  downloadUsingBrowser(call: {url: string}): Promise<{success: boolean}>;

  canInstallUpdate(call: {}): Promise<{allowed: boolean}>;
  requestInstallPermission(call: {}): Promise<{allowed: boolean}>;
  downloadAndInstall(call: {url: string}, callback: (status: {done: boolean, error: string | null, i18n: string | null, progress: number | null}) => void): void;

  canKeepOnScreenLock(call: {}): Promise<{allowed: boolean}>;
  setKeepOnScreenLock(call: {enabled: boolean}): Promise<{success: boolean}>;
  getKeepOnScreenLock(call: {}): Promise<{enabled: boolean}>;
}

const Trailence = registerPlugin<TrailencePlugin>('Trailence');

export default Trailence;
