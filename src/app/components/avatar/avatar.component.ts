import { Component, ElementRef, Injector, Input, ChangeDetectionStrategy } from '@angular/core';
import { AvatarService } from '@trailence/services/avatar/avatar.service';
import { AbstractComponent } from '@trailence/utils/component-utils';

type State = {
  uuid?: string;
  blob?: Blob;
  name?: string;
  url?: string;
  anonymous: boolean;
  me: boolean;
};

@Component({
  selector: 'app-avatar',
  template: ``,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [],
})
export class AvatarComponent extends AbstractComponent<State> {

  @Input() uuid?: string;
  @Input() blob?: Blob;
  @Input() name?: string;
  @Input() url?: string;
  @Input() anonymous = false;
  @Input() me = false;
  @Input() pending = false;

  constructor(
    injector: Injector,
    private readonly element: ElementRef,
    private readonly avatarService: AvatarService,
  ) {
    super(injector);
  }

  protected override getComponentState(): State {
    return {uuid: this.uuid, blob: this.blob, name: this.name, url: this.url, anonymous: this.anonymous, me: this.me};
  }

  protected override onComponentStateChanged(): void {
    while (this.element.nativeElement.children.length > 0) this.element.nativeElement.children.item(0).remove();
    if (this.blob) {
      this.element.nativeElement.appendChild(this.avatarService.generateFromBlob(this.blob));
    } else if (this.uuid) {
      this.byStateAndVisible.subscribe(this.avatarService.getAvatarByUuid$(this.uuid),
        avatar => {
          while (this.element.nativeElement.children.length > 0) this.element.nativeElement.children.item(0).remove();
          this.element.nativeElement.appendChild(avatar);
        }
      );
    } else if (this.me) {
      this.byStateAndVisible.subscribe(
        this.pending ? this.avatarService.getMyPendingAvatar$() : this.avatarService.getMyAvatar$(),
        avatar => {
          while (this.element.nativeElement.children.length > 0) this.element.nativeElement.children.item(0).remove();
          this.element.nativeElement.appendChild(avatar);
        }
      );
    } else if (this.name && this.name.length > 0) {
      this.element.nativeElement.appendChild(this.avatarService.generateFromName(this.name));
    } else if (this.url && this.url.length > 0) {
      this.element.nativeElement.appendChild(this.avatarService.generateFromUrl(this.url));
    } else {
      this.element.nativeElement.appendChild(this.avatarService.generateAnonymous());
    }
  }

}
