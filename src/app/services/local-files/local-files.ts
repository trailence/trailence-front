const notSupported = () => Promise.reject(new Error('not supported'));
const LocalFiles = {

  fileExists: notSupported as (call: {dir: string, filename: string}) => Promise<{exists: boolean}>,
  getFilesSize: notSupported as (call: {dir: string, files: string[]}) => Promise<{files: {filename: string, size: number}[]}>,

  deleteFile: notSupported as (call: {dir: string, filename: string}) => Promise<any>,
  deleteFiles: notSupported as (call: {dir: string, files: string[]}) => Promise<any>,

  readBinaryFile: notSupported as (call: {dir: string, filename: string}) => Promise<{data: string, chunks: number, id: number | undefined}>,
  readBinaryFileChunk: notSupported as (call: {id: number}) => Promise<{data: string}>,

  readJsonlFile: notSupported as (call: {dir: string, filename: string}) => Promise<{lines: string[], id: number | undefined}>,
  readJsonlFileChunk: notSupported as (call: {id: number}) => Promise<{lines: string[], end: boolean}>,

  saveBinaryFile: notSupported as (call: {dir: string, filename: string, size: number}) => Promise<{id: number, maxChunkSize: number}>,
  saveBinaryFileChunk: notSupported as (call: {id: number, data: string}) => Promise<{result: string}>,

  saveJsonlFile: notSupported as (call: {dir: string, filename: string, lines: string[], more: boolean}) => Promise<{id: number | undefined}>,
  saveJsonlFileChunk: notSupported as (call: {id: number, lines: string[], more: boolean}) => Promise<{result: string}>,
};

export default LocalFiles;
