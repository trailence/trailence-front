import { Injectable } from '@angular/core';
import { AuthResponse } from '../auth/auth-response';
import { TrailInfo } from '../fetch-source/fetch-source.interfaces';
import { I18nService } from '../i18n/i18n.service';

@Injectable({providedIn: 'root'})
export class ContributionService {

  constructor(
    private readonly i18n: I18nService,
  ) {}

  public fromAuth(auth: AuthResponse | null | undefined): Contributions {
    return {
      nbPublications: auth?.nbPublications || 0,
      nbComments: auth?.nbComments || 0,
      nbRates: auth?.nbRates || 0,
    }
  }

  public fromTrailInfo(info: TrailInfo | null | undefined): Contributions {
    return {
      nbPublications: info?.authorNbPublications || 0,
      nbComments: info?.authorNbComments || 0,
      nbRates: info?.authorNbRates || 0,
    }
  }

  public getPublicationLevel(nb: number): string | undefined {
    for (let i = 0; i < ContributionsLevels.length - 1; ++i)
      if (nb < ContributionsLevels[i]) return this.i18n.texts.contributions.levels.publications[i];
    return this.i18n.texts.contributions.levels.publications[ContributionsLevels.length - 1];
  }

  public getRatingLevel(nb: number): string | undefined {
    for (let i = 0; i < ContributionsLevels.length - 1; ++i)
      if (nb < ContributionsLevels[i]) return this.i18n.texts.contributions.levels.rates[i];
    return this.i18n.texts.contributions.levels.rates[ContributionsLevels.length - 1];
  }

  public getReviewLevel(nb: number): string | undefined {
    for (let i = 0; i < ContributionsLevels.length - 1; ++i)
      if (nb < ContributionsLevels[i]) return this.i18n.texts.contributions.levels.comments[i];
    return this.i18n.texts.contributions.levels.comments[ContributionsLevels.length - 1];
  }

}

export interface Contributions {
  nbPublications: number;
  nbComments: number;
  nbRates: number;
}

export const ContributionsLevels = [1, 5, 10, 20, 35, 50, 100];

export interface UserProfile extends Contributions {
  alias?: string;
  avatar?: string;
}
