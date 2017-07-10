const _ = require('lodash');
const del = require('del');
const gulp = require('gulp');
const gulpUtil = require('gulp-util');
const helpers = require('./config/helpers');

/** TSLint checker */<% if(ngVersion === '4.0.0'){ %>
const tslint = require('tslint');<% } %>
const gulpTslint = require('gulp-tslint');

/** External command runner */
const process = require('process');
const gulpShell = require('gulp-shell');
const execSync = require('child_process').execSync;

/** File Access */
const fs = require('fs');
const path = require('path');
const gulpFile = require('gulp-file');

/** To properly handle pipes on error */
const pump = require('pump');

/** To upload code coverage to coveralls */
const gulpCoveralls = require('gulp-coveralls');

/** To order tasks */
const runSequence = require('run-sequence');

/** To compile & bundle the library with Angular & Rollup */<% if(ngVersion === '4.0.0') { %>
const ngc = require('@angular/compiler-cli/src/main').main;<% } else { %>
const ngc = (args) => {// Promesify version of the ngc compiler
  const project = args.p || args.project || '.';
  const cmd = helpers.platformPath(helpers.root('/node_modules/.bin/ngc'));
  return helpers.execp(`${cmd} -p ${project}`, {
    stdout: process.stdout,
    stderr: process.stderr
  });
};<% } %>
const rollup = require('rollup');
const rollupUglify = require('rollup-plugin-uglify');
const rollupSourcemaps = require('rollup-plugin-sourcemaps');

/** To load templates and styles in Angular components */
const gulpInlineNgTemplate = require('gulp-inline-ng2-template');<% if(!skipStyles) { %>

/** Sass style */
const sass = require('node-sass');
const cssnano = require('cssnano');
const postcss = require('postcss');
const autoprefixer = require('autoprefixer');
const stripInlineComments = require('postcss-strip-inline-comments');<% } %>

//Bumping, Releasing tools
const gulpGit = require('gulp-git');
const gulpBump = require('gulp-bump');
const gulpConventionalChangelog = require('gulp-conventional-changelog');
const conventionalGithubReleaser = require('conventional-github-releaser');

/** To load gulp tasks from multiple files */
const gulpHub = require('gulp-hub');

const yargs = require('yargs');
const argv = yargs
  .option('version', {
    alias: 'v',
    describe: 'Enter Version to bump to',
    choices: ['patch', 'minor', 'major']
  })
  .option('ghToken', {
    alias: 'gh',
    describe: 'Enter Github Token for releasing'
  })
  .argv;

const config = {
  libraryName: '<%= projectName %>',
  allSrc: 'src/**/*',
  allTs: 'src/**/!(*.spec).ts',<% if(!skipStyles) { %>
  allSass: 'src/**/*.(scss|sass)',
  allHtml: 'src/**/*.html',<% } %>
  demoDir: 'demo/',
  buildDir: 'tmp/',
  outputDir: 'dist/',
  coverageDir: 'coverage/'
};

const rootFolder = path.join(__dirname);
const buildFolder = path.join(rootFolder, `${config.buildDir}`);
const distFolder = path.join(rootFolder, `${config.outputDir}`);
const es5OutputFolder = path.join(buildFolder, 'lib-es5');
const es2015OutputFolder = path.join(buildFolder, 'lib-es2015');

//Helper functions
const startKarmaServer = (isTddMode, hasCoverage, cb) => {
  const karmaServer = require('karma').Server;
  const travis = process.env.TRAVIS;

  let config = { configFile: `${__dirname}/karma.conf.js`, singleRun: !isTddMode, autoWatch: isTddMode };

  if (travis) {
    config['browsers'] = ['Chrome_travis_ci']; // 'Chrome_travis_ci' is defined in "customLaunchers" section of config/karma.conf.js
  }

  config['hasCoverage'] = hasCoverage;

  new karmaServer(config, cb).start();
};

const getPackageJsonVersion = () => {
  // We parse the json file instead of using require because require caches
  // multiple calls so the version number won't be updated
  return JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;
};

const isOK = condition => {
  return condition ? gulpUtil.colors.green('[OK]') : gulpUtil.colors.red('[KO]');
};

