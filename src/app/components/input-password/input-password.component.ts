import { Component, ContentChild, Input, OnDestroy } from '@angular/core';
import { IonInput, IonIcon } from '@ionic/angular/standalone';
import { Subscription } from 'rxjs';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { COMPLEXITY_LEVELS, MIN_COMPLEXITY, PasswordUtils } from 'src/app/utils/password-utils';

@Component({
  selector: 'app-input-password',
  templateUrl: './input-password.component.html',
  styleUrl: './input-password.component.scss',
  imports: [
    IonIcon,
  ]
})
export class InputPasswordComponent implements OnDestroy {

  @Input() enableToggle = true;
  @Input() enableStrength = true;

  complexity = 0;
  strengthWidth = 0;
  strengthColor = '#FF0000';
  strengthLevel = 0;
  hidden = true;

  private _input?: IonInput;
  private _inputSubscription?: Subscription;

  @ContentChild(IonInput) set input(input: IonInput | undefined | null) {
    this._input = input || undefined;
    this._inputSubscription?.unsubscribe();
    this._inputSubscription = undefined;
    if (input) this._inputSubscription = input.ionInput.subscribe(e => this.passwordChanged(e.detail.value || ''));
  };

  constructor(
    public readonly i18n: I18nService,
  ) {}

  ngOnDestroy(): void {
    this._inputSubscription?.unsubscribe();
  }

  private passwordChanged(password: string): void {
    this.complexity = PasswordUtils.complexity(password);
    this.strengthWidth = this.complexity > 50 ? 100 : this.complexity * 2;
    if (this.complexity < MIN_COMPLEXITY) {
      this.strengthColor = 'rgb(255,' + Math.floor(this.complexity * 160 / MIN_COMPLEXITY) + ',0)';
    } else if (this.complexity >= COMPLEXITY_LEVELS[4]) {
      this.strengthColor = '#00FF00';
    } else {
      this.strengthColor = 'rgb(' + (255 - (this.complexity - MIN_COMPLEXITY) * 12) + ',255,0)';
    }
    if (this.complexity > COMPLEXITY_LEVELS[4])
      this.strengthLevel = 5;
    else if (this.complexity >= COMPLEXITY_LEVELS[3])
      this.strengthLevel = 4;
    else if (this.complexity >= COMPLEXITY_LEVELS[2])
      this.strengthLevel = 3;
    else if (this.complexity > COMPLEXITY_LEVELS[1])
      this.strengthLevel = 2;
    else if (this.complexity > COMPLEXITY_LEVELS[0])
      this.strengthLevel = 1;
    else
      this.strengthLevel = 0;
  }

  toggleVisibility(): void {
    if (this.hidden) {
      this._input!.type = 'text';
      this.hidden = false;
    } else {
      this._input!.type = 'password';
      this.hidden = true;
    }
  }

}
