import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
import { BinaryContent } from 'src/app/utils/binary-content';
import { IFileService, OpenFileRequest } from './file.interface';

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
    // TODO
  }

  private tryOpenFileWithBrowserMethod<P,T>(r: OpenFileRequest<P,T>): boolean {
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
      }).then((files: FileSystemFileHandle[]) =>
        r.onstartreading(files.length)
        .then(fromStartReading => {
          const results: T[] = [];
          const readNext = (index: number) => {
            files[index].getFile().then(file => {
              file.arrayBuffer().then(fileContent => {
                r.onfileread(index, files.length, fromStartReading, fileContent)
                .then(result => {
                  results.push(result);
                  if (index === files.length - 1) {
                    setTimeout(() => r.onfilesloaded(fromStartReading, results), 0);
                  } else {
                    setTimeout(() => readNext(index + 1), 0);
                  }
                })
                .catch(e => r.onerror(e, fromStartReading));
              }).catch(e => r.onerror(e, fromStartReading));
            }).catch(e => r.onerror(e, fromStartReading));
          };
          setTimeout(() => readNext(0), 0);
        })
      )
      .catch((e: any) => r.onerror(e, undefined));
      return true;
    } catch (e) {
      return false;
    }
  }

  private tryWithHiddenInputFile<P,T>(r: OpenFileRequest<P,T>): boolean {
    const input = document.createElement('INPUT') as HTMLInputElement;
    input.type = 'file';
    input.multiple = r.multiple;
    input.accept = r.mimeType + ',' + r.extension;
    input.style.position = 'fixed';
    input.style.top = '-10000px';
    input.style.left = '-10000px';
    input.addEventListener('change', () => {
      if (input.files && input.files.length > 0) {
        r.onstartreading(input.files.length).then(fromStartReading => {
          const results: T[] = [];
          const readNext = (index: number) => {
            input.files![index].arrayBuffer().then(fileContent => {
              r.onfileread(index, input.files!.length, fromStartReading, fileContent)
              .then(result => {
                results.push(result);
                if (index === input.files!.length - 1) {
                  setTimeout(() => {
                    r.onfilesloaded(fromStartReading, results);
                    document.documentElement.removeChild(input);
                  }, 0);
                } else {
                  setTimeout(() => readNext(index + 1), 0);
                }
              })
              .catch(e => { document.documentElement.removeChild(input); r.onerror(e, fromStartReading); });
            }).catch(e => { document.documentElement.removeChild(input); r.onerror(e, fromStartReading); });
          };
          setTimeout(() => readNext(0), 0);
        }).catch((e: any) => { document.documentElement.removeChild(input); r.onerror(e, undefined); });
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
}
