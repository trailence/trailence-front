export async function configureWindow() {
  const jsdomModule = await import('jsdom');
  const urlModule = await import('node:url');
  const bufferModule = await import('node:buffer');
  class CustomResourceLoader extends jsdomModule.ResourceLoader {
    fetch(url: string, options: any) {
      if (url.startsWith('blob:nodedata:')) {
        return bufferModule.resolveObjectURL(url)!.arrayBuffer().then(b => bufferModule.Buffer.from(b));
      }
      return super.fetch(url, options);
    }
  }
  const jsdom = new jsdomModule.JSDOM('',{resources: new CustomResourceLoader()});
  (global as any).jsdom = jsdom;
  global.window = jsdom.window;
  global.document = window.document;
  (global as any).window.URL = urlModule.URL;
}