const readyToRelease = () => {
  let isTravisPassing = /build #\d+ passed/.test(execSync('npm run check-travis').toString().trim()) ;
  let onMasterBranch = execSync('git symbolic-ref --short -q HEAD').toString().trim() === 'master';
  let canBump = !!argv.version;
  let canGhRelease = argv.ghToken || process.env.CONVENTIONAL_GITHUB_RELEASER_TOKEN;
  let canNpmPublish = !!execSync('npm whoami').toString().trim() && execSync('npm config get registry').toString().trim() === 'https://registry.npmjs.org/';

  gulpUtil.log(`[travis-ci]      Travis build on 'master' branch is passing............................................${isOK(isTravisPassing)}`);
  gulpUtil.log(`[git-branch]     User is currently on 'master' branch..................................................${isOK(onMasterBranch)}`);
  gulpUtil.log(`[npm-publish]    User is currently logged in to NPM Registry...........................................${isOK(canNpmPublish)}`);
  gulpUtil.log(`[bump-version]   Option '--version' provided, with value : 'major', 'minor' or 'patch'.................${isOK(canBump)}`);
  gulpUtil.log(`[github-release] Option '--ghToken' provided or 'CONVENTIONAL_GITHUB_RELEASER_TOKEN' variable set......${isOK(canGhRelease)}`);

  return isTravisPassing && onMasterBranch && canBump && canGhRelease && canNpmPublish;
};
<% if(!skipStyles) { %>
// Compile Sass to css
const styleProcessor = (stylePath, ext, styleFile, callback) => {
  /**
   * Remove comments, autoprefixer, Minifier
   */
  const processors = [
    stripInlineComments,
    autoprefixer,
    cssnano
  ];

  if (/\.(scss|sass)$/.test(ext[0])) {
    let sassObj = sass.renderSync({ file: stylePath });
    if (sassObj && sassObj['css']) {
      let css = sassObj.css.toString('utf8');
      postcss(processors).process(css).then(function (result) {
        result.warnings().forEach(function (warn) {
          gutil.warn(warn.toString());
        });
        styleFile = result.css;
        callback(null, styleFile);
      });
    }
  }
};
<% } %>
/////////////////////////////////////////////////////////////////////////////
// Cleaning Tasks
/////////////////////////////////////////////////////////////////////////////
gulp.task('clean:dist', () => {
  return del(config.outputDir);
});

gulp.task('clean:build', () => {
  return del(config.buildDir);
});

gulp.task('clean:coverage', () => {
  return del(config.coverageDir);
});<% if(useCompodoc){ %>

gulp.task('clean:doc', ()=>{
  return del(`${config.outputDir}/doc`);
});<% } %>

gulp.task('clean', ['clean:dist', 'clean:coverage', 'clean:build']);

/////////////////////////////////////////////////////////////////////////////
// Compilation Tasks
/////////////////////////////////////////////////////////////////////////////

gulp.task('lint', (cb) => {
  pump([
    gulp.src(config.allTs),
    gulpTslint(
      {
        <% if(ngVersion === '4.0.0'){%>program: tslint.Linter.createProgram('./tsconfig.json'),<% } %>
        formatter: 'verbose',
        configuration: 'tslint.json'
      }),
    gulpTslint.report()
  ], cb);
});

// Inline Styles and Templates into components
gulp.task('inline-templates', (cb) => {
  const options = {
    base: `${config.buildDir}`,<% if(!skipStyles) { %>
    styleProcessor: styleProcessor,<% } %>
    useRelativePaths: true
  };
  pump(
    [
      gulp.src(config.allTs),
      gulpInlineNgTemplate(options),
      gulp.dest(`${config.buildDir}`)
    ],
    cb);
});

// Prepare files for compilation
gulp.task('pre-compile', (cb)=>{
   pump([
    gulp.src([config.allSrc]),
    gulp.dest(config.buildDir)
    ], cb);
});

gulp.task('ng-compile',()=>{
  return Promise.resolve()
    // Compile to ES5.
    .then(() => ngc({ project: `${buildFolder}/<%= ngVersion === '2.0.0' ? 'tsconfig.lib.json' : 'tsconfig.lib.es5.json' %>` })
      .then(exitCode => exitCode === 0 ? Promise.resolve() : Promise.reject())
      .then(() => gulpUtil.log('ES5 compilation succeeded.'))
    )<% if(ngVersion === '4.0.0'){ %>
    // Compile to ES2015.
    .then(() => ngc({ project: `${buildFolder}/tsconfig.lib.json` })
      .then(exitCode => exitCode === 0 ? Promise.resolve() : Promise.reject())
      .then(() => gulpUtil.log('ES2015 compilation succeeded.'))
    )<% } %>
    .catch(e => {
      gulpUtil.log(gulpUtil.colors.red('ng-compilation failed. See below for errors.\n'));
      gulpUtil.log(gulpUtil.colors.red(e));
      process.exit(1);
    });
});

