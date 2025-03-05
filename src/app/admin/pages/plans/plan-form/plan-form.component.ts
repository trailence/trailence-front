import { Component, Input, OnInit } from '@angular/core';
import { PlanDto } from 'src/app/admin/model/plan';
import { IonHeader, IonToolbar, IonTitle, IonLabel, IonInput, IonFooter, IonButtons, IonButton, ModalController, AlertController } from '@ionic/angular/standalone';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { HttpService } from 'src/app/services/http/http.service';
import { environment } from 'src/environments/environment';
import { ErrorService } from 'src/app/services/progress/error.service';

@Component({
  templateUrl: './plan-form.component.html',
  styleUrl: './plan-form.component.scss',
  imports: [
    IonHeader, IonToolbar, IonTitle, IonLabel, IonInput, IonFooter, IonButtons, IonButton,
    ReactiveFormsModule
  ]
})
export class PlanFormComponent implements OnInit {

  @Input() plan?: PlanDto

  form!: FormGroup;

  constructor(
    private readonly formBuilder: FormBuilder,
    public readonly i18n: I18nService,
    private readonly http: HttpService,
    private readonly errorService: ErrorService,
    private readonly modalController: ModalController,
    private readonly alertController: AlertController,
  ) {}

  ngOnInit(): void {
    this.form = this.formBuilder.group({
      name: [this.plan?.name ?? '', [Validators.minLength(1), Validators.maxLength(50)]],
      collections: [this.plan?.collections ?? 0],
      trails: [this.plan?.trails ?? 0],
      tracks: [this.plan?.tracks ?? 0],
      tracksSize: [this.plan?.tracksSize ?? 0],
      tags: [this.plan?.tags ?? 0],
      trailTags: [this.plan?.trailTags ?? 0],
      photos: [this.plan?.photos ?? 0],
      photosSize: [this.plan?.photosSize ?? 0],
      shares: [this.plan?.shares ?? 0],
    })
  }

  canApply(): boolean {
    return this.form.valid && !this.form.pristine
  }

  applying = false;
  apply(): void {
    this.applying = true;
    const request =
      this.plan ?
        this.http.put<PlanDto>(environment.apiBaseUrl + '/admin/plans/v1/' + encodeURIComponent(this.plan.name), this.form.value) :
        this.http.post<PlanDto>(environment.apiBaseUrl + '/admin/plans/v1', this.form.value);
    request.subscribe({
      next: () => {
        this.close('save');
      },
      error: e => {
        this.errorService.addNetworkError(e, 'admin.plans.planForm.error', []);
        this.applying = false;
      }
    })
  }

  async deletePlan() {
    const alert = await this.alertController.create({
      header: this.i18n.texts.buttons.delete,
      message: this.i18n.texts.admin.plans.planForm.delete_confirmation,
      buttons: [
        {
          text: this.i18n.texts.buttons.yes,
          role: 'danger',
          handler: () => {
            alert.dismiss(true);
            this.doDelete();
          }
        }, {
          text: this.i18n.texts.buttons.no,
          role: 'cancel'
        }
      ]
    });
    await alert.present();
  }

  private doDelete(): void {
    this.applying = true;
    this.http.delete(environment.apiBaseUrl + '/admin/plans/v1/' + encodeURIComponent(this.plan!.name))
    .subscribe({
      next: () => {
        this.close('save');
      },
      error: e => {
        this.errorService.addNetworkError(e, 'admin.plans.planForm.error', []);
        this.applying = false;
      }
    });
  }

  close(role: string): void {
    this.modalController.dismiss(null, role);
  }

}
