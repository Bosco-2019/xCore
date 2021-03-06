import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { Message } from 'primeng/api';
import { DialogService } from 'primeng/dynamicdialog';
import { GlobalService } from '../../shared/services/global.service';
import { ThemeService } from '../../shared/services/theme.service';
import { ApiService } from '../../shared/services/api.service';
import { ColdStakingService } from '../../shared/services/coldstaking.service';
import { ColdStakingCreateAddressComponent } from './create-address/create-address.component';
import { ColdStakingWithdrawComponent } from './withdraw/withdraw.component';
import { ColdStakingCreateComponent } from './create/create.component';
import { ColdStakingCreateHotComponent } from './create-hot/create-hot.component';
import { TransactionDetailsComponent } from '../transaction-details/transaction-details.component';
import { TransactionInfo } from '../../shared/models/transaction-info';
import { WalletInfo } from '../../shared/models/wallet-info';
import { Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-staking-scene',
  templateUrl: './overview.component.html',
  styleUrls: ['./overview.component.css']
})
export class ColdStakingOverviewComponent implements OnInit, OnDestroy {
  constructor(
    private apiService: ApiService,
    private globalService: GlobalService,
    private stakingService: ColdStakingService,
    public dialogService: DialogService,
    private fb: FormBuilder,
    public themeService: ThemeService,
  ) {
    this.isDarkTheme = themeService.getCurrentTheme().themeType === 'dark';
  }

  public isLoading = true;
  public coldWalletAccountExists = true;
  public hotWalletAccountExists = true;
  public coldTransactions: TransactionInfo[];
  public hotTransactions: TransactionInfo[];
  public pageNumber = 1;
  public coldStakingAccount = 'coldStakingColdAddresses';
  public hotStakingAccount = 'coldStakingHotAddresses';
  public isDarkTheme = false;
  public hasColdTransaction = true;
  public hasHotTransaction = true;
  public loadingMessage: Message[] = [];
  public setupColdMessage: Message[] = [];
  public hotMessage: Message[] = [];
  public isColdHotWallet: boolean;
  public coinUnit: string;

  public confirmedColdBalance = 0;
  public confirmedHotBalance = 0;

  public unconfirmedColdBalance: number;
  public unconfirmedHotBalance: number;

  public spendableColdBalance: number;
  public spendableHotBalance: number;

  public hasColdBalance = false;
  public hasHotBalance = false;

  private walletColdHistorySubscription: Subscription;
  private walletHotHistorySubscription: Subscription;
  private walletColdBalanceSubscription: Subscription;
  private walletHotBalanceSubscription: Subscription;
  private walletColdWalletExistsSubscription: Subscription;

  public setupForm: FormGroup;

  ngOnInit() {
    this.buildSetupForm();
    this.coinUnit = this.globalService.getCoinUnit();
    this.startSubscriptions();

    this.loadingMessage = [{ severity: 'info', summary: '', detail: 'Loading, Please wait...' }];
    this.setupColdMessage = [{ severity: 'info', summary: '', detail: 'The Delegated Wallet has no access to your coins and you can withdraw to your spendable addresses balance at any time.' }];
    this.hotMessage = [{ severity: 'info', summary: '', detail: 'The hot balance reflects what has been deligated, this wallet does not have access to these funds.' }];

    this.apiService
      .getColdHotState(this.globalService.getWalletName())
      .subscribe(
        isHot => {
          this.isColdHotWallet = isHot;
        }
      );
  }

  ngOnDestroy() {
    this.cancelSubscriptions();
  }

  private buildSetupForm(): void {
    this.setupForm = this.fb.group({
      setupType: ['', Validators.compose([Validators.required])]
    });
  }

  onWalletGetFirstUnusedAddress(isColdStaking: boolean) {
    const modalData = { isColdStaking };

    this.dialogService.open(ColdStakingCreateAddressComponent, {
      header: 'Hot Address',
      data: modalData
    });
  }

  onWalletWithdraw(isColdStaking: boolean) {
    const modalData = { isColdStaking };

    this.dialogService.open(ColdStakingWithdrawComponent, {
      header: 'Withdraw',
      data: modalData
    });
  }

  onColdSetup() {
    this.dialogService.open(ColdStakingCreateComponent, {
      header: 'Delegated Cold Staking',
      width: '540px',
      dismissableMask: true
    });
  }

  onHotSetup() {
    this.dialogService.open(ColdStakingCreateHotComponent, {
      header: 'Hot Cold Staking Setup',
      width: '540px',
      dismissableMask: true
    });
  }

  private getWalletsExists() {
    this.walletColdWalletExistsSubscription = this.stakingService.getInfo(this.globalService.getWalletName()).subscribe(x => {
      this.coldWalletAccountExists = x.coldWalletAccountExists;
      this.hotWalletAccountExists = x.hotWalletAccountExists;

      const aWalletExists: boolean = this.coldWalletAccountExists || this.hotWalletAccountExists;

      if (!aWalletExists) {
        this.cancelSubscriptions();
      }

      if (!aWalletExists) {
        setTimeout(() => {
          this.startSubscriptions();
        }, 2000);
      }
    });
  }