// Lint, Prepare Build, <% if(!skipStyles) { %>, Sass to css, Inline templates & Styles<% } %> and Compile
gulp.task('compile', (cb) => {
  runSequence('lint', 'pre-compile', 'inline-templates', 'ng-compile', cb);
});

// Watch changes on (*.ts, *.html<% if(!skipStyles) { %>, *.sass<% } %>) and Compile
gulp.task('watch', () => {
  gulp.watch([config.allTs, config.allHtml, <% if(!skipStyles) { %>config.allSass<% } %>], ['compile']);
});

// Build the 'dist' folder (without publishing it to NPM)
gulp.task('build', ['clean'], (cb) => {
  runSequence('compile', 'test', 'npm-package', 'rollup-bundle', cb);
});

/////////////////////////////////////////////////////////////////////////////
// Packaging Tasks
/////////////////////////////////////////////////////////////////////////////

// Prepare 'dist' folder for publication to NPM
gulp.task('npm-package', (cb) => {
  let pkgJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
  let targetPkgJson = {};
  let fieldsToCopy = ['version', 'description', 'keywords', 'author', 'repository', 'license', 'bugs', 'homepage'];

  targetPkgJson['name'] = config.libraryName;

  //only copy needed properties from project's package json
  fieldsToCopy.forEach((field) => { targetPkgJson[field] = pkgJson[field]; });

  targetPkgJson['main'] = `bundles/${config.libraryName}.umd.js`;
  targetPkgJson['module'] = `<%= ngVersion === '2.0.0' ? 'index.js' : '${config.libraryName}.js' %>`;
  targetPkgJson['es2015'] = `${config.libraryName}.js`;
  targetPkgJson['typings'] = `${config.libraryName}.d.ts`;


  // defines project's dependencies as 'peerDependencies' for final users
  targetPkgJson.peerDependencies = {};
  Object.keys(pkgJson.dependencies).forEach((dependency) => {
    targetPkgJson.peerDependencies[dependency] = `^${pkgJson.dependencies[dependency]}`;
  });

  // copy the needed additional files in the 'dist' folder
  pump(
    [
      gulp.src(['README.md', 'LICENSE', 'CHANGELOG.md', 
      `${config.buildDir}/lib-es5/**/*.d.ts`, 
      `${config.buildDir}/lib-es5/**/*.metadata.json`]),
      gulpFile('package.json', JSON.stringify(targetPkgJson, null, 2)),
      gulp.dest(config.outputDir)
    ], cb);
});

// Bundles the library as UMD<% if(ngVersion === '4.0.0'){ %>/FESM<% } %> bundles using RollupJS
gulp.task('rollup-bundle', (cb) => {
  return Promise.resolve()
  // Bundle lib.
  .then(() => {
    // Base configuration.
    const es5Entry = path.join(es5OutputFolder, `<%= ngVersion === '2.0.0' ? 'index.js' : '${config.libraryName}.js' %>`);
    const es2015Entry = path.join(es2015OutputFolder, `${config.libraryName}.js`);
    const globals = {
      // Angular dependencies <% for (ngModule of ngModules) { %>
      '@angular/<%= ngModule %>': 'ng.<%= ngModule %>',<% } %>

      // Rxjs dependencies
      'rxjs/Subject': 'Rx',
      'rxjs/add/observable/fromEvent': 'Rx.Observable',
      'rxjs/add/observable/forkJoin': 'Rx.Observable',
      'rxjs/add/observable/of': 'Rx.Observable',
      'rxjs/add/observable/merge': 'Rx.Observable',
      'rxjs/add/observable/throw': 'Rx.Observable',
      'rxjs/add/operator/auditTime': 'Rx.Observable.prototype',
      'rxjs/add/operator/toPromise': 'Rx.Observable.prototype',
      'rxjs/add/operator/map': 'Rx.Observable.prototype',
      'rxjs/add/operator/filter': 'Rx.Observable.prototype',
      'rxjs/add/operator/do': 'Rx.Observable.prototype',
      'rxjs/add/operator/share': 'Rx.Observable.prototype',
      'rxjs/add/operator/finally': 'Rx.Observable.prototype',
      'rxjs/add/operator/catch': 'Rx.Observable.prototype',
      'rxjs/add/observable/empty': 'Rx.Observable.prototype',
      'rxjs/add/operator/first': 'Rx.Observable.prototype',
      'rxjs/add/operator/startWith': 'Rx.Observable.prototype',
      'rxjs/add/operator/switchMap': 'Rx.Observable.prototype',
      'rxjs/Observable': 'Rx'
      // ATTENTION:
      // Add any other dependency or peer dependency your library here.
      // This is required for UMD bundle users.
    };
    const rollupBaseConfig = {
      moduleName: _.camelCase(config.libraryName),
      sourceMap: true,
      globals: globals,
      external: Object.keys(globals),
      plugins: [
        rollupSourcemaps()
      ]
    };

    // UMD bundle.
    const umdConfig = Object.assign({}, rollupBaseConfig, {
      entry: es5Entry,
      dest: path.join(distFolder, `bundles`, `${config.libraryName}.umd.js`),
      format: 'umd',
    });

    // Minified UMD bundle.
    const minifiedUmdConfig = Object.assign({}, rollupBaseConfig, {
      entry: es5Entry,
      dest: path.join(distFolder, `bundles`, `${config.libraryName}.umd.min.js`),
      format: 'umd',
      plugins: rollupBaseConfig.plugins.concat([rollupUglify({})])
    });<% if(ngVersion === '4.0.0'){ %>

    // ESM+ES5 flat module bundle.
    const fesm5config = Object.assign({}, rollupBaseConfig, {
      entry: es5Entry,
      dest: path.join(distFolder, `${config.libraryName}.es5.js`),
      format: 'es'
    });

    // ESM+ES2015 flat module bundle.
    const fesm2015config = Object.assign({}, rollupBaseConfig, {
      entry: es2015Entry,
      dest: path.join(distFolder, `${config.libraryName}.js`),
      format: 'es'
    });<% } %>

    const allBundles = [
      umdConfig,
      minifiedUmdConfig<% if(ngVersion === '4.0.0'){ %>,
      fesm5config,
      fesm2015config<% } %>
    ].map(cfg => rollup.rollup(cfg).then(bundle => bundle.write(cfg)));

    return Promise.all(allBundles)
      .then(() => gulpUtil.log('All bundles generated successfully.'))
  })
  .catch(e => {
    gulpUtil.log(gulpUtil.colors.red('rollup-bundling failed. See below for errors.\n'));
    gulpUtil.log(gulpUtil.colors.red(e));
    process.exit(1);
  });
});

