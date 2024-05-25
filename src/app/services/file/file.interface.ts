import { BinaryContent } from "src/app/utils/binary-content";

export interface IFileService {

    openFileDialog(request: OpenFileRequest): void;

    saveBinaryData(filename: string, data: BinaryContent): Promise<boolean>;

}

export class OpenFileRequest {
    constructor(
      public description: string,
      public mimeType: string,
      public extension: string,
      public multiple: boolean,
      public onreading: () => Promise<any>,
      public onloaded: (content: ArrayBuffer[], fromOnreading: any) => void,
      public onerror: (error: any, fromOnreading?: any) => void
    ) {
    }
}