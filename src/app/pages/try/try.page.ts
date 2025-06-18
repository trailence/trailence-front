import { Component, OnChanges, SimpleChanges } from '@angular/core';
import { NavController } from '@ionic/angular/standalone';
import { AuthService } from 'src/app/services/auth/auth.service';

@Component({
  template: '',
  styles: '',
  imports: []
})
export class TryPage implements OnChanges {

  constructor(
    private readonly navController: NavController,
    private readonly auth: AuthService,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    this.tryApp();
  }

  ionViewWillEnter(): void {
    this.tryApp();
  }

  private tryApp(): void {
    this.auth.loginAnonymous();
    this.navController.navigateRoot('/');
  }

}
