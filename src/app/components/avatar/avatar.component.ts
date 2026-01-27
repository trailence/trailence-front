import { Component, ElementRef, Injector, Input, OnChanges, SimpleChanges } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AvatarService } from 'src/app/services/avatar/avatar.service';
import { AbstractComponent } from 'src/app/utils/component-utils';

@Component({
  selector: 'app-avatar',
  template: ``,
  imports: [],
})
export class AvatarComponent extends AbstractComponent {

  @Input() uuid?: string;
  @Input() blob?: Blob;
  @Input() pending = false;

  constructor(
    injector: Injector,
    private readonly element: ElementRef,
    private readonly avatarService: AvatarService,
  ) {
    super(injector);
  }

  protected override getComponentState() {
    return {uuid: this.uuid, blob: this.blob};
  }

  protected override onComponentStateChanged(previousState: any, newState: any): void {
    if (this.blob) {
      while (this.element.nativeElement.children.length > 0) this.element.nativeElement.children.item(0).remove();
      this.element.nativeElement.appendChild(this.avatarService.generateFromBlob(this.blob));
    } else {
      this.byStateAndVisible.subscribe(
        this.uuid ?
          this.avatarService.getAvatarByUuid$(this.uuid) :
          this.pending ? this.avatarService.getMyPendingAvatar$() : this.avatarService.getMyAvatar$(),
        avatar => {
          while (this.element.nativeElement.children.length > 0) this.element.nativeElement.children.item(0).remove();
          this.element.nativeElement.appendChild(avatar);
        }
      );
    }
  }

}
