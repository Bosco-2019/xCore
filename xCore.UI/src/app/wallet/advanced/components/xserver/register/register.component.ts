import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../../../../shared/services/api.service';
import { GlobalService } from '../../../../../shared/services/global.service';
import { ThemeService } from '../../../../../shared/services/theme.service';
import { DynamicDialogRef, DynamicDialogConfig } from 'primeng/dynamicdialog';
import { ColdStakingSetup } from '../../../../../shared/models/coldstakingsetup';
import { TransactionSending } from '../../../../../shared/models/transaction-sending';
import { ServerIDResponse } from '../../../../../shared/models/serveridresponse';
import { ColdStakingService } from '../../../../../shared/services/coldstaking.service';
import { TransactionInfo } from '../../../../../shared/models/transaction-info';
import { SignMessageRequest } from '../../../../../shared/models/wallet-signmessagerequest';
import { XServerRegistrationRequest } from '../../../../../shared/models/xserver-registration-request';
import { XServerTestRequest } from '../../../../../shared/models/xserver-test-request';
import { NodeStatus } from '../../../../../shared/models/node-status';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-register-component',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css'],
})

export class RegisterComponent implements OnInit {
  constructor(
    private apiService: ApiService,
    private stakingService: ColdStakingService,
    private globalService: GlobalService,
    public themeService: ThemeService,
    public activeModal: DynamicDialogRef,
    public config: DynamicDialogConfig,
  ) {
    this.isDarkTheme = themeService.getCurrentTheme().themeType === 'dark';
  }

  public isDarkTheme = false;
  public collateralProgress = 0;
  public currentStep = -1;
  public confirmations = 0;
  public transactionInfo: TransactionInfo;
  public registrationFailed = false;

  public profileName: string;
  public selectedProtocol: number;
  public networkAddress: string;
  public networkPort: string;
  public selectedTier: string;
  public walletPassword: string;
  public keyAddress: string;
  public feeAddress: string;
  public errorMessage = '';
  public testStatus = 0;

  private server: ServerIDResponse = new ServerIDResponse();
  private generalWalletInfoSubscription: Subscription;
  private nodeStatusSubscription: Subscription;

  private signedMessage: string;
  private broadcastStarted = false;

  public mainAccount = 'account 0';
  public coldStakingAccount = 'coldStakingColdAddresses';
  public hotStakingAccount = 'coldStakingHotAddresses';

  ngOnInit() {
    this.profileName = this.config.data.profileName;
    this.selectedProtocol = this.config.data.selectedProtocol;
    this.networkAddress = this.config.data.networkAddress;
    this.networkPort = this.config.data.networkPort;
    this.server.serverId = this.config.data.serverId;
    this.walletPassword = this.config.data.walletPassword;
    this.selectedTier = this.config.data.selectedTier;
    this.keyAddress = this.config.data.keyAddress;
    this.feeAddress = this.config.data.feeAddress;

    this.startSubscription();
  }

  private startSubscription() {
    this.nodeStatusSubscription = this.apiService.getNodeStatus()
      .subscribe(
        (data: NodeStatus) => {
          const statusResponse = data;
          this.testXServer(statusResponse.blockStoreHeight);
        }
      );
  }

  private testXServer(blockHeight: number) {
    const registrationRequest = new XServerTestRequest(this.selectedProtocol, this.networkAddress, Number(this.networkPort), blockHeight);
    console.log(registrationRequest);
    this.apiService.testxServer(registrationRequest)
      .subscribe(
        response => {
          if (response.success) {
            this.testStatus = 1;
            this.startRegistration();
          } else {
            this.testStatus = -1;
            this.errorMessage = response.resultMessage;
          }
        }
      );
  }

  private getTierNumber(): number {
    let xServerTier = 0;
    if (this.selectedTier === '1000') {
      xServerTier = 1;
    } else if (this.selectedTier === '20000') {
      xServerTier = 2;
    } else if (this.selectedTier === '50000') {
      xServerTier = 3;
    }
    return xServerTier;
  }

  private startRegistration() {
    let previousConfirmation = 0;
    this.broadcastTransaction();
    this.currentStep++;
    const interval = setInterval(() => {
      if (this.errorMessage === '') {
        if (this.collateralProgress > 0 && this.currentStep < 1) {
          if (this.confirmations >= 6) {
            this.signRegistrationRequest();
            this.currentStep++;
            this.incrementProgress(20);
          } else {
            if (previousConfirmation !== this.confirmations) {
              this.incrementProgress(this.confirmations * 2);
            }
          }
        }
        if (this.currentStep === 2 && !this.broadcastStarted) {
          this.broadcastStarted = true;
          this.broadcastRegistrationRequest();
        }
        if (this.collateralProgress >= 100) {
          this.collateralProgress = 100;
          clearInterval(interval);
        }
        previousConfirmation = this.confirmations;
      } else {
        clearInterval(interval);
        console.log(this.errorMessage);
      }
    }, 1000);
  }

