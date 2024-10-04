export class Maps {

  public static push<K, V>(key: K, value: V, map: Map<K, V[]>) {
    const list = map.get(key);
    if (list !== undefined) {
      list.push(value);
    } else {
      map.set(key, [value]);
    }
  }

  public static increment<K>(key: K, map: Map<K, number>): void {
    if (map.has(key)) map.set(key, map.get(key)! + 1);
    else map.set(key, 1);
  }

  public static decrement<K>(key: K, map: Map<K, number>): void {
    const counter = map.get(key);
    if (counter === undefined) return;
    if (counter === 1) map.delete(key);
    else map.set(key, counter - 1);
  }

}
