import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpErrorResponse } from '@angular/common/http';
import { Observable, interval, throwError } from 'rxjs';
import { catchError, switchMap, startWith } from 'rxjs/operators';
import { ModalService } from './modal.service';
import { AddressLabel } from '../models/address-label';
import { WalletCreation } from '../models/wallet-creation';
import { WalletRecovery } from '../models/wallet-recovery';
import { WalletLoad } from '../models/wallet-load';
import { WalletInfo } from '../models/wallet-info';
import { SidechainFeeEstimation } from '../models/sidechain-fee-estimation';
import { FeeEstimation } from '../models/fee-estimation';
import { TransactionBuilding } from '../models/transaction-building';
import { TransactionSending } from '../models/transaction-sending';
import { NodeStatus } from '../models/node-status';
import { XServerStatus } from '../models/xserver-status';
import { WalletRescan } from '../models/wallet-rescan';
import { SignMessageRequest } from '../models/wallet-signmessagerequest';
import { VerifyRequest } from '../models/wallet-verifyrequest';
import { SplitCoins } from '../models/split-coins';
import { ValidateAddressResponse } from '../models/validateaddressresponse';
import { AddressType } from '../models/address-type';
import { ColdHotStateRequest } from '../models/coldhotstaterequest';
import { SignMessageResponse } from '../models/signmessageresponse';
import { TransactionOutput } from '../models/transaction-output';
import { XServerRegistrationRequest } from '../models/xserver-registration-request';
import { XServerRegistrationResponse } from '../models/xserver-registration-response';
import { XServerTestRequest } from '../models/xserver-test-request';
import { XServerTestResponse } from '../models/xserver-test-response';
import { CreatePriceLockRequest } from '../models/xserver-create-pl-request';
import { SubmitPaymentRequest } from '../models/xserver-submit-payment-request';
import { ProfileReserveRequest } from '../models/xserver-profile-reserve-request';
import { Logger } from './logger.service';
import { ChainService } from './chain.service';
import { ApplicationStateService } from './application-state.service';
import { ElectronService } from 'ngx-electron';
import { NotificationService } from './notification.service';

@Injectable({
  providedIn: 'root'
})

export class ApiService {
  static singletonInstance: ApiService;

  constructor(
    private http: HttpClient,
    private modalService: ModalService,
    private addressType: AddressType,
    private log: Logger,
    private chains: ChainService,
    private appState: ApplicationStateService,
    private electronService: ElectronService,
    private notifications: NotificationService
  ) {
    if (!ApiService.singletonInstance) {
      ApiService.singletonInstance = this;
    }

    return ApiService.singletonInstance;
  }

  private pollingInterval = interval(5000);
  private x42ApiUrl;
  private daemon;
  private nodeStatusPolling = false;
  private xserverStatusPolling = false;
  private addressBookPolling = false;
  private generalInfoPolling = false;
  private stakingInfoPolling = false;
  private txOutPolling = false;
  private walletBalancePolling = false;
  private walletHistoryPolling = false;
  private walletHistorySlimPolling = false;

  public apiUrl: string;
  public genesisDate: Date;
  public apiPort: number;

  /** Initialized the daemon running in the background, by sending configuration that has been picked by user, including chain, network and mode. */
  initialize() {
    // Get the current network (main, regtest, testnet), current blockchain (x42, bitcoin) and the mode (full, light, mobile)
    const chain = this.chains.getChain(this.appState.network);

    // Get the correct name of the chain that was found.
    this.appState.networkName = chain.networkname;

    // Make sure we copy some of the state information to the chain instance supplied to launch the daemon by the main process.
    chain.mode = this.appState.daemon.mode;
    chain.path = this.appState.daemon.path;
    chain.datafolder = this.appState.daemon.datafolder;

    this.genesisDate = chain.genesisDate;

    this.log.info('Api Service, Chain: ', chain);

    // For mobile mode, we won't launch any daemons.
    if (chain.mode === 'simple') {

    } else {
      if (this.electronService.ipcRenderer) {
        this.daemon = this.electronService.ipcRenderer.sendSync('start-daemon', chain);

        if (this.daemon !== 'OK') {
          this.notifications.add({
            title: 'xCore background error',
            hint: 'Messages from the background process received in xCore',
            message: this.daemon,
            icon: (this.daemon.indexOf('xCore was started in development mode') > -1) ? 'build' : 'warning'
          });
        }

        this.log.info('Node result: ', this.daemon);
        this.setApiPort(chain.apiPort);
      }
    }
  }

