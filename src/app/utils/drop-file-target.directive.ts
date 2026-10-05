import { Directive, EventEmitter, HostBinding, HostListener, Output } from '@angular/core';

@Directive({
  selector: '[dropFileTarget]',
})
export class DropFileTarget {

  @Output() filesDropped = new EventEmitter<FileList>();

  @HostBinding('class.drop-target') fileOver = false;

  @HostListener('dragenter', ['$event']) onDragEnter(evt: DragEvent) {
    evt.preventDefault();
    evt.stopPropagation();
    if (evt.dataTransfer) {
      evt.dataTransfer.dropEffect = 'copy';
    }
    this.fileOver = true;
  }

  @HostListener('dragover', ['$event']) onDragOver(evt: DragEvent) {
    this.onDragEnter(evt);
  }

  @HostListener('dragleave', ['$event']) onDragLeave(evt: DragEvent) {
    evt.preventDefault();
    evt.stopPropagation();
    this.fileOver = false;
  }

  @HostListener('drop', ['$event']) onDrop(evt: DragEvent) {
    evt.preventDefault();
    evt.stopPropagation();
    this.fileOver = false;

    const files = evt.dataTransfer?.files;
    if (files && files.length > 0) {
      this.filesDropped.emit(files);
    }
  }

}
