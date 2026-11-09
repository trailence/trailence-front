export class BinaryContent {

  private contentType: string;
  private base64?: string;
  private blob?: Blob;
  private buffer?: ArrayBuffer;
  private uint8Array?: Uint8Array;
  private holder?: BinaryContentHolder;

  constructor(
    data: string | Blob | ArrayBuffer | Uint8Array | BinaryContentHolder,
    contentType?: string
  ) {
    if (typeof data === 'string') {
      this.base64 = data;
      if (this.base64.indexOf('\n')) { // capacitor http plugin use Android Base64.encodeToString which includes \n every 75 characters...
        this.base64 = this.base64.replaceAll('\n', '');
      }
      this.contentType = contentType ?? '';
    } else if (data instanceof Blob) {
      this.blob = data;
      this.contentType = data.type;
    } else if (data instanceof ArrayBuffer) {
      this.buffer = data;
      this.contentType = contentType ?? '';
    } else if (data instanceof Uint8Array) {
      this.uint8Array = data;
      this.contentType = contentType ?? '';
    } else if (data instanceof BinaryContentHolder) {
      this.holder = data;
      this.contentType = '';
    } else {
      throw new TypeError('Unexpected binary data type: ' + (typeof data));
    }
  }

  public static fromDataURL(url: string): BinaryContent {
    if (!url.startsWith('data:')) throw new Error('Invalid data url');
    let i = url.indexOf(';base64,');
    if (i < 0) throw new Error('Invalid data url');
    return new BinaryContent(url.substring(i + 8), url.substring(5, i));
  }

  public getContentType(): string {
    if (this.contentType === '' && this.holder?.contentType) this.contentType = this.holder.contentType() ?? '';
    return this.contentType;
  }

  public toBase64(): Promise<string> {
    if (this.base64) {
      return Promise.resolve(this.base64);
    }
    if (this.uint8Array) {
      this.base64 = BinaryContent.uint8ArrayToBase64(this.uint8Array);
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
    if (this.holder) {
      let promise: Promise<any> | undefined;
      if (this.holder.uint8Array) promise = this.toUint8Array();
      else if (this.holder.arraybuffer) promise = this.toArrayBuffer();
      else if (this.holder.blob) promise = this.toBlob();
      if (promise) return promise.then(() => this.toBase64());
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
    if (this.uint8Array) {
      this.blob = new Blob([this.uint8Array.buffer as ArrayBuffer], { type: this.contentType });
      return Promise.resolve(this.blob);
    }
    if (this.holder) {
      if (this.holder.blob) {
        const result = this.holder.blob().then(b => { this.blob = b; return b; })
        this.holder = undefined;
        return result;
      }
      if (this.holder.arraybuffer) return this.toArrayBuffer().then(() => this.toBlob());
      if (this.holder.uint8Array) return this.toUint8Array().then(() => this.toBlob());
    }
    if (this.base64) {
      this.blob = BinaryContent.b64toBlob(this.base64, this.contentType);
      return Promise.resolve(this.blob);
    }
    return Promise.reject("Unexpected data type");
  }

  public toArrayBuffer(): Promise<ArrayBuffer> {
    if (this.buffer) {
      return Promise.resolve(this.buffer);
    }
    if (this.uint8Array) {
      return Promise.resolve(this.uint8Array.buffer as ArrayBuffer);
    }
    if (this.blob) {
      return this.blob.arrayBuffer().then(buffer => {
        this.buffer = buffer;
        return buffer;
      });
    }
    if (this.holder) {
      if (this.holder.arraybuffer) {
        const result = this.holder.arraybuffer().then(a => { this.buffer = a; return a; })
        this.holder = undefined;
        return result;
      }
      if (this.holder.blob) return this.toBlob().then(() => this.toArrayBuffer());
      if (this.holder.uint8Array) return this.toUint8Array().then(() => this.toArrayBuffer());
    }
    if (this.base64) {
      this.uint8Array = Uint8Array.from(atob(this.base64), c => c.charCodeAt(0)); // NOSONAR
      this.buffer = this.uint8Array.buffer as ArrayBuffer;
      return Promise.resolve(this.buffer);
    }
    return Promise.reject("Unexpected data type");
  }

  public toUint8Array(): Promise<Uint8Array<ArrayBufferLike>> {
    if (this.uint8Array) {
      return Promise.resolve(this.uint8Array);
    }
    if (this.buffer) {
      this.uint8Array = new Uint8Array(this.buffer);
      return Promise.resolve(this.uint8Array);
    }
    if (this.base64) {
      this.uint8Array = Uint8Array.from(atob(this.base64), c => c.charCodeAt(0)); // NOSONAR
      return Promise.resolve(this.uint8Array);
    }
    if (this.holder) {
      if (this.holder.uint8Array) {
        const result = this.holder.uint8Array().then(a => { this.uint8Array = a; return a; })
        this.holder = undefined;
        return result;
      }
      if (this.holder.blob) return this.toBlob().then(() => this.toUint8Array());
      if (this.holder.arraybuffer) return this.toArrayBuffer().then(() => this.toUint8Array());
    }
    return this.toArrayBuffer().then(a => {
      this.uint8Array = new Uint8Array(a);
      return this.uint8Array;
    });
  }

  public toArrayBufferOrBlob(): Promise<ArrayBuffer | Blob> {
    if (this.buffer) return Promise.resolve(this.buffer);
    if (this.blob) return Promise.resolve(this.blob);
    if (this.uint8Array) return Promise.resolve(this.uint8Array.buffer as ArrayBuffer);
    if (this.holder) {
      if (this.holder.arraybuffer) {
        const result = this.holder.arraybuffer().then(a => { this.buffer = a; return a; });
        this.holder = undefined;
        return result;
      }
      if (this.holder.blob) {
        const result = this.holder.blob().then(a => { this.blob = a; return a; });
        this.holder = undefined;
        return result;
      }
    }
    return this.toArrayBuffer();
  }

  public toRaw(): ArrayBuffer | Blob | Uint8Array | string | undefined {
    if (this.buffer) return this.buffer;
    if (this.blob) return this.blob;
    if (this.uint8Array) return this.uint8Array;
    return this.base64;
  }

  public getSize(): number | undefined {
    if (this.buffer) return this.buffer.byteLength;
    if (this.blob) return this.blob.size;
    if (this.uint8Array) return this.uint8Array.byteLength;
    if (this.holder) {
      const s = this.holder.size?.();
      if (s !== undefined) return s;
    }
    if (this.base64) {
      this.uint8Array = Uint8Array.from(atob(this.base64), c => c.charCodeAt(0)); // NOSONAR
      return this.uint8Array.byteLength;
    }
    return undefined;
  }

  public static b64toBlob(b64Data: string, contentType: string = '', sliceSize: number = 512) {
    const byteCharacters = atob(b64Data);
    const byteArrays = [];

    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
      const slice = byteCharacters.slice(offset, offset + sliceSize);

      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i); // NOSONAR
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
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const i = dataUrl.indexOf(';base64,');
        if (i > 0) resolve(dataUrl.substring(i + 8));
        else resolve(dataUrl);
      };
      reader.readAsDataURL(blob);
    });
  }

  private bufferToBase64(buffer: ArrayBuffer) {
    return BinaryContent.uint8ArrayToBase64(new Uint8Array(buffer));
  }

  public static uint8ArrayToBase64(a: Uint8Array) {
    return btoa(a.reduce((data, byte) => {
      return data + String.fromCharCode(byte); // NOSONAR
    }, ''));
  }
}

export class BinaryContentHolder {
  constructor(
    public readonly contentType?: () => string | undefined,
    public readonly size?: () => number | undefined,
    public readonly blob?: () => Promise<Blob>,
    public readonly arraybuffer?: () => Promise<ArrayBuffer>,
    public readonly uint8Array?: () => Promise<Uint8Array>,
  ) {}
}
