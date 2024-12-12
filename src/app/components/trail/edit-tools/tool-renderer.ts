import { Component, Input, OnChanges, SimpleChanges, Type, ViewContainerRef } from '@angular/core';
import { EditTool } from './tool.interface';
import { EditToolsComponent } from './edit-tools.component';

@Component({
  selector: 'app-edit-tool-inline-renderer',
  template: ''
})
export class ToolRenderer implements OnChanges {

  @Input() type!: Type<EditTool>
  @Input() editTools!: EditToolsComponent;
  @Input() callback?: (tool: EditTool) => void;

  tool?: EditTool;

  constructor(private readonly viewContainer: ViewContainerRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    this.viewContainer.clear();
    const ref = this.viewContainer.createComponent(this.type);
    ref.setInput('editTools', this.editTools);
    this.tool = ref.instance;
    if (this.callback) this.callback(this.tool);
    setTimeout(() => this.editTools.changesDetector.detectChanges(), 0);
  }

}
