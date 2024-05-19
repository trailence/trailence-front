export class XmlUtils {

  public static getChild(parent: Element, childName: string): Element | null {
    for (let i = 0; i < parent.children.length; ++i) {
      const child = parent.children.item(i)!;
      if (child.nodeName === childName) {
        return child;
      }
    }
    return null;
  }

  public static getChildren(parent: Element, childName: string): Element[] {
    const result: Element[] = [];
    for (let i = 0; i < parent.children.length; ++i) {
      const child = parent.children.item(i)!;
      if (child.nodeName === childName) {
        result.push(child);
      }
    }
    return result;
  }

  public static getChildText(parent: Element, childName: string): string | undefined {
    const child = this.getChild(parent, childName);
    if (child?.textContent) {
      return child.textContent;
    }
    return undefined;
  }

}