  /** Set the API port to connect with full node API. This will differ depending on coin and network. */
  setApiPort(port: number) {
    this.apiPort = port;
    this.x42ApiUrl = 'http://localhost:' + port + '/api';
  }

  getNodeStatus(silent?: boolean): Observable<NodeStatus> {
    return this.http.get<NodeStatus>(this.x42ApiUrl + '/node/status').pipe(
      catchError(err => this.handleHttpError(err, silent))
    );
  }

  getNodeStatusInterval(): Observable<NodeStatus> {
    return this.pollingInterval.pipe(
      startWith(0),
      switchMap(() => this.getNodeStatusPolling()),
      catchError(err => this.handleHttpError(err))
    );
  }

  private async getNodeStatusPolling() {
    if (!this.nodeStatusPolling) {
      this.nodeStatusPolling = true;
      const response = await this.http.get<NodeStatus>(this.x42ApiUrl + '/node/status').toPromise();
      this.nodeStatusPolling = false;
      return response;
    }
  }

  getxServerStatusInterval(): Observable<XServerStatus> {
    return this.pollingInterval.pipe(
      startWith(0),
      switchMap(() => this.getxServerStatusPolling()),
      catchError(err => this.handleHttpError(err))
    );
  }

  private async getxServerStatusPolling() {
    if (!this.xserverStatusPolling) {
      this.xserverStatusPolling = true;
      const response = await this.http.get<XServerStatus>(this.x42ApiUrl + '/xServer/getxserverstats').toPromise();
      this.xserverStatusPolling = false;
      return response;
    }
  }