<% if(useCompodoc){ %>
/////////////////////////////////////////////////////////////////////////////
// Documenation Tasks
/////////////////////////////////////////////////////////////////////////////
gulp.task('build:doc', gulpShell.task(`compodoc -p tsconfig.json --hideGenerator --disableCoverage -d  <%= skipDemo ? "${config.outputDir}/doc/": "${config.demoDir}/dist/doc/"%>`));

gulp.task('serve:doc', ['clean:doc'], gulpShell.task(`compodoc -p tsconfig.json -s -d  ${config.outputDir}/doc/`));<% } if(skipDemo) { %>

gulp.task('push:doc', gulpShell.task(`ngh --dir ${config.outputDir}/doc/ --message="chore(doc): :rocket: deploy new version"`));<% } %>

<% if(!skipDemo) { %>
/////////////////////////////////////////////////////////////////////////////
// Demo Tasks
/////////////////////////////////////////////////////////////////////////////
gulp.task('test:demo', gulpShell.task('ng test', { cwd: `${config.demoDir}` }));

gulp.task('serve:demo', gulpShell.task('ng serve<% if(useCompodoc){ %> --proxy-config proxy.conf.json<% } %>', { cwd: `${config.demoDir}` }));

gulp.task('build:demo', gulpShell.task(`ng build --prod --aot --base-href https://<%= githubUsername %>.github.io/${config.libraryName}/`, { cwd: `${config.demoDir}` }));

gulp.task('push:demo', gulpShell.task(`ngh --dir ${config.demoDir}/dist --message="chore(demo): :rocket: deploy new version"`));

gulp.task('deploy:demo', (cb) => {
  runSequence('build:demo'<%- (useCompodoc) ? ", 'build:doc'": ""%>, 'push:demo', cb);
});<% } %>


/////////////////////////////////////////////////////////////////////////////
// Test Tasks
/////////////////////////////////////////////////////////////////////////////
gulp.task('test', (cb) => {
  const ENV = process.env.NODE_ENV = process.env.ENV = 'test';
  startKarmaServer(false, true, cb);
});

gulp.task('test:ci', ['clean'], (cb) => {
  runSequence('compile', 'test');
});

gulp.task('test:watch', (cb) => {
  const ENV = process.env.NODE_ENV = process.env.ENV = 'test';
  startKarmaServer(true, true, cb);
});

gulp.task('test:watch-no-cc', (cb) => {//no coverage (useful for debugging failing tests in browser)
  const ENV = process.env.NODE_ENV = process.env.ENV = 'test';
  startKarmaServer(true, false, cb);
});

