import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { DonationGoalDto } from 'src/app/pages/donation/donation-goal';
import { HttpService } from 'src/app/services/http/http.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { ErrorService } from 'src/app/services/progress/error.service';
import { environment } from 'src/environments/environment';
import { IonFooter, IonToolbar, IonButtons, IonButton, IonIcon, IonLabel } from '@ionic/angular/standalone';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-donation-goals',
  templateUrl: './donation-goals.component.html',
  styleUrl: './donation-goals.component.scss',
  imports: [
    CommonModule, FormsModule,
    IonFooter, IonToolbar, IonButtons, IonButton, IonIcon, IonLabel,
  ]
})
export class DonationGoalsComponent implements OnInit {

  constructor(
    public readonly i18n: I18nService,
    private readonly http: HttpService,
    private readonly errorService: ErrorService,
  ) {}

  goals?: DonationGoalDto[];

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.http.get<DonationGoalDto[]>(environment.apiBaseUrl + '/donation/v1/goals')
    .subscribe({
      next: list => this.setGoals(list),
      error: e => this.errorService.addNetworkError(e, 'admin.donations.error', []),
    });
  }

  setGoals(list: DonationGoalDto[]) {
    this.goals = list.map(goal => ({
      ...goal,
      amount: goal.amount / 100,
    } as DonationGoalDto)).sort((g1,g2) => g1.index - g2.index);
  }

  trackByFn(index: number, item: DonationGoalDto): number {
    return item.index;
  }

  addGoal(): void {
    if (!this.goals) return;
    this.goals.push({
      index: this.goals.length + 1,
      type: '',
      amount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  save(): void {
    this.http.post<DonationGoalDto[]>(environment.apiBaseUrl + '/donation/v1/goals', this.goals!.map(
      g => ({...g, amount: Math.floor(g.amount * 100)} as DonationGoalDto)
    )).subscribe({
      next: list => this.setGoals(list),
      error: e => this.errorService.addNetworkError(e, 'admin.donations.error', []),
    });
  }

  moveUp(goal: DonationGoalDto): void {
    const index = this.goals!.indexOf(goal);
    this.goals!.splice(index, 1);
    this.goals!.splice(index - 1, 0, goal);
    for (let i = 0; i < this.goals!.length; ++i) this.goals![i].index = i + 1;
  }

  moveDown(goal: DonationGoalDto): void {
    const index = this.goals!.indexOf(goal);
    this.goals!.splice(index, 1);
    this.goals!.splice(index + 1, 0, goal);
    for (let i = 0; i < this.goals!.length; ++i) this.goals![i].index = i + 1;
  }

}