import { BinaryContent } from "src/app/utils/binary-content";

export interface IFileService {

    openFileDialog<P, T>(request: OpenFileRequest<P, T>): void;

    saveBinaryData(filename: string, data: BinaryContent): Promise<boolean>;

}

export class OpenFileRequest<P, T> {
    constructor(
      public description: string,
      public mimeType: string,
      public extension: string,
      public multiple: boolean,
      public onstartreading: (nbFiles: number) => Promise<P>,
      public onfileread: (index: number, nbFiles: number, fromStartReading: P, fileContent: ArrayBuffer) => Promise<T>,
      public onfilesloaded: (fromStartReading: P, results: T[]) => void,
      public onerror: (error: any, fromStartReading?: P) => void
    ) {
    }
}
