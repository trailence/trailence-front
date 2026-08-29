import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AppDownload } from 'src/app/services/update/common';

@Injectable({providedIn: 'root'})
export class UpdateService {

  public availableDownload$ = new BehaviorSubject<AppDownload | undefined>(undefined);

  constructor() {
    // nothing here
  }

  public downloadAndUpdate() {
    // no update
  }

}
