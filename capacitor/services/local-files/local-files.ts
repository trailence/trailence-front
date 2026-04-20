import { registerPlugin } from '@capacitor/core';

export interface LocalFilesPlugin {

  fileExists(call: {dir: string, filename: string}): Promise<{exists: boolean}>;
  getFilesSize(call: {dir: string, files: string[]}): Promise<{files: {filename: string, size: number}[]}>;

  deleteFile(call: {dir: string, filename: string}): Promise<any>;
  deleteFiles(call: {dir: string, files: string[]}): Promise<any>;

  readBinaryFile(call: {dir: string, filename: string}): Promise<{data: string, chunks: number, id: number | undefined}>;
  readBinaryFileChunk(call: {id: number}): Promise<{data: string}>;

  readJsonlFile(call: {dir: string, filename: string}): Promise<{lines: string[], id: number | undefined}>;
  readJsonlFileChunk(call: {id: number}): Promise<{lines: string[], end: boolean}>;

  saveBinaryFile(call: {dir: string, filename: string, size: number}): Promise<{id: number, maxChunkSize: number}>;
  saveBinaryFileChunk(call: {id: number, data: string}): Promise<{result: string}>;

  saveJsonlFile(call: {dir: string, filename: string, lines: string[], more: boolean}): Promise<{id: number | undefined}>;
  saveJsonlFileChunk(call: {id: number, lines: string[], more: boolean}): Promise<{result: string}>;

}

const LocalFiles = registerPlugin<LocalFilesPlugin>('LocalFiles');

export default LocalFiles;
