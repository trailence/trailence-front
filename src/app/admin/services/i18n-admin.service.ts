import { Injectable } from '@angular/core';
import { BehaviorSubject, filter, first } from 'rxjs';
import { I18nService } from 'src/app/services/i18n/i18n.service';

const TEXTS_VERSION = '2';

@Injectable({providedIn: 'root'})
export class I18nAdminService {

  ready$ = new BehaviorSubject<boolean>(false);

  constructor(
    i18n: I18nService,
  ) {
    i18n.loadAdditionalTexts('/admin/i18n', TEXTS_VERSION, 'admin');
    i18n.texts$.pipe(
      filter(t => !!t['admin']),
      first()
    ).subscribe(() => this.ready$.next(true));
  }

}