  private broadcastRegistrationRequest() {
    const registrationRequest = new XServerRegistrationRequest(this.profileName, this.selectedProtocol, this.networkAddress, Number(this.networkPort), this.signedMessage, this.keyAddress, this.server.getAddressFromServerId(), this.feeAddress, this.getTierNumber());
    console.log(registrationRequest);
    this.apiService.registerxServer(registrationRequest)
      .subscribe(
        response => {
          if (response.success) {
            this.incrementProgress(40);
            this.currentStep++;
          } else {
            this.errorMessage = response.resultMessage;
          }
        }
      );
  }

  private signRegistrationRequest() {
    const walletName = this.globalService.getWalletName();
    const serverKey = `${this.networkAddress}${this.networkPort}${this.keyAddress}${this.server.getAddressFromServerId()}${this.feeAddress}${this.getTierNumber()}${this.profileName}`;
    const address = this.keyAddress;
    const password = this.walletPassword;
    const signMessageRequest = new SignMessageRequest(walletName, this.coldStakingAccount, password, address, serverKey);

    this.apiService.signMessage(signMessageRequest)
      .subscribe(
        response => {
          this.signedMessage = response.signature;
          this.incrementProgress(20);
          this.currentStep++;
        }
      );
  }

  private incrementProgress(progress: number) {
    let totalProgress = this.collateralProgress + progress;
    if (totalProgress > 100) {
      totalProgress = 100;
    }
    this.collateralProgress = totalProgress;
  }

  private updateConfirmations() {
    this.generalWalletInfoSubscription = this.apiService.getTxOut(this.transactionInfo.transactionId, false, true)
      .subscribe(
        response => {
          if (response != null) {
            const transactionOutput = response;
            if (transactionOutput != null) {
              this.confirmations = transactionOutput.confirmations;
            }
          }
        },
        error => {
          if (error.status === 0) {
            this.cancelWalletSubscriptions();
            this.stopWithErrorMessage('Could not get confirmation.');
          } else if (error.status >= 400) {
            if (!error.error.errors[0].message) {
              this.cancelWalletSubscriptions();
              this.stopWithErrorMessage('Could not get confirmation..');
            }
          }
        }
      );
  }

  public deligatedTransactionSent(transactionInfo: TransactionInfo) {
    this.transactionInfo = transactionInfo;
    this.incrementProgress(10);
    this.updateConfirmations();
  }

  public broadcastTransaction(): void {
    const walletName = this.globalService.getWalletName();
    const walletPassword = this.walletPassword;
    const amount = Number(this.selectedTier);
    const hotWalletAddress = this.server.getAddressFromServerId();
    const fee = 0;

    if (hotWalletAddress === '') {
      this.stopWithErrorMessage('Invalid xServer ID');
    } else {
      console.log(hotWalletAddress);

      this.stakingService.createColdstaking(new ColdStakingSetup(
        hotWalletAddress,
        this.keyAddress,
        amount,
        walletName,
        walletPassword,
        this.mainAccount,
        fee
      ), true)
        .subscribe(
          createColdstakingResponse => {
            const transaction = new TransactionSending(createColdstakingResponse.transactionHex);
            this.apiService
              .sendTransaction(transaction, true)
              .subscribe(
                sendTransactionResponse => {
                  this.deligatedTransactionSent(sendTransactionResponse);
                },
                error => {
                  this.stopWithErrorMessage('Sending: ' + error.error.errors[0].message);
                }
              );
          },
          error => {
            this.stopWithErrorMessage('Setup: ' + error.error.errors[0].message);
          }
        );
    }
  }

  private stopWithErrorMessage(message: string) {
    this.errorMessage = message;
    this.currentStep = -2;
  }

  private cancelWalletSubscriptions() {
    if (this.generalWalletInfoSubscription) {
      this.generalWalletInfoSubscription.unsubscribe();
    }
  }

  public Close() {
    this.activeModal.close('Close click');
  }

  public Cancel() {
    this.stopWithErrorMessage('User Canceled');
  }

}
