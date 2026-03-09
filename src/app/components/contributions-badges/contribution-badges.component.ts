import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { IonIcon } from '@ionic/angular/standalone';
import { Subscription } from 'rxjs';
import { AuthService } from 'src/app/services/auth/auth.service';
import { Contributions, ContributionService } from 'src/app/services/contribution/contribution.service';
import { TrailInfo } from 'src/app/services/fetch-source/fetch-source.interfaces';
import { I18nService } from 'src/app/services/i18n/i18n.service';

@Component({
  selector: 'app-contributions-badges',
  templateUrl: './contribution-badges.component.html',
  styleUrl: './contribution-badges.component.scss',
  imports: [
    IonIcon
  ]
})
export class ContributionsBadgesComponent implements OnInit, OnChanges, OnDestroy {

  @Input() trailInfo?: TrailInfo;
  @Input() contrib?: Contributions;
  @Input() showLevel = true;

  contributions?: Contributions;
  badge1?: SafeHtml;
  badge2?: SafeHtml;
  badge3?: SafeHtml;
  level1?: string;
  level2?: string;
  level3?: string;
  private authSubscription?: Subscription;

  constructor(
    private readonly contributionsService: ContributionService,
    private readonly authService: AuthService,
    private readonly sanitizer: DomSanitizer,
    public readonly i18n: I18nService,
  ) {}

  ngOnInit(): void {
    this.ngOnChanges({});
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.trailInfo) {
      this.authSubscription?.unsubscribe();
      this.authSubscription = undefined;
      this.setContributions(this.contributionsService.fromTrailInfo(this.trailInfo));
    } else if (this.contrib) {
      this.authSubscription?.unsubscribe();
      this.authSubscription = undefined;
      this.setContributions(this.contrib);
    } else {
      this.authSubscription ??= this.authService.auth$.subscribe(a => this.setContributions(this.contributionsService.fromAuth(a)));
    }
  }

  ngOnDestroy(): void {
    this.authSubscription?.unsubscribe();
  }

  private setContributions(c: Contributions): void {
    this.contributions = c;
    this.badge1 = this.getBadge(c.nbPublications);
    this.badge2 = this.getBadge(c.nbRates);
    this.badge3 = this.getBadge(c.nbComments);
    this.level1 = this.contributionsService.getPublicationLevel(c.nbPublications);
    this.level2 = this.contributionsService.getRatingLevel(c.nbRates);
    this.level3 = this.contributionsService.getReviewLevel(c.nbComments);
  }

  private getBadge(nb: number): SafeHtml | undefined {
    if (nb === 0) return undefined;
    let fontSize;
    if (nb < 100) fontSize = 18;
    else if (nb < 1000) fontSize = 16;
    else fontSize = 14;
    return this.sanitizer.bypassSecurityTrustHtml(
       `<?xml version="1.0" encoding="utf-8"?>
<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M24 4L29.2533 7.83204L35.7557 7.81966L37.7533 14.0077L43.0211 17.8197L41 24L43.0211 30.1803L37.7533 33.9923L35.7557 40.1803L29.2533 40.168L24 44L18.7467 40.168L12.2443 40.1803L10.2467 33.9923L4.97887 30.1803L7 24L4.97887 17.8197L10.2467 14.0077L12.2443 7.81966L18.7467 7.83204L24 4Z" fill="#1060D0" stroke="none" stroke-linecap="round" stroke-linejoin="round"/>
<text x="24" y="26" font-size="${fontSize}px" fill="#e0e0e0" stroke="none" dominant-baseline="middle" text-anchor="middle" font-family="Verdana, Tahoma, sans-serif">${nb}</text>
</svg>`
       );
  }

}
