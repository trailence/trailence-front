export class DataUtils {

  public static readUint16BigEndian(data: Uint8Array, offset: number): number {
    return data[offset++] * 0x100 + data[offset++];
  }

  public static readUint16LittleEndian(data: Uint8Array, offset: number): number {
    return data[offset++] + data[offset++] * 0x100;
  }

  public static readUint16(data: Uint8Array, offset: number, littleEndian: boolean): number {
    return littleEndian ? DataUtils.readUint16LittleEndian(data, offset) : DataUtils.readUint16BigEndian(data, offset); // NOSONAR
  }

  public static readUint32BigEndian(data: Uint8Array, offset: number): number {
    return data[offset++] * 0x1000000 + data[offset++] * 0x10000 + data[offset++] * 0x100 + data[offset++];
  }

  public static readUint32LittleEndian(data: Uint8Array, offset: number): number {
    return data[offset++] + data[offset++] * 0x100 + data[offset++] * 0x10000 + data[offset++] * 0x1000000;
  }

  public static readUint32(data: Uint8Array, offset: number, littleEndian: boolean): number {
    return littleEndian ? DataUtils.readUint32LittleEndian(data, offset) : DataUtils.readUint32BigEndian(data, offset); // NOSONAR
  }

}
