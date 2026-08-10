import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IonInput, IonIcon } from '@ionic/angular/standalone';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { EMAIL_REGEX } from 'src/app/utils/string-utils';

export interface EmailValue {
  email?: string;
  error?: string;
}

@Component({
  selector: 'app-input-email',
  template: `
    <ion-input
      fill="outline"
      label="{{label ?? i18n.texts.inputEmail.defaultLabel}}"
      label-placement="floating"
      [value]="value"
      (ionInput)="setValue($event.detail.value)"
      type="email"
      class="{{inputClass}}"
      [required]="required"
      [disabled]="disabled"
    >
      @if (value?.length) {<ion-icon slot="end" name="trash" (click)="setValue('')"></ion-icon>}
    </ion-input>
    @if (error) {<div class="error">{{ error }}</div>}
  `,
  styles: `
      div.error {
        color: var(--ion-color-danger);
        font-size: 12px;
        margin-top: 2px;
      }
  `,
  imports: [IonInput, IonIcon]
})
export class InputEmailComponent {

  @Input() value?: string;
  @Input() error?: string;
  @Output() valueUpdated = new EventEmitter<EmailValue>;

  @Input() required = false;
  @Input() label?: string;
  @Input() inputClass?: string;
  @Input() disabled = false;

  constructor(
    public readonly i18n: I18nService,
  ) {}

  setValue(value: any): void {
    let v: string | undefined = typeof value === 'string' ? value.toLowerCase().trim() : '';
    if (v.length === 0) v = undefined;
    if (this.value === v) return;
    this.value = v;
    this.validate();
    this.valueUpdated.emit({email: this.value, error: this.error});
  }

  validate(): void {
    this.error = InputEmailComponent.validateEmail(this.value, this.required, this.i18n);
  }

  public static validateEmail(email: string | undefined, required: boolean, i18n: I18nService): string | undefined {
    if (email !== undefined && email.trim().length === 0) email = undefined; // NOSONAR
    if (email === undefined) {
      if (required) return i18n.texts.inputEmail.errors.required;
      return undefined;
    }
    if (!EMAIL_REGEX.test(email)) return i18n.texts.inputEmail.errors.invalidEmail;
    return undefined;
  }
}
