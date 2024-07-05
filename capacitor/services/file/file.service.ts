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

  public openFileDialog(request: OpenFileRequest): void {
    FilePicker.pickFiles({
      types: [request.mimeType],
      limit: request.multiple ? 0 : 1,
      readData: true
    }).then(pickedFiles => {
      if (pickedFiles.files.length > 0) {
        request.onreading().then(fromOnreading => {
          const content = [];
          for (const file of pickedFiles.files) {
            const buffer = Uint8Array.from(atob(file.data!), c => c.charCodeAt(0));
            content.push(buffer);
          }
          request.onloaded(content, fromOnreading);
        }).catch(onerror);
      }
    }).catch(onerror);
  }

  public saveBinaryData(filename: string, data: BinaryContent): Promise<boolean> {
    return data.toBase64().then(
      base64 => Trailence.saveFile({filename, type: data.getContentType(), data: base64}).then(result => result.saved)
    );
  }

}
