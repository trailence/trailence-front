import { BinaryContent } from './binary-content';

describe('Binary Content', () => {

  async function check(b: BinaryContent, expectedType: string) {
    const a = await b.toArrayBuffer();
    expect(a.byteLength).toBe(8);
    const bytes = new Uint8Array(a);
    expect(bytes.at(0)).toBe(1);
    expect(bytes.at(1)).toBe(2);
    expect(bytes.at(2)).toBe(3);
    expect(bytes.at(3)).toBe(4);
    expect(bytes.at(4)).toBe(10);
    expect(bytes.at(5)).toBe(20);
    expect(bytes.at(6)).toBe(30);
    expect(bytes.at(7)).toBe(40);
    expect(b.getContentType()).toBe(expectedType);
  }

  it('Conversions', async () => {
    try {
      new BinaryContent({} as any, 'application/test');
      expect(true).toBeFalse();
    } catch (error) {
      // ok
    }

    const data = new Uint8Array([1, 2, 3, 4, 10, 20, 30, 40]);
    // from Uint8Array
    const b = new BinaryContent(data, 'application/test');
    const base64 = await b.toBase64();
    const bcBase64 = new BinaryContent(base64);
    await check(bcBase64, '');
    const blob = await b.toBlob();
    const bcBlob = new BinaryContent(blob);
    await check(bcBlob, 'application/test');
    const arrayBuffer = await b.toArrayBuffer();
    const bcArrayBuffer = new BinaryContent(arrayBuffer);
    await check(bcArrayBuffer, '');
    // from array buffer
    await check(new BinaryContent(await bcArrayBuffer.toBase64(), 'a/b'), 'a/b');
    await check(new BinaryContent(await bcArrayBuffer.toArrayBuffer(), 'b/c'), 'b/c');
    await check(new BinaryContent(await bcArrayBuffer.toUint8Array(), 'b/c2'), 'b/c2');
    await check(new BinaryContent(await bcArrayBuffer.toBlob(), 'c/d'), '');
    // from base64
    await check(new BinaryContent(await bcBase64.toBase64(), 'a/b'), 'a/b');
    await check(new BinaryContent(await bcBase64.toArrayBuffer(), 'b/c'), 'b/c');
    await check(new BinaryContent(await bcBase64.toUint8Array(), 'b/c2'), 'b/c2');
    await check(new BinaryContent(await bcBase64.toBlob(), 'c/d'), '');
    // from blob
    await check(new BinaryContent(await bcBlob.toBase64(), 'a/b'), 'a/b');
    await check(new BinaryContent(await bcBlob.toArrayBuffer(), 'b/c'), 'b/c');
    await check(new BinaryContent(await bcBlob.toUint8Array(), 'b/c2'), 'b/c2');
    await check(new BinaryContent(await bcBlob.toBlob(), 'c/d'), 'application/test');
  });

});
