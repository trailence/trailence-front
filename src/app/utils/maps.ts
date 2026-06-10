export class Maps {

  public static push<K, V>(key: K, value: V, map: Map<K, V[]>) {
    const list = map.get(key);
    if (list === undefined) {
      map.set(key, [value]);
    } else {
      list.push(value);
    }
  }

  public static increment<K>(key: K, map: Map<K, number>, increment = 1): void {
    if (map.has(key)) map.set(key, map.get(key)! + increment);
    else map.set(key, increment);
  }

  public static decrement<K>(key: K, map: Map<K, number>, decrement = 1): void {
    const counter = map.get(key);
    if (counter === undefined) return;
    if (counter <= decrement) map.delete(key);
    else map.set(key, counter - decrement);
  }

}
