import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { IonSpinner, IonIcon, IonButton, IonCheckbox } from '@ionic/angular/standalone';
import { ModerationService } from 'src/app/services/moderation/moderation.service';
import { Console } from 'src/app/utils/console';
import { from, map, of, switchMap } from 'rxjs';
import { FetchSourceService } from 'src/app/services/fetch-source/fetch-source.service';
import { Trail } from 'src/app/model/trail';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  templateUrl: './moderation-remove-requests.page.html',
  styleUrl: './moderation-remove-requests.page.scss',
  imports: [
    HeaderComponent,
    IonSpinner, IonIcon, IonButton, IonCheckbox,
    RouterLink, FormsModule,
  ]
})
export class ModerationRemoveRequestsPage implements OnInit {

  loading = false;
  requests?: RemoveRequest[];

  constructor(
    public readonly i18n: I18nService,
    private readonly moderationService: ModerationService,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly fetchSourceService: FetchSourceService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.requests = undefined;
    this.moderationService.getRemoveRequests().pipe(
      switchMap(list => {
        if (list.length === 0) return of([]);
        return this.fetchSourceService.waitReady$().pipe(
          switchMap(() => from(this.fetchSourceService.getPluginByName('Trailence')?.getTrails(list.map(e => e.uuid)) ?? Promise.resolve([]))),
          map(trails => {
            return trails.map(t => {
              const request = list.find(r => r.uuid === t.uuid)!;
              return {trail: t, author: request.author, message: request.message} as RemoveRequest;
            });
          }),
        );
      })
    )
    .subscribe({
      next: list => {
        this.loading = false;
        this.requests = list;
        this.changeDetector.detectChanges();
      },
      error: e => {
        this.loading = false;
        Console.error('Error loading remove requests', e);
        this.changeDetector.detectChanges();
      },
    });
  }

  getSelection(): string[] {
    return this.requests?.filter(r => r.selected).map(r => r.trail.uuid) ?? [];
  }

  declineRequests(): void {
    this.loading = true;
    this.moderationService.declineRemoveRequests(this.getSelection()).subscribe({
      complete: () => this.load(),
      error: e => {
        Console.error('Error declining remove requests', e);
        this.loading = false;
      }
    });
  }

  acceptRequests(): void {
    this.moderationService.acceptRemoveRequests(this.getSelection()).subscribe({
      complete: () => this.load(),
      error: e => {
        Console.error('Error accepting remove requests', e);
        this.loading = false;
      }
    });
  }
}

interface RemoveRequest {
  trail: Trail;
  author: string;
  message: string;
  selected?: boolean;
}
