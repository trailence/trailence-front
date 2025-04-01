import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { ThemeType } from 'src/app/services/preferences/preferences';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { IonButton, IonIcon } from '@ionic/angular/standalone';

@Component({
  selector: 'app-language-bar',
  template: `
<div *ngIf="currentLanguage" class="center">
  <div (click)="setLanguage('en')" *ngIf="currentLanguage !== 'en'" class="lang-button">
    <img src="/assets/i18n/en.1.png"/>
    English
  </div>
  <div (click)="setLanguage('fr')" *ngIf="currentLanguage !== 'fr'" class="lang-button">
    <img src="/assets/i18n/fr.1.png"/>
    Français
  </div>
</div>
<div class="center">
  <ion-button fill="clear" color="medium" (click)="switchTheme()"><ion-icon slot="icon-only" [name]="currentTheme === 'LIGHT' ? 'theme-dark' : 'theme-light'"></ion-icon></ion-button>
</div>
  `,
  styles: `
  div.center { display: flex; flex-direction: row; align-items: center; justify-content: center; }
  div.lang-button { cursor: pointer; }
  `,
  imports: [CommonModule, IonButton, IonIcon]
})
export class LanguageBarComponent implements OnInit, OnDestroy {

  constructor(
    private readonly preferences: PreferencesService,
  ) {
    this.currentTheme = preferences.getResolvedTheme();
  }

  currentLanguage?: string;
  currentTheme: ThemeType;
  private preferencesSubscription?: Subscription;
  private destroyed = false;

  ngOnInit(): void {
    setTimeout(() => {
      if (this.destroyed) return;
      this.preferencesSubscription = this.preferences.preferences$.subscribe(p => this.currentLanguage = p.lang);
    }, 100);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.preferencesSubscription?.unsubscribe();
  }

  setLanguage(lang: string): void {
    this.preferences.setLanguage(lang);
  }

  switchTheme(): void {
    const newTheme = this.currentTheme === 'LIGHT' ? 'DARK' : 'LIGHT';
    this.preferences.setTheme(newTheme);
    this.currentTheme = newTheme;
  }

}
