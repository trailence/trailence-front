import { BinaryContent } from "src/app/utils/binary-content";

export interface IFileService {

    openFileDialog<P, T>(request: OpenFileRequest<P, T>): void;

    saveBinaryData(filename: string, data: BinaryContent): Promise<boolean>;

    saveZip(filename: string, contentProvider: () => Promise<{ filename: string; data: BinaryContent; } | null>): Promise<boolean>;

}

export class OpenFileRequest<P, T> {
    constructor(
      public description: string,
      public types: FileType[],
      public multiple: boolean,
      public onstartreading: (nbFiles: number) => Promise<P>,
      public onfileread: (index: number, nbFiles: number, fromStartReading: P, fileName: string, fileContent: ArrayBuffer) => Promise<T>,
      public ondone: (fromStartReading: P | undefined, results: T[], errors: any[]) => void,
    ) {
    }
}

export interface FileType {
  mime: string;
  extensions: string[];
}
