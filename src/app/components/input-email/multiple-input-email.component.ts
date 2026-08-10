import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { EmailValue, InputEmailComponent } from './input-email.component';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { Arrays } from 'src/app/utils/arrays';

export interface EmailsValue {
  emails: string[];
  valid: boolean;
}

@Component({
  selector: 'app-multiple-input-email',
  template: `
    @for (email of emailsValues; track $index) {
      <app-input-email
        [value]="email.email"
        [error]="email.error"
        (valueUpdated)="setEmail($index, $event)"
        [required]="false"
        [label]="label"
        [inputClass]="inputClass"
        [disabled]="disabled"
      ></app-input-email>
    }
  `,
  styles: `
    app-input-email {
      display: block;
      &:not(:first-child) {
        margin-top: 10px;
      }
    }
  `,
  imports: [InputEmailComponent]
})
export class MultipleInputEmailComponent implements OnInit, OnChanges {

  @Input() emails?: string[];
  @Input() forbiddenEmails?: {[email: string]: string};
  @Input() allowSameEmail = false;
  @Input() allowEmpty = false;
  @Input() maxEmails = -1;
  @Input() disabled = false;
  @Output() emailsUpdated = new EventEmitter<EmailsValue>();

  @Input() label?: string;
  @Input() inputClass?: string;

  emailsValues: {email: string, error: string | undefined}[] = [];
  lastEmitted: EmailsValue = {emails: [], valid: true};

  constructor(
    private readonly i18n: I18nService,
  ) {}

  ngOnInit(): void {
    if (this.emails !== undefined) {
      this.emailsValues = this.emails.map(email => ({email, error: undefined}));
      this.lastEmitted = {emails: this.emails, valid: true};
      this.validateList();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    let needValidation = false;
    if (changes['emails']) {
      this.emailsValues = this.emails ? this.emails.map(email => ({email, error: undefined})) : [];
      needValidation = true;
    }
    if (changes['forbiddenEmails'] || changes['allowSameEmail'] || changes['allowEmpty'] || changes['maxEmails']) {
      needValidation = true;
    }
    if (needValidation) this.validateList();
  }

  setEmail(index: number, value: EmailValue): void {
    this.emailsValues[index] = {email: value.email ?? '', error: value.error};
    this.validateList();
  }

  private validateList(): void {
    this.emailsValues = this.emailsValues.filter(e => e.email.trim().length > 0);
    if (!this.disabled)
      this.emailsValues.push({email: '', error: undefined});
    if (this.maxEmails > 0 && this.emailsValues.length > this.maxEmails) this.emailsValues.splice(this.maxEmails, this.emailsValues.length - this.maxEmails);
    let hasOne = false;
    for (let i = 0; i < this.emailsValues.length; ++i) {
      const value = this.emailsValues[i];
      value.error = InputEmailComponent.validateEmail(value.email, false, this.i18n);
      if (value.email.length > 0) {
        hasOne = true;
        if (!value.error && this.forbiddenEmails)
          value.error = this.forbiddenEmails[value.email] ?? undefined;
      }
      if (!this.allowSameEmail && !value.error) {
        for (let j = i - 1; j >= 0; --j) {
          if (this.emailsValues[j].email === value.email) {
            value.error = this.i18n.texts.inputEmail.errors.duplicate;
            break;
          }
        }
      }
    }
    if (!hasOne && !this.allowEmpty && !this.emailsValues[0].error)
      this.emailsValues[0].error = this.i18n.texts.inputEmail.errors.atLeastOneEmailIsRequired;
    const event: EmailsValue = {
      emails: this.emailsValues.map(v => v.email).filter(e => e.length > 0),
      valid: this.emailsValues.every(v => v.error === undefined),
    }
    if (this.lastEmitted.valid !== event.valid || !Arrays.equals(this.lastEmitted.emails, event.emails))
      this.emailsUpdated.emit(event);
  }
}
