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
      types: [request.mimeType],
      limit: request.multiple ? 0 : 1,
      readData: true
    }).then(pickedFiles => {
      if (pickedFiles.files.length > 0) {
        request.onstartreading(pickedFiles.files.length)
        .then(fromStartReading => {
          const results: T[] = [];
          const readNext = (index: number) => {
            const buffer = Uint8Array.from(atob(pickedFiles.files[index].data!), c => c.charCodeAt(0));
            request.onfileread(index, pickedFiles.files.length, fromStartReading, buffer)
            .then(result => {
              results.push(result);
              if (index === pickedFiles.files.length - 1) {
                setTimeout(() => request.onfilesloaded(fromStartReading, results), 0);
              } else {
                setTimeout(() => readNext(index + 1), 0);
              }
            })
            .catch(e => request.onerror(e, fromStartReading));
          };
          setTimeout(() => readNext(0), 0);
        }).catch(e => request.onerror(e, undefined));
      }
    }).catch(e => request.onerror(e, undefined));
  }

  public saveBinaryData(filename: string, data: BinaryContent): Promise<boolean> {
    return data.toBase64().then(
      base64 => Trailence.saveFile({filename, type: data.getContentType(), data: base64}).then(result => result.saved)
    );
  }

}