  testxServer(testRequest: XServerTestRequest): Observable<XServerTestResponse> {
    return this.http.post<XServerTestResponse>(this.x42ApiUrl + '/xServer/testxserverports', JSON.stringify(testRequest)).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  registerxServer(registrationRequest: XServerRegistrationRequest): Observable<XServerRegistrationResponse> {
    return this.http.post<XServerRegistrationResponse>(this.x42ApiUrl + '/xServer/registerxserver', JSON.stringify(registrationRequest)).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  getAvailablePairs(): Observable<any> {
    return this.http.get<any>(this.x42ApiUrl + '/xServer/getavailablepairs').pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  // Create a price lock.
  createPriceLock(createPLRequest: CreatePriceLockRequest): Observable<any> {
    return this.http.post(this.x42ApiUrl + '/xServer/createpricelock', JSON.stringify(createPLRequest)).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  // Get a price lock.
  getProfile(name: string, keyAddress: string): Observable<any> {
    const params = new HttpParams()
      .set('name', name)
      .set('keyAddress', keyAddress);
    return this.http.get(this.x42ApiUrl + '/xServer/getprofile', { params }).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  // Submit payment
  submitPayment(submitPaymentRequest: SubmitPaymentRequest): Observable<any> {
    return this.http.post(this.x42ApiUrl + '/xServer/submitpayment', JSON.stringify(submitPaymentRequest)).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  // Get a profile.
  getPriceLock(priceLockId: string): Observable<any> {
    const params = new HttpParams().set('priceLockId', priceLockId);
    return this.http.get(this.x42ApiUrl + '/xServer/getpricelock', { params }).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  // Reserve a profile.
  reserveProfile(profileReserveRequest: ProfileReserveRequest): Observable<any> {
    return this.http.post(this.x42ApiUrl + '/xServer/reserveprofile', JSON.stringify(profileReserveRequest)).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  getAddressBookAddresses(): Observable<any> {
    return this.pollingInterval.pipe(
      startWith(0),
      switchMap(() => this.getAddressBookAddressesPolling()),
      catchError(err => this.handleHttpError(err))
    );
  }

  private async getAddressBookAddressesPolling() {
    if (!this.addressBookPolling) {
      this.addressBookPolling = true;
      const response = await this.http.get(this.x42ApiUrl + '/AddressBook').toPromise();
      this.addressBookPolling = false;
      return response;
    }
  }

  addAddressBookAddress(data: AddressLabel): Observable<any> {
    return this.http.post(this.x42ApiUrl + '/AddressBook/address', JSON.stringify(data)).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  removeAddressBookAddress(label: string): Observable<any> {
    const params = new HttpParams().set('label', label);
    return this.http.delete(this.x42ApiUrl + '/AddressBook/address', { params }).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  getColdHotState(walletName: string): Observable<boolean> {
    const params = new HttpParams().set('Name', walletName);
    return this.http.get<boolean>(this.x42ApiUrl + '/wallet/getcoldhotstate', { params }).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  toggleColdHotState(data: ColdHotStateRequest): Observable<any> {
    return this.http.post(this.x42ApiUrl + '/wallet/setcoldhotstate', JSON.stringify(data)).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  // Gets available wallets at the default path
  getWalletFiles(): Observable<any> {
    return this.http.get(this.x42ApiUrl + '/wallet/files').pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  /** Gets the extended public key from a certain wallet */
  getExtPubkey(data: WalletInfo): Observable<any> {
    const params = new HttpParams()
      .set('walletName', data.walletName)
      .set('accountName', 'account 0');

    return this.http.get(this.x42ApiUrl + '/wallet/extpubkey', { params }).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  // Get a new mnemonic
  getNewMnemonic(): Observable<any> {
    const params = new HttpParams()
      .set('language', 'English')
      .set('wordCount', '12');

    return this.http.get(this.x42ApiUrl + '/wallet/mnemonic', { params }).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  // Create a new x42 wallet.
  createX42Wallet(data: WalletCreation): Observable<any> {
    return this.http.post(this.x42ApiUrl + '/wallet/create/', JSON.stringify(data)).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  // Recover a x42 wallet.
  recoverX42Wallet(data: WalletRecovery): Observable<any> {
    return this.http.post(this.x42ApiUrl + '/wallet/recover/', JSON.stringify(data)).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  // Load a x42 wallet
  loadX42Wallet(data: WalletLoad): Observable<any> {
    return this.http.post(this.x42ApiUrl + '/wallet/load/', JSON.stringify(data)).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  // Get wallet status info from the API.
  getWalletStatus(): Observable<any> {
    return this.http.get(this.x42ApiUrl + '/wallet/status').pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  // Get general wallet info from the API once.
  getGeneralInfoOnce(data: WalletInfo): Observable<any> {
    const params = new HttpParams().set('Name', data.walletName);
    return this.http.get(this.x42ApiUrl + '/wallet/general-info', { params }).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  // Get general wallet info from the API.
  getGeneralInfo(data: WalletInfo, silent?: boolean): Observable<any> {
    const params = new HttpParams().set('Name', data.walletName);
    return this.pollingInterval.pipe(
      startWith(0),
      switchMap(() => this.getGeneralInfoPolling(params)),
      catchError(err => this.handleHttpError(err, silent))
    );
  }

  private async getGeneralInfoPolling(params) {
    if (!this.generalInfoPolling) {
      this.generalInfoPolling = true;
      const response = await this.http.get(this.x42ApiUrl + '/wallet/general-info', { params }).toPromise();
      this.generalInfoPolling = false;
      return response;
    }
  }

  // Gets the unspent outputs of a specific vout in a transaction.
  getTxOut(trxid: string, includeMemPool: boolean, silent?: boolean): Observable<TransactionOutput> {
    const params = new HttpParams()
      .set('trxid', trxid)
      .set('includeMemPool', includeMemPool ? 'true' : 'false');
    return this.pollingInterval.pipe(
      startWith(0),
      switchMap(() => this.getTxOutPolling(params)),
      catchError(err => this.handleHttpError(err, silent))
    );
  }

  private async getTxOutPolling(params) {
    if (!this.txOutPolling) {
      this.txOutPolling = true;
      const response = await this.http.get<TransactionOutput>(this.x42ApiUrl + '/Node/gettxout', { params }).toPromise();
      this.txOutPolling = false;
      return response;
    }
  }

  // Get wallet balance info from the API.
  getWalletBalance(data: WalletInfo, silent?: boolean): Observable<any> {
    const params = new HttpParams()
      .set('walletName', data.walletName)
      .set('accountName', data.accountName);
    return this.pollingInterval.pipe(
      startWith(0),
      switchMap(() => this.getWalletBalancePolling(params)),
      catchError(err => this.handleHttpError(err, silent))
    );
  }

  private async getWalletBalancePolling(params) {
    if (!this.walletBalancePolling) {
      this.walletBalancePolling = true;
      const response = await this.http.get(this.x42ApiUrl + '/wallet/balance', { params }).toPromise();
      this.walletBalancePolling = false;
      return response;
    }
  }

  /**
   * Get the maximum sendable amount for a given fee from the API
   */
  getMaximumBalance(data): Observable<any> {
    const params = new HttpParams()
      .set('walletName', data.walletName)
      .set('accountName', 'account 0')
      .set('feeType', data.feeType)
      .set('allowUnconfirmed', 'true');
    return this.http.get(this.x42ApiUrl + '/wallet/maxbalance', { params }).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  /**
   * Get a wallets transaction history info from the API.
   */
  getWalletHistory(data: WalletInfo, skip: number = -1, take: number = -1, silent?: boolean): Observable<any> {
    let params = new HttpParams()
      .set('walletName', data.walletName)
      .set('accountName', data.accountName);
    if (take > 0) {
      params = params.set('Skip', skip.toString())
        .set('Take', take.toString());
    }
    return this.pollingInterval.pipe(
      startWith(0),
      switchMap(() => this.getWalletHistoryBalancePolling(params)),
      catchError(err => this.handleHttpError(err, silent))
    );
  }

  private async getWalletHistoryBalancePolling(params) {
    if (!this.walletHistoryPolling) {
      this.walletHistoryPolling = true;
      const response = await this.http.get(this.x42ApiUrl + '/wallet/history', { params }).toPromise();
      this.walletHistoryPolling = false;
      return response;
    }
  }

  /**
   * Get a wallets transaction slim history info from the API.
   */
  getWalletHistorySlim(data: WalletInfo, skip: number = -1, take: number = -1, silent?: boolean): Observable<any> {
    let params = new HttpParams()
      .set('walletName', data.walletName)
      .set('accountName', data.accountName);
    if (take > 0) {
      params = params.set('Skip', skip.toString())
        .set('Take', take.toString());
    }
    return this.pollingInterval.pipe(
      startWith(0),
      switchMap(() => this.getWalletHistorySlimBalancePolling(params)),
      catchError(err => this.handleHttpError(err, silent))
    );
  }

  private async getWalletHistorySlimBalancePolling(params) {
    if (!this.walletHistorySlimPolling) {
      this.walletHistorySlimPolling = true;
      const response = await this.http.get(this.x42ApiUrl + '/wallet/historyslim', { params }).toPromise();
      this.walletHistorySlimPolling = false;
      return response;
    }
  }

  /**
   * Get an unused receive address for a certain wallet from the API.
   */
  getUnusedReceiveAddress(data: WalletInfo): Observable<any> {
    const params = new HttpParams()
      .set('walletName', data.walletName)
      .set('accountName', 'account 0')
      .set('Segwit', this.addressType.IsSegwit());
    console.log(params);
    return this.http.get(this.x42ApiUrl + '/wallet/unusedaddress', { params }).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  /**
   * Get multiple unused receive addresses for a certain wallet from the API.
   */
  getUnusedReceiveAddresses(data: WalletInfo, count: string): Observable<any> {
    const params = new HttpParams()
      .set('walletName', data.walletName)
      .set('accountName', 'account 0')
      .set('count', count)
      .set('Segwit', this.addressType.IsSegwit());
    console.log(params);
    return this.http.get(this.x42ApiUrl + '/wallet/unusedaddresses', { params }).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  /**
   * Get get all addresses for an account of a wallet from the API.
   */
  getAllAddresses(data: WalletInfo): Observable<any> {
    const params = new HttpParams()
      .set('walletName', data.walletName)
      .set('accountName', data.accountName)
      .set('Segwit', this.addressType.IsSegwit());
    console.log(params);
    return this.http.get(this.x42ApiUrl + '/wallet/addresses', { params }).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  /**
   * Get get all addresses for an account of a wallet from the API.
   * All Non-Segwit for xServer support.
   */
  getNonSegwitAddresses(data: WalletInfo): Observable<any> {
    const params = new HttpParams()
      .set('walletName', data.walletName)
      .set('accountName', data.accountName)
      .set('Segwit', 'false');
    console.log(params);
    return this.http.get(this.x42ApiUrl + '/wallet/addresses', { params }).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  /**
   * Estimate the fee of a transaction
   */
  estimateFee(data: FeeEstimation, silent?: boolean): Observable<any> {
    return this.http.post(this.x42ApiUrl + '/wallet/estimate-txfee', {
      walletName: data.walletName,
      accountName: data.accountName,
      recipients: [
        {
          destinationAddress: data.recipients[0].destinationAddress,
          amount: data.recipients[0].amount
        }
      ],
      feeType: data.feeType,
      allowUnconfirmed: true
    }).pipe(
      catchError(err => this.handleHttpError(err, silent))
    );
  }

  /**
   * Estimate the fee of a sidechain transaction
   */
  estimateSidechainFee(data: SidechainFeeEstimation): Observable<any> {
    return this.http.post(this.x42ApiUrl + '/wallet/estimate-txfee', {
      walletName: data.walletName,
      accountName: data.accountName,
      recipients: [
        {
          destinationAddress: data.recipients[0].destinationAddress,
          amount: data.recipients[0].amount
        }
      ],
      feeType: data.feeType,
      allowUnconfirmed: true
    }).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  /**
   * Build a transaction
   */
  buildTransaction(data: TransactionBuilding, silent?: boolean): Observable<any> {
    return this.http.post(this.x42ApiUrl + '/wallet/build-transaction', JSON.stringify(data)).pipe(
      catchError(err => this.handleHttpError(err, silent))
    );
  }

  /**
   * Send transaction
   */
  sendTransaction(data: TransactionSending, silent?: boolean): Observable<any> {
    return this.http.post(this.x42ApiUrl + '/wallet/send-transaction', JSON.stringify(data)).pipe(
      catchError(err => this.handleHttpError(err, silent))
    );
  }

  /** Remove transaction */
  removeTransaction(walletName: string): Observable<any> {
    const params = new HttpParams()
      .set('walletName', walletName)
      .set('all', 'true')
      .set('resync', 'true');
    return this.http.delete(this.x42ApiUrl + '/wallet/remove-transactions', { params }).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  /** Rescan wallet from a certain date using remove-transactions */
  rescanWallet(data: WalletRescan): Observable<any> {
    const params = new HttpParams()
      .set('walletName', data.name)
      .set('fromDate', data.fromDate.toDateString())
      .set('reSync', 'true');
    return this.http.delete(this.x42ApiUrl + '/wallet/remove-transactions/', { params }).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  /**
   * Sign the given message with the private key of the given address
   */
  signMessage(data: SignMessageRequest): Observable<SignMessageResponse> {
    return this.http.post<SignMessageResponse>(this.x42ApiUrl + '/wallet/signmessage', JSON.stringify(data)).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  /**
   * Verify the given signature with the given address
   */
  verifyMessage(data: VerifyRequest): Observable<any> {
    return this.http.post(this.x42ApiUrl + '/wallet/verifymessage', JSON.stringify(data)).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  /**
   * Start staking
   */
  startStaking(data: any): Observable<any> {
    return this.http.post(this.x42ApiUrl + '/staking/startstaking', JSON.stringify(data)).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  /**
   * Get staking info
   */
  getStakingInfo(): Observable<any> {
    return this.pollingInterval.pipe(
      startWith(0),
      switchMap(() => this.getStakingInfoPolling()),
      catchError(err => this.handleHttpError(err))
    );
  }

  private async getStakingInfoPolling() {
    if (!this.stakingInfoPolling) {
      this.stakingInfoPolling = true;
      const response = await this.http.get(this.x42ApiUrl + '/staking/getstakinginfo').toPromise();
      this.stakingInfoPolling = false;
      return response;
    }
  }

  /** Stop staking */
  stopStaking(): Observable<any> {
    return this.http.post(this.x42ApiUrl + '/staking/stopstaking', 'true').pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  /**
   * Send shutdown signal to the daemon
   */
  shutdownNode(): Observable<any> {
    return this.http.post(this.x42ApiUrl + '/node/shutdown', 'true').pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  /**
   * Get address information if valid.
   */
  validateAddress(address: string): Observable<ValidateAddressResponse> {
    const params = new HttpParams()
      .set('address', address);
    return this.http.get<ValidateAddressResponse>(this.x42ApiUrl + '/node/validateaddress', { params }).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  /*
    * Get the active smart contract wallet address.
    */
  getAccountAddress(walletName: string): Observable<any> {
    const params = new HttpParams().set('walletName', walletName);
    return this.http.get(this.x42ApiUrl + '/smartcontractwallet/account-address', { params }).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  getAccountAddresses(walletName: string): any {
    const params = new HttpParams().set('walletName', walletName);
    return this.http.get(this.x42ApiUrl + '/smartcontractwallet/account-addresses', { params }).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  /*
    * Get the balance of the active smart contract address.
    */
  getAccountBalance(walletName: string): Observable<any> {
    const params = new HttpParams().set('walletName', walletName);
    return this.http.get(this.x42ApiUrl + '/smartcontractwallet/account-balance', { params }).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  /*
    * Get the balance of the active smart contract address.
    */
  getAddressBalance(address: string): Observable<any> {
    const params = new HttpParams().set('address', address);
    return this.pollingInterval.pipe(
      startWith(0),
      switchMap(() => this.http.get(this.x42ApiUrl + '/smartcontractwallet/address-balance', { params })),
      catchError(err => this.handleHttpError(err))
    );
  }

  /*
    * Gets the transaction history of the smart contract account.
    */
  getAccountHistory(walletName: string, address: string): Observable<any> {
    const params = new HttpParams()
      .set('walletName', walletName)
      .set('address', address);
    return this.pollingInterval.pipe(
      startWith(0),
      switchMap(() => this.http.get(this.x42ApiUrl + '/smartcontractwallet/history', { params })),
      catchError(err => this.handleHttpError(err))
    );
  }

  /*
    * Posts a contract creation transaction
    */
  postCreateTransaction(transaction: any): Observable<any> {
    return this.http.post(this.x42ApiUrl + '/smartcontractwallet/create', transaction).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  /*
    * Posts a coin split request
    */
  postCoinSplit(splitCoins: SplitCoins): Observable<any> {
    return this.http.post(this.x42ApiUrl + '/wallet/splitcoins', splitCoins).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  /*
    * Posts a contract call transaction
    */
  postCallTransaction(transaction: any): Observable<any> {
    return this.http.post(this.x42ApiUrl + '/smartcontractwallet/call', transaction).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  /*
    * Returns the receipt for a particular txhash, or empty JSON.
    */
  getReceipt(hash: string): any {
    const params = new HttpParams().set('txHash', hash);
    return this.http.get(this.x42ApiUrl + '/smartcontracts/receipt', { params }).pipe(
      catchError(err => this.handleHttpError(err))
    );
  }

  private handleHttpError(error: HttpErrorResponse, silent?: boolean) {
    console.log(error);
    if (error.status >= 400) {
      if (error.error.errors[0].message && !silent) {
        this.modalService.openModal(null, error.error.errors[0].message);
      }
    }
    console.log(error);
    return throwError(error);
  }

  /** Use this to handle error in the initial startup (wallet/files) of xCore. */
  handleInitialError(error: HttpErrorResponse | any) {
    // Only show snackbar errors when we have connected. Initially we will receive some errors due to aggresive
    // attempts at connecting to the node.
    if (this.appState.connected) {
      this.handleException(error);
    }

    return throwError(error);
  }

  /** Use this to handle error (exceptions) that happens in RXJS pipes. This handler will rethrow the error. */
  handleError(error: HttpErrorResponse | any) {
    this.handleException(error);
    return throwError(error);
  }

  /** Use this to handle errors (exceptions) that happens outside of an RXJS pipe. See the "handleError" for pipeline error handling. */
  handleException(error: HttpErrorResponse | any) {
    let errorMessage = '';

    if (error.error instanceof ErrorEvent) {
      errorMessage = 'An error occurred:' + error.error.message;
      // A client-side or network error occurred. Handle it accordingly.
    } else if (error.error.errors) {
      errorMessage = `${error.error.errors[0].message} (Code: ${error.error.errors[0].status})`;
    } else if (error.name === 'HttpErrorResponse') {
      errorMessage = `Unable to connect with background daemon: ${error.message} (${error.status})`;
      // if (error.error.target.__zone_symbol__xhrURL.indexOf('api/wallet/files') > -1) {
      // }
    } else {
      errorMessage = `Error: ${error.message} (${error.status})`;
    }

    this.log.error(errorMessage);

    this.notifications.add({
      title: 'Communication error',
      hint: 'These types of errors are not uncommon, happens when there is issues communicating between xCore and x42.Node process',
      message: errorMessage,
      icon: 'warning'
    });

    // if (errorMessage.indexOf('Http failure response for') === -1) {
    // this.snackBar.open(errorMessage, null, { duration: 5000, panelClass: 'error-snackbar' });
    // }
  }
}
