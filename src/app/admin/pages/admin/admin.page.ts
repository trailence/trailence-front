import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonRouterOutlet, IonSegment, IonSegmentButton } from '@ionic/angular/standalone';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { I18nAdminService } from '../../services/i18n-admin.service';
import { CommonModule } from '@angular/common';
import { I18nPipe } from 'src/app/services/i18n/i18n-string';

@Component({
  selector: 'app-admin-page',
  templateUrl: './admin.page.html',
  styleUrl: './admin.page.scss',
  imports: [
    CommonModule,
    HeaderComponent,
    I18nPipe,
    IonRouterOutlet, IonSegment, IonSegmentButton,
  ]
})
export class AdminPage implements OnInit {

  ready = false;

  constructor(
    private readonly router: Router,
    private readonly i18nAdmin: I18nAdminService,
    private readonly changeDetector: ChangeDetectorRef,
  ) {
  }

  ngOnInit(): void {
    this.i18nAdmin.ready$.subscribe(r => {
      this.ready = r;
      this.changeDetector.detectChanges();
    });
  }

  getCurrentPage(): string {
    let url = this.router.url;
    if (!url.startsWith('/admin/')) return '';
    url = url.substring(7);
    const i = url.indexOf('/');
    if (i > 0) url = url.substring(0, i);
    return url;
  }
}
