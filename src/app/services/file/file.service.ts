import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
import { BinaryContent } from 'src/app/utils/binary-content';
import { IFileService } from './file.interface';

@Injectable({
  providedIn: 'root'
})
export class FileService implements IFileService {

  constructor(
    private platform: Platform
  ) {
  }

  public openFileDialog(request: OpenFileRequest): void {
    if (this.tryOpenFileWithBrowserMethod(request)) {
      return;
    }
    if (this.tryWithHiddenInputFile(request)) {
      return;
    }
    // TODO
  }

  private tryOpenFileWithBrowserMethod(r: OpenFileRequest): boolean {
    if (!this.platform.is('desktop') && !this.platform.is('mobileweb')) {
      return false;
    }
    if (typeof (window as any).showOpenFilePicker !== 'function') {
      return false;
    }
    const accept: any = {};
    accept[r.mimeType] = [r.extension];
    try {
      (window as any).showOpenFilePicker({
        types: [{description: r.description, accept}],
        multiple: r.multiple
      }).then((files: any[]) => {
        r.onreading().then(obj => {
          this.getFilesContentFromFilePicker(files).then(content => {
            r.onloaded(content, obj);
          }).catch((e: any) => r.onerror(e, obj));
        }).catch((e: any) => r.onerror(e, undefined));
      }).catch((e: any) => r.onerror(e, undefined));
      return true;
    } catch (e) {
      return false;
    }
  }

  private getFilesContentFromFilePicker(selectedFiles: any[]): Promise<ArrayBuffer[]> {
    return new Promise<ArrayBuffer[]>((resolve, reject) => {
      this.getFilesContentStepFromFilePicker(selectedFiles, [], 0, resolve, reject);
    });
  }

  private getFilesContentStepFromFilePicker(selectedFiles: any[], content: ArrayBuffer[], index: number, onDone: (content: ArrayBuffer[]) => void, onError: (e: any) => void): void {
    if (index >= selectedFiles.length) {
      onDone(content);
      return;
    }
    selectedFiles[index].getFile().then((file: File) => {
      file.arrayBuffer().then((fileContent: ArrayBuffer) => {
        content.push(fileContent);
        this.getFilesContentStepFromFilePicker(selectedFiles, content, index + 1, onDone, onError);
      }).catch(onError);
    }).catch(onError);
  }

  private tryWithHiddenInputFile(r: OpenFileRequest): boolean {
    const input = document.createElement('INPUT') as HTMLInputElement;
    input.type = 'file';
    input.multiple = r.multiple;
    input.accept = r.mimeType + ',' + r.extension;
    input.style.position = 'fixed';
    input.style.top = '-10000px';
    input.style.left = '-10000px';
    input.addEventListener('change', () => {
      if (input.files && input.files.length > 0) {
        r.onreading().then(obj => {
          this.getFilesContent(input.files!).then(content => {
            r.onloaded(content, obj);
          }).catch((e: any) => { document.documentElement.removeChild(input); r.onerror(e, obj); });
        }).catch((e: any) => { document.documentElement.removeChild(input); r.onerror(e, undefined); });
      }
    });
    document.documentElement.appendChild(input);
    const click = new MouseEvent('click');
    input.dispatchEvent(click);
    return true;
  }

  private getFilesContent(selectedFiles: FileList): Promise<ArrayBuffer[]> {
    return new Promise<ArrayBuffer[]>((resolve, reject) => {
      this.getFilesContentStep(selectedFiles, [], 0, resolve, reject);
    });
  }

  private getFilesContentStep(selectedFiles: FileList, content: ArrayBuffer[], index: number, onDone: (content: ArrayBuffer[]) => void, onError: (e: any) => void): void {
    if (index >= selectedFiles.length) {
      onDone(content);
      return;
    }
    selectedFiles[index].arrayBuffer().then((fileContent: ArrayBuffer) => {
      content.push(fileContent);
      this.getFilesContentStep(selectedFiles, content, index + 1, onDone, onError);
    }).catch(onError);
  }

  public saveBinaryData(filename: string, data: BinaryContent): Promise<boolean> {
    return data.toBlob().then(
      blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        document.documentElement.appendChild(a);
        a.setAttribute('style', 'display: none');
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        return true;
      }
    );
  }
}

class OpenFileRequest {
    constructor(
      public description: string,
      public mimeType: string,
      public extension: string,
      public multiple: boolean,
      public onreading: () => Promise<any>,
      public onloaded: (content: ArrayBuffer[], fromOnreading: any) => void,
      public onerror: (error: any, fromOnreading?: any) => void
    ) {
    }
}
