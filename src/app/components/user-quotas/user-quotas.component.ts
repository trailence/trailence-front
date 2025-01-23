import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { UserQuotas } from 'src/app/services/auth/user-quotas';
import { I18nService } from 'src/app/services/i18n/i18n.service';

@Component({
  selector: 'app-user-quotas',
  templateUrl: './user-quotas.component.html',
  styleUrl: './user-quotas.component.scss',
  imports: [CommonModule]
})
export class UserQuotasComponent {

  @Input() quotas!: UserQuotas;

  noFormatter = (value: number) => value;
  sizeFormatter = (value: number) => this.i18n.sizeToString(value);

  constructor(
    public readonly i18n: I18nService,
  ) {}

}
