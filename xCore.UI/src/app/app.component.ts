import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Title } from '@angular/platform-browser';

import { Subscription } from 'rxjs';
import { retryWhen, delay, tap } from 'rxjs/operators';

import { FullNodeApiService } from './shared/services/fullnode.api.service';
import { ElectronService } from 'ngx-electron';
import { GlobalService } from './shared/services/global.service';
import { ThemeService } from './shared/services/theme.service';

import { NodeStatus } from './shared/models/node-status';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})

export class AppComponent implements OnInit, OnDestroy {
  constructor(private router: Router, private themeService: ThemeService, private FullNodeApiService: FullNodeApiService, private globalService: GlobalService, private titleService: Title, private electronService: ElectronService) { }

  private subscription: Subscription;
  private readonly MaxRetryCount = 50;
  private readonly TryDelayMilliseconds = 3000;
  
  loading = true;
  loadingFailed = false;

  nodeStarted: boolean = false;
  nodeFailed: boolean = false;

  ngOnInit() {
    this.setTitle();
    this.themeService.setTheme();
    this.tryStartNode();
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  nodeFailedToLoad() {
    this.nodeFailed = true;
    this.loading = false;
    this.loadingFailed = true;
  }

  nodeLoaded() {
    this.nodeStarted = true;
    if (this.nodeStarted) {
      this.startx42();
    }
  }

  startx42() {
    setTimeout(() => {
      this.loading = false;
      this.router.navigate(['login']);
    }, 2000);
  }

  // Attempts to initialise the fullnode by contacting the daemon.  Will try to do this MaxRetryCount times.
  private tryStartNode() {
    let retry = 0;
    const stream$ = this.FullNodeApiService.getNodeStatus(true).pipe(
      retryWhen(errors =>
        errors.pipe(delay(this.TryDelayMilliseconds)).pipe(
          tap(errorStatus => {
            if (retry++ === this.MaxRetryCount) {
              throw errorStatus;
            }
            console.log(`Retrying ${retry}...`);
          })
        )
      )
    );

    this.subscription = stream$.subscribe(
      (data: NodeStatus) => {
        this.nodeLoaded();
      }, (error: any) => {
        console.log('Failed to start node');
        this.nodeFailedToLoad();
      }
    )

  }

  private setTitle() {
    let applicationName = "x42";
    let applicationVersion = this.globalService.getApplicationVersion();
    let newTitle = applicationName + " " + applicationVersion;
    this.titleService.setTitle(newTitle);
  }

  public openSupport() {
    this.electronService.shell.openExternal("https://github.com/x42protocol/x42/blob/master/README.md");
  }
}