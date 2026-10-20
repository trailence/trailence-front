import { ToWeblate, TranslationMetadata } from './file-format';
import fs from 'node:fs';
import xmlescape from 'xml-escape';

export class XLiffWriter extends ToWeblate {

  private _file = '';

  public override start(): void {
    this._file = '<?xml version="1.0" encoding="UTF-8"?>\n<xliff xmlns="urn:oasis:names:tc:xliff:document:1.1">\n';
    this._file += '<file original="Trailence" product-name="Trailence" source-language="en-US" target-language="' + this.targetLanguage.isoCode + '" datatype="javascript"';
    this._file += '>\n<body>\n';
  }

  public override end(): void {
    this._file += '</body></file>\n</xliff>';
    fs.writeFileSync(this.targetFilename, this._file, { encoding: 'utf-8' });
  }

  public override addTranslation(path: string, english: string, target: string | undefined, metadata: TranslationMetadata | undefined): void {
    this._file += '<trans-unit resname="' + path + '">\n';
    this._file += '  <source xml:space="preserve">';
    this._file += xmlescape(english);
    this._file += '</source>\n';
    if (target !== undefined) {
      this._file += '  <target xml:space="preserve">';
      this._file += xmlescape(target);
      this._file += '</target>\n';
    }
    this._file += '</trans-unit>\n';
  }

}
