import { Color } from './color';

describe('Color', () => {

  it('Color in hexa', () => {
    const c = new Color('#01A5f9');
    expect(c.r).toBe(1);
    expect(c.g).toBe(0xA5);
    expect(c.b).toBe(0xf9);
    expect(c.a).toBe(1);
    expect(c.toString()).toBe('rgb(1,' + 0xA5 + ',' + 0xf9 + ')');
  });

  it('Color in rgb', () => {
    const c = new Color('rgb(129,3,250)');
    expect(c.r).toBe(129);
    expect(c.g).toBe(3);
    expect(c.b).toBe(250);
    expect(c.a).toBe(1);
    expect(c.toString()).toBe('rgb(129,3,250)');
  });

  it('Color in rgba', () => {
    const c = new Color('rgba(1,2,3,0.25)');
    expect(c.r).toBe(1);
    expect(c.g).toBe(2);
    expect(c.b).toBe(3);
    expect(c.a).toBe(0.25);
    expect(c.toString()).toBe('rgba(1,2,3,0.25)');
  });

  it('Change color', () => {
    const c = new Color('rgba(1,2,3,0.25)');
    c.setRed(10);
    c.setGreen(20);
    c.setBlue(30);
    c.setAlpha(0.66);
    expect(c.toString()).toBe('rgba(10,20,30,0.66)');
  });

});
