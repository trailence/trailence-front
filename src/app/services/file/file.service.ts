import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular/standalone';
import { BinaryContent } from 'src/app/utils/binary-content';
import { IFileService, OpenFileRequest } from './file.interface';
import * as JSZip from 'jszip';
import { Arrays } from 'src/app/utils/arrays';

@Injectable({
  providedIn: 'root'
})
export class FileService implements IFileService {

  constructor(
    private platform: Platform
  ) {
  }

  public openFileDialog<P,T>(request: OpenFileRequest<P,T>): void {
    if (this.tryOpenFileWithBrowserMethod(request)) {
      return;
    }
    if (this.tryWithHiddenInputFile(request)) {
      return;
    }
  }

  private tryOpenFileWithBrowserMethod<P,T>(r: OpenFileRequest<P,T>): boolean {
    if (!this.platform.is('desktop') && !this.platform.is('mobileweb')) {
      return false;
    }
    if (typeof (window as any).showOpenFilePicker !== 'function') {
      return false;
    }
    const accept: any = {};
    for (const type of r.types) {
      accept[type.mime] = type.extensions.map(ext => '.' + ext);
    }
    try {
      (window as any).showOpenFilePicker({
        types: [{description: r.description, accept}],
        multiple: r.multiple
      }).then((files: FileSystemFileHandle[]) =>
        r.onstartreading(files.length)
        .then(fromStartReading => {
          const results: T[] = [];
          const errors: any[] = [];
          const readNext = (index: number) => {
            const onerror = (e: any) => {
              errors.push(e);
              if (index === files.length - 1) {
                setTimeout(() => r.ondone(fromStartReading, results, errors), 0);
              } else {
                setTimeout(() => readNext(index + 1), 0);
              }
            };
            files[index].getFile()
            .then(file => {
              file.arrayBuffer().then(fileContent => {
                r.onfileread(index, files.length, fromStartReading, files[index].name, fileContent)
                .then(result => {
                  results.push(result);
                  if (index === files.length - 1) {
                    setTimeout(() => r.ondone(fromStartReading, results, errors), 0);
                  } else {
                    setTimeout(() => readNext(index + 1), 0);
                  }
                })
                .catch(onerror);
              }).catch(onerror);
            }).catch(onerror);
          };
          setTimeout(() => readNext(0), 0);
        })
      )
      .catch((e: any) => r.ondone(undefined, [], [e]));
      return true;
    } catch (e) {
      return false;
    }
  }

  private tryWithHiddenInputFile<P,T>(r: OpenFileRequest<P,T>): boolean {
    const input = document.createElement('INPUT') as HTMLInputElement;
    input.type = 'file';
    input.multiple = r.multiple;
    input.accept = [...r.types.map(t => t.mime), ...Arrays.flatMap(r.types, t => t.extensions.map(ext => '.' + ext))].join(',');
    input.style.position = 'fixed';
    input.style.top = '-10000px';
    input.style.left = '-10000px';
    input.addEventListener('change', () => {
      if (input.files && input.files.length > 0) {
        r.onstartreading(input.files.length).then(fromStartReading => {
          const results: T[] = [];
          const errors: any[] = [];
          const readNext = (index: number) => {
            const onerror = (e: any) => {
              document.documentElement.removeChild(input);
              errors.push(e);
              if (index === input.files!.length - 1) {
                setTimeout(() => r.ondone(fromStartReading, results, errors), 0);
              } else {
                setTimeout(() => readNext(index + 1), 0);
              }
            };
            input.files![index].arrayBuffer().then(fileContent => {
              r.onfileread(index, input.files!.length, fromStartReading, input.files![index].name, fileContent)
              .then(result => {
                results.push(result);
                if (index === input.files!.length - 1) {
                  setTimeout(() => {
                    r.ondone(fromStartReading, results, errors);
                    document.documentElement.removeChild(input);
                  }, 0);
                } else {
                  setTimeout(() => readNext(index + 1), 0);
                }
              })
              .catch(onerror);
            }).catch(onerror);
          };
          setTimeout(() => readNext(0), 0);
        }).catch((e: any) => { document.documentElement.removeChild(input); r.ondone(undefined, [], [e]); });
      }
    });
    document.documentElement.appendChild(input);
    const click = new MouseEvent('click');
    input.dispatchEvent(click);
    return true;
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

  public saveZip(filename: string, contentProvider: () => Promise<{ filename: string; data: BinaryContent; } | null>): Promise<boolean> {
    return this.internalSaveZip(filename, contentProvider);
  }

  private async internalSaveZip(filename: string, contentProvider: () => Promise<{ filename: string; data: BinaryContent; } | null>) {
    const zip = new JSZip();
    let nextFile: { filename: string; data: BinaryContent; } | null;
    while ((nextFile = await contentProvider()) !== null) {
      const data = nextFile.data.toRaw();
      zip.file(nextFile.filename, data, {
        base64: typeof data === 'string',
        binary: true
      });
    }
    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
    });
    return await this.saveBinaryData(filename, new BinaryContent(blob));
  }
}
