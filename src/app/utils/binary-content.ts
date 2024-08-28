export class BinaryContent {

  private contentType: string;
  private base64?: string;
  private blob?: Blob;
  private buffer?: ArrayBuffer;

  constructor(
    data: string | Blob | ArrayBuffer,
    contentType?: string
  ) {
    if (typeof data === 'string') {
      this.base64 = data;
      if (this.base64.indexOf('\n')) { // capacitor http plugin use Android Base64.encodeToString which includes \n every 75 characters...
        this.base64 = this.base64.replace(/\n/g, '');
      }
      this.contentType = contentType ? contentType : '';
    } else if (data instanceof Blob) {
      this.blob = data;
      this.contentType = data.type;
    } else if (data instanceof ArrayBuffer) {
      this.buffer = data;
      this.contentType = contentType ? contentType : '';
    } else {
      throw new Error('Unexpected binary data type: ' + (typeof data));
    }
  }

  public getContentType(): string {
    return this.contentType;
  }

  public toBase64(): Promise<string> {
    if (this.base64) {
      return Promise.resolve(this.base64);
    }
    if (this.blob) {
      return this.blobToBase64(this.blob)
        .then(base64 => {
          this.base64 = base64;
          return base64;
        });
    }
    if (this.buffer) {
      this.base64 = this.bufferToBase64(this.buffer);
      return Promise.resolve(this.base64);
    }
    return Promise.reject("Unknown data type");
  }

  public toBlob(): Promise<Blob> {
    if (this.blob) {
      return Promise.resolve(this.blob);
    }
    if (this.buffer) {
      this.blob = new Blob([this.buffer], { type: this.contentType });
      return Promise.resolve(this.blob);
    }
    if (this.base64) {
      this.blob = this.b64toBlob(this.base64, this.contentType);
      return Promise.resolve(this.blob);
    }
    return Promise.reject("Unexpected data type");
  }

  public toArrayBuffer(): Promise<ArrayBuffer> {
    if (this.buffer) {
      return Promise.resolve(this.buffer);
    }
    if (this.blob) {
      return this.blob.arrayBuffer().then(buffer => {
        this.buffer = buffer;
        return buffer;
      });
    }
    if (this.base64) {
      this.buffer = Uint8Array.from(atob(this.base64), c => c.charCodeAt(0));
      return Promise.resolve(this.buffer);
    }
    return Promise.reject("Unexpected data type");
  }

  public toArrayBufferOrBlob(): Promise<ArrayBuffer | Blob> {
    if (this.buffer) return Promise.resolve(this.buffer);
    if (this.blob) return Promise.resolve(this.blob);
    return this.toArrayBuffer();
  }

  public toRaw(): ArrayBuffer | Blob | string {
    if (this.buffer) return this.buffer;
    if (this.blob) return this.blob;
    return this.base64!;
  }

  private b64toBlob(b64Data: string, contentType: string = '', sliceSize: number = 512) {
    const byteCharacters = atob(b64Data);
    const byteArrays = [];

    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
      const slice = byteCharacters.slice(offset, offset + sliceSize);

      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }

      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }

    const blob = new Blob(byteArrays, { type: contentType });
    return blob;
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, _) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  }

  private bufferToBase64(buffer: ArrayBuffer) {
    return btoa(new Uint8Array(buffer).reduce((data, byte) => {
      return data + String.fromCharCode(byte);
    }, ''));
  }
}
