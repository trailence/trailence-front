import { ChangeDetectorRef, Component, Injector } from '@angular/core';
import { distinctUntilChanged } from 'rxjs';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { environment } from 'src/environments/environment';
import { PublicPage } from '../public.page';
import { HttpClient } from '@angular/common/http';

@Component({
  template: `
    <app-header [title]="title"></app-header>
    <div class="pp-page-container">
      @if (page) { <div class="pp-page-content" [innerHTML]="page"></div> }
    </div>
  `,
  styles: `
.pp-page-container {
  height: 100%;
  width: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: var(--centered-outside-background);
}
.pp-page-content {
  padding: 10px;
  max-width: 800px;
  width: min(800px, 100%);
  background-color: var(--centered-inside-background);
}
::ng-deep div.pp-page-content {
  font-size: 14px;
  line-height: 1.4;
  h2 {
    font-size: 18px;
    font-weight: bold;
  }
  ul {
    li {
      margin-bottom: 8px;
    }
  }
}
  `,
  imports: [
    HeaderComponent
  ]
})
export class PrivacyPolicyPage extends PublicPage {

  title = '';
  page?: string;

  constructor(injector: Injector) { super(injector); }

  protected override initComponent(): void {
    this.whenVisible.subscribe(
      this.injector.get(I18nService).langLoaded$.pipe(
        distinctUntilChanged(),
      ),
      lang => {
        this.title = this.injector.get(I18nService).texts.pages.privacy_policy.title;
        this.page = undefined;
        this.injector.get(ChangeDetectorRef).detectChanges();
        this.injector.get(HttpClient).get(environment.assetsUrl + '/privacy-policy.3.' + lang + '.html', {responseType: 'text'})
        .subscribe(html => {
          this.page = html;
          this.injector.get(ChangeDetectorRef).detectChanges();
        });
      }
    );
  }

}