/////////////////////////////////////////////////////////////////////////////
// Release Tasks
/////////////////////////////////////////////////////////////////////////////
gulp.task('changelog', (cb) => {
  pump(
    [
      gulp.src('CHANGELOG.md', { buffer: false }),
      gulpConventionalChangelog({ preset: 'angular', releaseCount: 0 }),
      gulp.dest('./')
    ], cb);
});

gulp.task('github-release', (cb) => {
  if (!argv.ghToken && !process.env.CONVENTIONAL_GITHUB_RELEASER_TOKEN) {
    gulpUtil.log(gulpUtil.colors.red(`You must specify a Github Token via '--ghToken' or set environment variable 'CONVENTIONAL_GITHUB_RELEASER_TOKEN' to allow releasing on Github`));
    throw new Error(`Missing '--ghToken' argument and environment variable 'CONVENTIONAL_GITHUB_RELEASER_TOKEN' not set`);
  }

  conventionalGithubReleaser(
    {
      type: 'oauth',
      token: argv.ghToken || process.env.CONVENTIONAL_GITHUB_RELEASER_TOKEN
    },
    { preset: 'angular' },
    cb);
});

gulp.task('bump-version', (cb) => {
  if (!argv.version) {
    gulpUtil.log(gulpUtil.colors.red(`You must specify which version to bump to (Possible values: 'major', 'minor', and 'patch')`));
    throw new Error(`Missing '--version' argument`);
  }

  pump(
    [
      gulp.src('./package.json'),
      gulpBump({ type: argv.version }),
      gulp.dest('./'),
    ], cb);
});

gulp.task('commit-changes', (cb) => {
  let version = getPackageJsonVersion();
  pump(
    [
      gulp.src('.'),
      gulpGit.add(),
      gulpGit.commit(`chore(release): bump version number to ${version}`)
    ], cb);
});

gulp.task('push-changes', (cb) => {
  gulpGit.push('origin', 'master', cb);
});

gulp.task('create-new-tag', (cb) => {
  let version = `v${getPackageJsonVersion()}`;
  gulpGit.tag(version, `chore(release): :sparkles: :tada: create tag for version v${version}`, (error) => {
    if (error) {
      return cb(error);
    }
    gulpGit.push('origin', 'master', { args: '--tags' }, cb);
  });

});

// Build and then Publish 'dist' folder to NPM
gulp.task('npm-publish', ['build'], gulpShell.task(`npm publish ${config.outputDir}`));

// Perfom pre-release checks (no actual release)
gulp.task('pre-release', cb => {
  readyToRelease();
  cb();
});

gulp.task('release', (cb) => {
  gulpUtil.log('# Performing Pre-Release Checks...');
  if (!readyToRelease()) {
    gulpUtil.log(gulpUtil.colors.red('# Pre-Release Checks have failed. Please fix them and try again. Aborting...'));
    cb();
  }
  else {
    gulpUtil.log(gulpUtil.colors.green('# Pre-Release Checks have succeeded. Continuing...'));
    runSequence(
      'bump-version',
      'changelog',
      'commit-changes',
      'push-changes',
      'create-new-tag',
      'github-release',
      'npm-publish',<% if(!skipDemo || useCompodoc) { %>
      'deploy:<%= !skipDemo? "demo":"doc" %>',<% } %>
      (error) => {
        if (error) {
          gulpUtil.log(gulpUtil.colors.red(error.message));
        } else {
          gulpUtil.log(gulpUtil.colors.green('RELEASE FINISHED SUCCESSFULLY'));
        }
        cb(error);
      });
  }
});


/////////////////////////////////////////////////////////////////////////////
// Utility Tasks
/////////////////////////////////////////////////////////////////////////////

// Link 'dist' folder (create a local 'ng-scrollreveal' package that symlinks to it)
// This way, we can have the demo project declare a dependency on 'ng-scrollreveal' (as it should)
// and, thanks to 'npm link ng-scrollreveal' on demo project, be sure to always use the latest built
// version of the library ( which is in 'dist/' folder)
gulp.task('link', gulpShell.task('npm link', { cwd: `${config.outputDir}` }));

gulp.task('unlink', gulpShell.task('npm unlink', { cwd: `${config.outputDir}` }));

// Upload code coverage report to coveralls.io (will be triggered by Travis CI on successful build)
gulp.task('coveralls', (cb) => {
  pump(
    [
      gulp.src(`${config.coverageDir}/coverage.lcov`),
      gulpCoveralls()
    ], cb);
});

gulp.task('default', ['build']);

// Load additional tasks
gulpHub(['./config/gulp-tasks/*.js']);
