export async function configureWindow() {
  const jsdomModule = await import('jsdom');
  const urlModule = await import('node:url');
  const canvasModule = await import('canvas');
  const bufferModule = await import('node:buffer');
  /*
  class CustomResourceLoader extends jsdomModule.ResourceLoader {
    override fetch(url: string, options: any) {
      if (url.startsWith('blob:nodedata:')) {
        return bufferModule.resolveObjectURL(url)!.arrayBuffer().then(b => bufferModule.Buffer.from(b)) as any;
      }
      return super.fetch(url, options);
    }
  }
  const jsdom = new jsdomModule.JSDOM('',{resources: new CustomResourceLoader()});
  */
  const jsdom = new jsdomModule.JSDOM('');
  (global as any).jsdom = jsdom;
  global.window = jsdom.window as any;
  global.document = window.document;
  (global as any).window.URL = urlModule.URL;
  global.createImageBitmap = async function(blob) {
    return (await canvasModule.loadImage(bufferModule.Buffer.from(await (blob as Blob).arrayBuffer()))) as unknown as ImageBitmap;
  };
  (global as any).OffscreenCanvas = canvasModule.Canvas;
  (canvasModule.Canvas as any).prototype.convertToBlob = async function(options: {type: 'image/jpeg', quality: number}) {
    const stream = (this as any).createJPEGStream({quality: options.quality}) as ReadableStream;
    return await new Response(stream).blob();
  };
}
