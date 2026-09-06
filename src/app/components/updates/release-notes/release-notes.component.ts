import { Component, Input, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { HttpService } from '@trailence/services/http/http.service';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { PreferencesService } from '@trailence/services/preferences/preferences.service';
import { StringUtils } from '@trailence/utils/string-utils';
import { environment } from '@env/environment';
import { IonSpinner } from "@ionic/angular";

interface ReleaseLanguage {
  message?: string;
  items?: string[];
}

type Release = {[key: string]: ReleaseLanguage};
type Releases = {[key:string]: Release};

interface ReleaseNote {
  code: number;
  version: string;
  languages: Release;
}

@Component({
  selector: 'app-release-notes',
  templateUrl: './release-notes.component.html',
  styleUrl: './release-notes.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    IonSpinner,
  ]
})
export class ReleaseNotesComponent implements OnInit {

  @Input() sinceVersion!: number;

  releases?: ReleaseNote[];

  constructor(
    public readonly prefs: PreferencesService,
    public readonly i18n: I18nService,
    private readonly http: HttpService,
  ) {}

  ngOnInit(): void {
    this.http.get<Releases>(environment.baseUrl + environment.assetsUrl + '/releases/notes.json').subscribe(releases => {
      this.releases = [];
      for (const key in releases) {
        const code = Number.parseInt(key);
        if (!Number.isNaN(code) && code > this.sinceVersion) {
          this.releases.push({
            code,
            version: StringUtils.versionCodeToVersionName(code),
            languages: releases[key],
          });
        }
      }
      this.releases.sort((r1, r2) => r1.code - r2.code);
    });
  }

}
