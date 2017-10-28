/* eslint-disable no-warning-comments */
'use strict';
const Generator = require('yeoman-generator');
const ExcludeParser = require('./excluder');
const chalk = require('chalk');
const yosay = require('yosay');
const mkdirp = require('mkdirp');
const exec = require('child_process').exec;
const _ = require('lodash');

const prompts = require('./prompts');
const folders = require('./folders');
const files = require('./files');

const scopedProjectNameRegex = /^@[a-zA-Z0-9-]+\/([a-zA-Z0-9-]+)$/;

module.exports = class extends Generator {
  constructor(args, options) {
    super(args, options);


    // This make 'projectFolder' an argument
    this.argument('projectFolder', {
      description: 'Specify the folder to generate into',
      type: String,
      required: false
    });

    // This adds support for a `--skip-checks` flag
    this.option('skip-checks', {
      description: 'Skip checking the status of the required tools',
      type: Boolean,
      defaults: false
    });

    // This adds support for a `--skip-styles` flag
    this.option('skip-styles', {
      description: 'Skip generation of code to inline styles in Angular components',
      type: Boolean,
      defaults: false
    });

    // This adds support for a `--skip-demo` flag
    this.option('skip-demo', {
      description: 'Skip generation of demo application',
      type: Boolean,
      defaults: false
    });

    // This adds support for a `--skip-sample` flag
    this.option('skip-sample', {
      description: 'Skip generation of sample library',
      type: Boolean,
      defaults: false
    });

    // This adds support for a `--npm` flag
    this.option('npm', {
      description: 'Use npm instead of yarn',
      type: Boolean,
      defaults: false
    });

    this.projectFolder = this.options.projectFolder || '.';
    this.skipChecks = this.options.skipChecks;
    this.skipInstall = this.options.skipInstall;
    this.skipStyles = this.options.skipStyles;
    this.skipSample = this.options.skipSample;

    this.skipDemo = this.options.skipDemo;
    this.skipCache = this.options.skipCache;
    this.useYarn = !this.options.npm;

    /**
       * Print a error message.
       *
       * @param {string} value - message to print
       */
    this.error = msg => {
      this.log(`${chalk.red.bold('ERROR!')}\n${chalk.red(msg)}`);
    };

    /**
       * Print a warning message.
       *
       * @param {string} value - message to print
       */
    this.warning = msg => {
      this.log(`${chalk.yellow.bold('WARNING!')}\n${chalk.yellow(msg)}`);
    };

    /**
     *  Check if yarn is installed
     */
    this.checkYarn = () => {
      if (this.skipChecks || !this.useYarn) {
        return;
      }
      const done = this.async();
      exec('yarn --version', err => {
        if (err) {
          this.warning('yarn is not found on your computer.\n',
            ' Using npm instead');
          this.useYarn = false;
        } else {
          this.useYarn = true;
        }
        done();
      });
    };

    /**
     *  Check if yarn is installed
     */
    this.checkAngularCLI = () => {
      if (this.skipChecks) {
        return;
      }
      const done = this.async();
      exec('ng --version', err => {
        if (err) {
          this.warning('@angular/cli is not found on your computer.\n');
        }
        done();
      });
    };
  }

  initializing() {
    this.pkg = require('../package.json');
    this.checkYarn();
    this.checkAngularCLI();
  }

  prompting() {
    // Have Yeoman greet the user.
    this.log(yosay(
      `Welcome to the wondrous ${chalk.green(`ngx-library@${this.pkg.version}`)} generator!`
    ));

    let info = {
      git: {
        name: this.user.git.name(),
        email: this.user.git.email()
      }
    };

    let done = this.async();
    let init = () => {
      this.ngVersionMin = Number(this.ngVersion.split('.')[0]);
      this.demoProjectPageClass = `${_.upperFirst(_.camelCase(this.projectName))}DemoPage`;
      this.today = new Date();

      // Get project's name without the scope if any (@my-scope/[my-project])
      let match = scopedProjectNameRegex.exec(this.projectName);
      this.unscopedProjectName = match === null ? this.projectName : match[1];

      // Set up ng dependencies
      this.ngDependencies = [];
      for (let ngModule of this.ngModules) {
        this.ngDependencies.push(`"@angular/${ngModule}": "${(ngModule === 'router' && this.ngVersion === '2.0.0') ? '3.0.0' : this.ngVersion}"`);
      }

      // Set up  ng dev dependencies
      this.ngDevDependencies = [];
      if (this.ngModules.indexOf('compiler') === -1) {
        this.ngDevDependencies.push(`"@angular/compiler" : "${this.ngVersion}"`);
      }

      if (this.ngModules.indexOf('platform-server') === -1) {
        this.ngDevDependencies.push(`"@angular/platform-server" : "${this.ngVersion}"`);
      }

      if (this.ngModules.indexOf('platform-browser') === -1) {
        this.ngDevDependencies.push(`"@angular/platform-browser" : "${this.ngVersion}"`);
      }

      if (this.ngModules.indexOf('platform-browser-dynamic') === -1) {
        this.ngDevDependencies.push(`"@angular/platform-browser-dynamic" : "${this.ngVersion}"`);
      }

      if (this.ngVersion === '2.0.0') {
        this.ngDevDependencies.push('"@angular/compiler-cli" : "0.6.2"');
        this.ngDevDependencies.push('"zone.js" : "0.6.21"');
        this.ngDevDependencies.push('"rxjs" : "5.0.0-beta.12"');
        this.ngDevDependencies.push('"tslint" : "3.15.1"');
        this.ngDevDependencies.push('"gulp-tslint" : "6.1.1"'); // Because it depends on 'tslint'
        this.ngDevDependencies.push('"typescript" : "2.0.3"');
        this.ngDevDependencies.push('"awesome-typescript-loader" : "3.0.5"'); // Because it depends on 'typescript'
        this.ngDevDependencies.push('"codelyzer" : "1.0.0-beta.0"');
      } else {
        this.ngDevDependencies.push('"@angular/compiler-cli" : "4.0.0"');
        this.ngDevDependencies.push('"zone.js" : "0.8.13"');
        this.ngDevDependencies.push('"rxjs" : "5.0.1"');
        this.ngDevDependencies.push('"tslint" : "5.4.3"');
        this.ngDevDependencies.push('"gulp-tslint" : "8.1.1"'); // Because it depends on 'tslint'
        this.ngDevDependencies.push('"typescript" : "2.3.3"');
        this.ngDevDependencies.push('"awesome-typescript-loader" : "3.0.5"'); // Because it depends on 'typescript'
        this.ngDevDependencies.push('"codelyzer" : "3.1.1"');

        if (this.ngModules.indexOf('animations') === -1) {
          this.ngDevDependencies.push(`"@angular/animations" : "${this.ngVersion}"`);
        }
      }

      // Greenkeeper's excluded packages
      this.greenkeeperExclusions = [];
      if (this.useGreenkeeper) {
        let allDependencies = this.ngDependencies.concat(this.ngDevDependencies);
        let allDependenciesAsJsonText = `{${allDependencies.join(',\n')}}`;
        let excludedPackages = [..._.keys(JSON.parse(allDependenciesAsJsonText)), ...this.otherDependencies];
        this.greenkeeperExclusions = excludedPackages.map(p => `"${p}"`);

        this.greenkeeperExclusions.push('"@types/jasmine"'); // Workaround for issue with >=v2.5.41
      }

      // Generator's excluded files
      if (this.skipStyles || this.skipSample) {
        this.exclusions.push('src/module/component/lib.component.html');
        this.exclusions.push('src/module/component/lib.component.spec.ts');
        this.exclusions.push('src/module/component/lib.component.ts');
        this.exclusions.push('src/module/component/lib.component.scss');
      }

      if (this.skipSample) {
        this.exclusions.push('src/module/service/lib.service.ts');
        this.exclusions.push('src/module/service/lib.service.spec.ts');
        this.exclusions.push('src/module/lib.module.ts');
      }

      if (this.ngVersionMin < 4) {
        this.exclusions.push('src/tsconfig.lib.es5.json');
      }

      if (this.skipDemo) {
        this.exclusions.push('demo/e2e/app.e2e-spec.ts');
        this.exclusions.push('demo/e2e/app.po.ts');
        this.exclusions.push('demo/e2e/tsconfig.e2e.json');
        this.exclusions.push('demo/src/app/getting-started/getting-started.component.ts');
        this.exclusions.push('demo/src/app/getting-started/getting-started-routing.module.ts');
        this.exclusions.push('demo/src/app/getting-started/getting-started.component.html');
        this.exclusions.push('demo/src/app/getting-started/getting-started.component.scss');
        this.exclusions.push('demo/src/app/getting-started/getting-started.module.ts');
        this.exclusions.push('demo/src/app/getting-started/getting-started.component.spec.ts');
        this.exclusions.push('demo/src/app/home/home.component.html');
        this.exclusions.push('demo/src/app/home/home.component.ts');
        this.exclusions.push('demo/src/app/home/home.component.spec.ts');
        this.exclusions.push('demo/src/app/home/home.module.ts');
        this.exclusions.push('demo/src/app/home/home-routing.module.ts');
        this.exclusions.push('demo/src/app/home/home.component.scss');
        this.exclusions.push('demo/src/app/shared/content-wrapper/content-wrapper.component.ts');
        this.exclusions.push('demo/src/app/shared/content-wrapper/content-wrapper.component.html');
        this.exclusions.push('demo/src/app/shared/content-wrapper/content-wrapper.component.scss');
        this.exclusions.push('demo/src/app/shared/content-wrapper/content-wrapper.component.spec.ts');
        this.exclusions.push('demo/src/app/shared/footer/footer.component.html');
        this.exclusions.push('demo/src/app/shared/footer/footer.component.scss');
        this.exclusions.push('demo/src/app/shared/footer/footer.component.spec.ts');
        this.exclusions.push('demo/src/app/shared/footer/footer.component.ts');
        this.exclusions.push('demo/src/app/shared/header/header.component.html');
        this.exclusions.push('demo/src/app/shared/header/header.component.spec.ts');
        this.exclusions.push('demo/src/app/shared/header/header.component.scss');
        this.exclusions.push('demo/src/app/shared/header/header.component.ts');
        this.exclusions.push('demo/src/app/shared/index.ts');
        this.exclusions.push('demo/src/app/shared/shared.module.ts');
        this.exclusions.push('demo/src/app/app.component.spec.ts');
        this.exclusions.push('demo/src/app/app.module.ts');
        this.exclusions.push('demo/src/app/app-routing.module.ts');
        this.exclusions.push('demo/src/app/app.component.html');
        this.exclusions.push('demo/src/app/app.component.scss');
        this.exclusions.push('demo/src/app/app.component.ts');
        this.exclusions.push('demo/src/app/app.server.module.ts');
        this.exclusions.push('demo/src/assets/.gitkeep');
        this.exclusions.push('demo/src/assets/.npmignore');
        this.exclusions.push('demo/src/assets/logo.svg');
        this.exclusions.push('demo/src/environments/environment.prod.ts');
        this.exclusions.push('demo/src/environments/environment.ts');
        this.exclusions.push('demo/src/testing/index.ts');
        this.exclusions.push('demo/src/testing/router-stubs.ts');
        this.exclusions.push('demo/src/index.html');
        this.exclusions.push('demo/src/_variables.scss');
        this.exclusions.push('demo/src/favicon.ico');
        this.exclusions.push('demo/src/favicon.ico');
        this.exclusions.push('demo/src/main.server.ts');
        this.exclusions.push('demo/src/main.ts');
        this.exclusions.push('demo/src/polyfills.ts');
        this.exclusions.push('demo/src/styles.scss');
        this.exclusions.push('demo/src/test.ts');
        this.exclusions.push('demo/src/tsconfig.app.json');
        this.exclusions.push('demo/src/tsconfig.server.json');
        this.exclusions.push('demo/src/tsconfig.spec.json');
        this.exclusions.push('demo/src/typings.d.ts');
        this.exclusions.push('demo/.angular-cli.json');
        this.exclusions.push('demo/package.json');
        this.exclusions.push('demo/README.md');
        this.exclusions.push('demo/.editorconfig');
        this.exclusions.push('demo/.gitignore');
        this.exclusions.push('demo/karma.conf.js');
        this.exclusions.push('demo/prerender.ts');
        this.exclusions.push('demo/protractor.conf.js');
        this.exclusions.push('demo/proxy.conf.json');
        this.exclusions.push('demo/server.ts');
        this.exclusions.push('demo/tsconfig.json');
        this.exclusions.push('demo/tslint.json');
        this.exclusions.push('demo/webpack.server.config.js');
      }

      if (!this.useCompodoc) {
        this.exclusions.push('demo/proxy.conf.json');
      }
    };

    this.authorName = this.config.get('authorName');
    this.authorEmail = this.config.get('authorEmail');
    this.githubUsername = this.config.get('githubUsername');
    this.githubRepoName = this.config.get('githubRepoName') || this.config.get('projectName');
    this.projectName = this.config.get('projectName');
    this.projectVersion = this.config.get('projectVersion');
    this.projectDescription = this.config.get('projectDescription');
    this.projectKeywords = this.config.get('projectKeywords');
    this.ngPrefix = this.config.get('ngPrefix') || 'my-lib';
    this.ngVersion = this.config.get('ngVersion');
    this.ngModules = this.config.get('ngModules');
    this.otherDependencies = this.config.get('otherDependencies') || [];
    this.useGreenkeeper = this.config.get('useGreenkeeper');
    this.useCompodoc = this.config.get('useCompodoc');
    this.enforceNgGitCommitMsg = this.config.get('enforceNgGitCommitMsg');
    this.exclusions = this.config.get('exclusions') || [];

    if (this.fs.exists('.yo-rc.json') && !this.skipCache) {
      this.log(chalk.green('This is an existing project, using the configuration from your .yo-rc.json file to re-generate it...\n'));
      init();
      done();
    } else {
      this.prompt(prompts(info)).then(props => {
        this.authorName = props.authorName;
        this.authorEmail = props.authorEmail;
        this.githubUsername = props.githubUsername;
        this.githubRepoName = props.githubRepoName;
        this.projectName = props.projectName;
        this.projectVersion = props.projectVersion;
        this.projectDescription = props.projectDescription;
        this.projectKeywords = props.projectKeywords ? props.projectKeywords.split(',') : [];
        this.ngVersion = props.ngVersion;
        this.ngModules = props.ngModules;
        this.otherDependencies = props.otherDependencies ? props.otherDependencies.split(',') : [];
        this.ngPrefix = props.ngPrefix;
        this.useGreenkeeper = props.useGreenkeeper;
        this.useCompodoc = props.useCompodoc;
        this.enforceNgGitCommitMsg = props.enforceNgGitCommitMsg;

        // Filter ngModules
        if (this.ngVersion === '2.0.0' && this.ngModules.indexOf('animations') !== -1) {
          this.warning(`Module 'animations' is only available for angular v4+. Removing it.`);
          _.remove(this.ngModules, ngModule => ngModule === 'animations');
        }

        init();

        // Save config
        this.config.set('version', this.pkg.version);
        this.config.set('authorName', this.authorName);
        this.config.set('authorEmail', this.authorEmail);
        this.config.set('githubUsername', this.githubUsername);
        this.config.set('githubRepoName', this.githubRepoName);
        this.config.set('projectName', this.projectName);
        this.config.set('projectVersion', this.projectVersion);
        this.config.set('projectDescription', this.projectDescription);
        this.config.set('projectKeywords', this.projectKeywords);
        this.config.set('ngVersion', this.ngVersion);
        this.config.set('ngModules', this.ngModules);
        this.config.set('otherDependencies', this.otherDependencies);
        this.config.set('ngPrefix', this.ngPrefix);
        this.config.set('useGreenkeeper', this.useGreenkeeper);
        this.config.set('useCompodoc', this.useCompodoc);
        this.config.set('enforceNgGitCommitMsg', this.enforceNgGitCommitMsg);
        this.config.set('exclusions', this.exclusions);

        done();
      });
    }
  }

  writing() {
    // Initializes files that will be excluded
    let excluder = new ExcludeParser(this.exclusions, process.cwd());

    // Write files
    files.forEach(file => {
      if (excluder.isExcluded(file.path)) {
        this.log(`${chalk.yellow('Excluded')} ${file.path}`);
      } else if (file.isTpl) {
        this.fs.copyTpl(this.templatePath(file.name), this.destinationPath(`${this.projectFolder}/${file.path}`), this);
      } else {
        this.fs.copy(this.templatePath(file.name), this.destinationPath(`${this.projectFolder}/${file.path}`));
      }
    });

    // Write folders (empty are not created by 'mem-fs-editor' by default)
    folders.forEach(folder => mkdirp(`${this.projectFolder}/${folder}`));
  }

  install() {
    let installationDone = () => {
      this.log(`\nAlmost done (2/3). Running ${chalk.green('gulp npm-package')} to prepare your library package in dist/...`);
      this.spawnCommand('gulp', ['npm-package'], { cwd: `${this.projectFolder}` })
        .on('exit', code => {
          if (code === 0) {
            this.log(`\nAlmost done (3/3). Running ${chalk.green('gulp link')} to npm-link to locally built package in dist/...`);
            this.spawnCommand('gulp', ['link'], { cwd: `${this.projectFolder}` })
              .on('exit', code => {
                if (code === 0) {
                  this.log(yosay('All done ✌(-‿-)✌,\nHappy ng-hacking!'));
                } else {
                  this.error(`[gulp link] Failed to link the library...`);
                }
              });
          } else {
            this.error(`[gulp npm-package] Failed to package the library...`);
          }
        });
    };

    if (this.skipInstall) {
      this.warning(
        'You chose to skip automatic installation of dependencies. That\'s fine!\n' +
        'But remember to run these commands once you are done installing them yourself:\n' +
        `  1. ${chalk.green.bold('gulp build')} (requires every time you want to update your package in dist/ folder)\n` +
        `  2. ${chalk.green.bold('gulp link')}  (requires only once for demo app, to link to your local package in dist/\n`);

      this.log(yosay('All done ✌(-‿-)✌,\nHappy ng-hacking!'));
    } else {
      this.log(`\n\nAlmost done (1/3). Running ${this.useYarn ? chalk.green('yarn install') : chalk.green('npm install')} to install the required dependencies.`);
      this.useYarn ? this.yarnInstall(this.otherDependencies, { cwd: `${this.projectFolder}` }).then(installationDone) : this.npmInstall(this.otherDependencies, { cwd: `${this.projectFolder}` }).then(installationDone);
    }
  }
};
