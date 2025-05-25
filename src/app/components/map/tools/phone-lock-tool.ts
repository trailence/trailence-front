import Trailence from 'src/app/services/trailence.service';
import { MapTool } from './tool.interface';
import { Observable } from 'rxjs';

export class PhoneLockTool extends MapTool {

  constructor(
  ) {
    super();
    this.visible = false;
    this.icon = 'phone-lock';
    this.color = () => this.enabled ? 'light' : 'dark';
    this.backgroundColor = () => this.enabled ? 'dark' : '';
    this.execute = () => {
      const newValue = !this.enabled;
      return new Observable(subscriber => {
        Trailence.setKeepOnScreenLock({enabled: newValue}).then(response => {
          if (response.success) this.enabled = newValue;
          subscriber.complete();
        });
      });
    };
  }

  public available = false;
  public enabled = false;

}
