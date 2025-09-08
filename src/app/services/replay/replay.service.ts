import { Injectable } from '@angular/core';
import { Trail } from 'src/app/model/trail';

@Injectable({
  providedIn: 'root'
})
export class ReplayService {

  public readonly canReplay = false;

  public replay(trackUuid: string, owner: string, following?: Trail, speed: number = 50, approximative: boolean = false, originalTime: boolean = false): void {
    // nothing
  }

}