  private getHistory(isCold: boolean) {
    const walletInfo = new WalletInfo(this.globalService.getWalletName());
    if (isCold) {
      let coldHistoryResponse;
      walletInfo.accountName = this.coldStakingAccount;
      this.walletColdHistorySubscription = this.apiService.getWalletHistorySlim(walletInfo, 0, 100, true)
        .subscribe(
          response => {
            if (response != null) {
              if (!!response.history && response.history[0].transactionsHistory.length > 0) {
                coldHistoryResponse = response.history[0].transactionsHistory;
                this.getTransactionInfo(coldHistoryResponse, true);
              }
              else {
                this.hasColdTransaction = false;
              }
            }
          }
        );
    } else {
      let coldHistoryResponse;
      walletInfo.accountName = this.hotStakingAccount;
      this.walletHotHistorySubscription = this.apiService.getWalletHistory(walletInfo, 0, 100, true)
        .pipe(
          finalize(() => this.isLoading = false)
        )
        .subscribe(
          response => {
            if (response != null) {
              if (!!response.history && response.history[0].transactionsHistory.length > 0) {
                coldHistoryResponse = response.history[0].transactionsHistory;
                this.getTransactionInfo(coldHistoryResponse, false);
              }
              else {
                this.hasHotTransaction = false;
              }
              this.isLoading = false;
            }
          }
        );
    }
  }

  private getTransactionInfo(transactions: any, isCold: boolean) {
    if (isCold) {
      this.coldTransactions = [];
    } else {
      this.hotTransactions = [];
    }

    for (const transaction of transactions) {
      let transactionType;
      if (transaction.type === 'send') {
        transactionType = 'sent';
      } else if (transaction.type === 'received') {
        transactionType = 'received';
      } else if (transaction.type === 'staked') {
        transactionType = 'staked';
      } else {
        transactionType = 'unknown';
      }
      const transactionId = transaction.id;
      const transactionAmount = transaction.amount;
      let transactionFee;
      if (transaction.fee) {
        transactionFee = transaction.fee;
      } else {
        transactionFee = 0;
      }
      const transactionConfirmedInBlock = transaction.confirmedInBlock;
      const transactionTimestamp = transaction.timestamp;

      if (isCold) {
        this.coldTransactions.push(new TransactionInfo(transactionType, transactionId, transactionAmount, transactionFee, transactionConfirmedInBlock, transactionTimestamp));
      } else {
        this.hotTransactions.push(new TransactionInfo(transactionType, transactionId, transactionAmount, transactionFee, transactionConfirmedInBlock, transactionTimestamp));
      }

      if (this.coldTransactions !== undefined && this.coldTransactions.length > 0) {
        this.hasColdTransaction = true;
      }
      if (this.hotTransactions !== undefined && this.hotTransactions.length > 0) {
        this.hasHotTransaction = true;
      }
    }
  }

  private getWalletBalance() {
    const walletInfo = new WalletInfo(this.globalService.getWalletName());
    walletInfo.accountName = this.coldStakingAccount;

    this.walletColdBalanceSubscription = this.apiService.getWalletBalance(walletInfo, true)
      .subscribe(
        coldBalanceResponse => {
          if (coldBalanceResponse != null) {
            if (coldBalanceResponse.balances[0].amountConfirmed > 0 || coldBalanceResponse.balances[0].amountUnconfirmed > 0) {
              this.hasColdBalance = true;
            }
            this.confirmedColdBalance = coldBalanceResponse.balances[0].amountConfirmed;
            this.unconfirmedColdBalance = coldBalanceResponse.balances[0].amountUnconfirmed;
            this.spendableColdBalance = coldBalanceResponse.balances[0].spendableAmount;
          }
        }
      );

    walletInfo.accountName = this.hotStakingAccount;
    this.walletHotBalanceSubscription = this.apiService.getWalletBalance(walletInfo, true)
      .subscribe(
        hotBalanceResponse => {
          if (hotBalanceResponse != null) {
            if (hotBalanceResponse.balances[0].amountConfirmed > 0 || hotBalanceResponse.balances[0].amountUnconfirmed > 0) {
              this.hasHotBalance = true;
            }
            this.confirmedHotBalance = hotBalanceResponse.balances[0].amountConfirmed;
            this.unconfirmedHotBalance = hotBalanceResponse.balances[0].amountUnconfirmed;
            this.spendableHotBalance = hotBalanceResponse.balances[0].spendableAmount;
          }
        }
      );
  }

  public openTransactionDetailDialog(transaction: TransactionInfo) {
    const modalData = { transaction };

    this.dialogService.open(TransactionDetailsComponent, {
      header: 'Transaction Details',
      data: modalData
    });
  }

  private cancelSubscriptions() {
    if (this.walletColdHistorySubscription) {
      this.walletColdHistorySubscription.unsubscribe();
    }
    if (this.walletHotHistorySubscription) {
      this.walletHotHistorySubscription.unsubscribe();
    }
    if (this.walletColdBalanceSubscription) {
      this.walletColdBalanceSubscription.unsubscribe();
    }
    if (this.walletHotBalanceSubscription) {
      this.walletHotBalanceSubscription.unsubscribe();
    }
    if (this.walletColdWalletExistsSubscription) {
      this.walletColdWalletExistsSubscription.unsubscribe();
    }
    if (this.hotWalletAccountExists) {
      this.walletColdWalletExistsSubscription.unsubscribe();
    }
  }

  private startSubscriptions() {
    this.getWalletsExists();

    const aWalletExists: boolean = this.coldWalletAccountExists && this.hotWalletAccountExists;

    if (!aWalletExists) {
      this.hasColdBalance = false;
      this.hasHotBalance = false;
      return;
    }

    this.getWalletBalance();
    this.getHistory(true);
    this.getHistory(false);
  }
}
