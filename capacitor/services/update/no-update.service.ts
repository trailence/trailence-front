import { Injectable } from '@angular/core';
import { AppDownload } from 'src/app/services/update/common';

@Injectable({providedIn: 'root'})
export class UpdateService {

  public availableDownload?: AppDownload;

  constructor() {
    // nothing here
  }

  public downloadAndUpdate() {
    // no update
  }

}
