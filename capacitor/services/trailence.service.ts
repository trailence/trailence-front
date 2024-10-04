import { registerPlugin } from '@capacitor/core';

export interface TrailencePlugin {

  startSaveFile(call: {filename: string, type: string, isZip?: boolean}): Promise<{id: number | boolean}>;

  saveFileChunk(call: {id: number, data?: string, isEnd?: boolean}): Promise<{success: boolean}>;

  startZipFile(call: {id: number, filename: string}): Promise<{success: boolean}>;

  listenToImportedFiles(callback: (message: {fileId: number, chunks?: number, chunkIndex?: number, data?: string}) => void): void;

  downloadUsingBrowser(call: {url: string}): Promise<{success: boolean}>;

}

const Trailence = registerPlugin<TrailencePlugin>('Trailence');

export default Trailence;
