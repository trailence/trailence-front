import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { IFileService, OpenFileRequest } from 'src/app/services/file/file.interface';
import { BinaryContent } from 'src/app/utils/binary-content';
import Trailence from '../trailence.service';


@Injectable({
  providedIn: 'root'
})
export class FileService implements IFileService {

  constructor(
    private platform: Platform
  ) {
  }

  public openFileDialog<P,T>(request: OpenFileRequest<P,T>): void {
    FilePicker.pickFiles({
      types: request.types.map(t => t.mime),
      limit: request.multiple ? 0 : 1,
      readData: true
    }).then(pickedFiles => {
      if (pickedFiles.files.length > 0) {
        request.onstartreading(pickedFiles.files.length)
        .then(fromStartReading => {
          const results: T[] = [];
          const errors: any[] = [];
          const readNext = (index: number) => {
            const onerror = (e: any) => {
              errors.push(e);
              if (index === pickedFiles.files.length - 1) {
                setTimeout(() => request.ondone(fromStartReading, results, errors), 0);
              } else {
                setTimeout(() => readNext(index + 1), 0);
              }
            };
            const buffer = Uint8Array.from(atob(pickedFiles.files[index].data!), c => c.charCodeAt(0));
            request.onfileread(index, pickedFiles.files.length, fromStartReading, pickedFiles.files[index].name, buffer)
            .then(result => {
              results.push(result);
              if (index === pickedFiles.files.length - 1) {
                setTimeout(() => request.ondone(fromStartReading, results, errors), 0);
              } else {
                setTimeout(() => readNext(index + 1), 0);
              }
            })
            .catch(onerror);
          };
          setTimeout(() => readNext(0), 0);
        }).catch(e => request.ondone(undefined, [], [e]));
      }
    }).catch(e => request.ondone(undefined, [], []));
  }

  public saveBinaryData(filename: string, data: BinaryContent): Promise<boolean> {
    return this.internalSaveBinary(filename, data);
  }

  private async internalSaveBinary(filename: string, data: BinaryContent) {
    const start = await Trailence.startSaveFile({ filename, type: data.getContentType()});
    if (start.id === false) return false;
    const id = start.id as number;
    return await this.internalSaveFileChunks(id, data, true);
  }

  private async internalSaveFileChunks(id: number, data: BinaryContent, sendEnd: boolean) {
    const buffer = await data.toArrayBuffer();
    let pos = 0;
    do {
      let chunk: Uint8Array;
      if (pos === 0 && buffer.byteLength <= 768 * 1024) {
        chunk = new Uint8Array(buffer);
        pos = buffer.byteLength;
      } else {
        let end = Math.min(buffer.byteLength, pos + 768 * 1024);
        chunk = new Uint8Array(buffer.slice(pos, end));
        pos = end;
      }
      const base64 = btoa(chunk.reduce((data, byte) => data + String.fromCharCode(byte), ''));
      const result = await Trailence.saveFileChunk({id, data: base64, isEnd: sendEnd && pos >= buffer.byteLength});
      if (!result.success) return false;
    } while (pos < buffer.byteLength);
    return true;
  }

  public saveZip(filename: string, contentProvider: () => Promise<{ filename: string; data: BinaryContent; } | null>): Promise<boolean> {
    return this.internalSaveZip(filename, contentProvider);
  }

  private async internalSaveZip(filename: string, contentProvider: () => Promise<{ filename: string; data: BinaryContent; } | null>) {
    const start = await Trailence.startSaveFile({ filename, type: 'application/x-zip', isZip: true});
    if (start.id === false) return false;
    const id = start.id as number;
    do {
      const nextFile = await contentProvider();
      if (nextFile === null) break;
      const result = await Trailence.startZipFile({id, filename: nextFile.filename});
      if (!result.success) return false;
      const result2 = await this.internalSaveFileChunks(id, nextFile.data, false);
      if (!result2) return false;
    } while (true);
    const result = await Trailence.saveFileChunk({id, isEnd: true});
    if (!result.success) return false;
    return true;
  }

}
