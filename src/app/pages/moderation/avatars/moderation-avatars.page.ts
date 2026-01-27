import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { IonSpinner, IonButton, IonIcon } from '@ionic/angular/standalone';
import { ModerationService } from 'src/app/services/moderation/moderation.service';
import { catchError, combineLatest, map, of, switchMap } from 'rxjs';
import { AvatarComponent } from 'src/app/components/avatar/avatar.component';

@Component({
  templateUrl: './moderation-avatars.page.html',
  styleUrl: './moderation-avatars.page.scss',
  imports: [
    IonSpinner, IonButton, IonIcon,
    HeaderComponent,
    AvatarComponent,
  ]
})
export class ModerationAvatarsPage implements OnInit {

  loading = false;
  toReview?: ToReview[];

  constructor(
    public readonly i18n: I18nService,
    private readonly moderationService: ModerationService,
    private readonly changeDetector: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.changeDetector.detectChanges();
    this.moderationService.getAvatarsToReview().pipe(
      switchMap(emails => {
        if (emails.length === 0) return of([]);
        return combineLatest(emails.map(email => this.moderationService.getAvatarToReview(email).pipe(catchError(() => of(undefined)), map(blob => ({email, blob})))));
      })
    ).subscribe(toReview => {
      this.toReview = toReview.filter(e => !!e.blob) as ToReview[];
      this.loading = false;
      this.changeDetector.detectChanges();
    });
  }

  moderation(email: string, accept: boolean): void {
    this.moderationService.avatarModeration(email, accept).subscribe(() => {
      if (this.toReview) this.toReview = this.toReview.filter(e => e.email !== email);
      this.changeDetector.detectChanges();
    });
  }

}

interface ToReview {
  email: string;
  blob: Blob;
}
