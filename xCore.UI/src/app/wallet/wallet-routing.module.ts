import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { WalletComponent } from './wallet.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { HistoryComponent } from './history/history.component';
import { ColdStakingOverviewComponent } from './cold-staking/overview.component';
import { AdvancedComponent } from './advanced/advanced.component';
import { AboutComponent } from './advanced/components/about/about.component';
import { SettingsComponent } from './advanced/components/settings/settings.component';
import { SignVerifyComponent } from './advanced/components/sign-verify/sign-verify.component';
import { ExtPubkeyComponent } from './advanced/components/ext-pubkey/ext-pubkey.component';
import { GenerateAddressesComponent } from './advanced/components/generate-addresses/generate-addresses.component';
import { ResyncComponent } from './advanced/components/resync/resync.component';
import { XServerComponent } from './advanced/components/xserver/xserver.component';
import { AddressBookComponent } from './address-book/address-book.component';

const routes: Routes = [
  {
    path: 'wallet', component: WalletComponent, children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: DashboardComponent },
      { path: 'history', component: HistoryComponent },
      { path: 'coldstaking', component: ColdStakingOverviewComponent },
      {
        path: 'advanced', component: AdvancedComponent,
        children: [
          { path: '', redirectTo: 'about', pathMatch: 'full' },
          { path: 'about', component: AboutComponent },
          { path: 'settings', component: SettingsComponent },
          { path: 'sign', component: SignVerifyComponent },
          { path: 'extpubkey', component: ExtPubkeyComponent },
          { path: 'generate-addresses', component: GenerateAddressesComponent },
          { path: 'resync', component: ResyncComponent },
          { path: 'xserver', component: XServerComponent }
        ]
      },
      { path: 'address-book', component: AddressBookComponent }
    ]
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})

export class WalletRoutingModule { }
