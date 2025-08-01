import { MapTool } from './tool.interface';
import { Observable } from 'rxjs';
import { ScreenLockService } from 'src/app/services/screen-lock/screen-lock.service';

export class PhoneLockTool extends MapTool {

  constructor(
    service: ScreenLockService
  ) {
    super();
    this.visible = false;
    this.icon = 'phone-lock';
    this.color = () => this.enabled ? 'light' : 'dark';
    this.backgroundColor = () => this.enabled ? 'dark' : '';
    this.execute = () => {
      const newValue = !this.enabled;
      return new Observable(subscriber => {
        service.set(newValue).then(result => {
          this.enabled = result;
          subscriber.complete();
        });
      });
    };
  }

  public available = false;
  public enabled = false;

}
