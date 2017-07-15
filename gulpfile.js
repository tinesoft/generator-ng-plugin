'use strict';
const fs = require('fs');
const path = require('path');
const gulp = require('gulp');
const gulpUtil = require('gulp-util');
const gulpShell = require('gulp-shell');
const execSync = require('child_process').execSync;

const gulpEslint = require('gulp-eslint');
const gulpMocha = require('gulp-mocha');
const gulpIstanbul = require('gulp-istanbul');
const gulpNsp = require('gulp-nsp');
const gulpPlumber = require('gulp-plumber');
const gulpCoveralls = require('gulp-coveralls');

//Bumping, Releasing tools
const gulpGit = require('gulp-git');
const gulpBump = require('gulp-bump');
const gulpConventionalChangelog = require('gulp-conventional-changelog');
const conventionalGithubReleaser = require('conventional-github-releaser');

const runSequence = require('run-sequence');
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

const getPackageJsonVersion = () => {
  // We parse the json file instead of using require because require caches
  // multiple calls so the version number won't be updated
  return JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;
};

const isOK = condition => {
  return condition ? gulpUtil.colors.green('[OK]') : gulpUtil.colors.red('[KO]');
};

const readyToRelease = () => {

  let isTravisPassing = /build #\d+ passed/.test(execSync('npm run check-travis').toString().trim());
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

gulp.task('static', () => {
  return gulp.src(['app/*.js', 'tests/**/*.js'])
    .pipe(gulpPlumber())
    .pipe(gulpEslint())
    .pipe(gulpEslint.format())
    .pipe(gulpEslint.failAfterError());
});

gulp.task('nsp', cb => {
  gulpNsp({ package: path.resolve('package.json') }, cb);
});

gulp.task('pre-test', () => {
  return gulp.src([
    'app/*.js'
  ])
    .pipe(gulpPlumber())
    .pipe(gulpIstanbul({
      includeUntested: true
    }))
    .pipe(gulpIstanbul.hookRequire());
});

gulp.task('test', ['pre-test'], cb => {
  let mochaErr;

  gulp.src('tests/**/*.js')
    .pipe(gulpPlumber())
    .pipe(gulpMocha({ reporter: 'spec', timeout: 10000 }))
    .on('error', err => {
      mochaErr = err;
    })
    .pipe(gulpIstanbul.writeReports())
    .on('end', () => {
      cb(mochaErr);
    });
});

// Watch changes on *.ts files and Compile
gulp.task('watch', () => {
  gulp.watch(['app/index.js', 'tests/**/*.js'], ['test']);
});

gulp.task('coveralls', ['test'], () => {
  if (!process.env.CI) {
    return;
  }

  return gulp.src(path.join(__dirname, 'coverage/lcov.info'))
    .pipe(gulpCoveralls());
});


// Release Tasks
gulp.task('changelog', () => {
  return gulp.src('CHANGELOG.md', { buffer: false })
    .pipe(gulpPlumber())
    .pipe(gulpConventionalChangelog({ preset: 'angular', releaseCount: 0 }))
    .pipe(gulp.dest('./'));
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

gulp.task('bump-version', () => {
  if (!argv.version) {
    gulpUtil.log(gulpUtil.colors.red(`You must specify which version to bump to (Possible values: 'major', 'minor', and 'patch')`));
    throw new Error(`Missing '--version' argument`);
  }
  return gulp.src('./package.json')
    .pipe(gulpPlumber())
    .pipe(gulpBump({ type: argv.version }))
    .pipe(gulp.dest('./'));
});

gulp.task('commit-changes', () => {
  let version = getPackageJsonVersion();
  return gulp.src('.')
    .pipe(gulpPlumber())
    .pipe(gulpGit.add())
    .pipe(gulpGit.commit(`chore(release): bump version number to ${version}`));
});

gulp.task('push-changes', (cb) => {
  gulpGit.push('origin', 'master', cb);
});

gulp.task('create-new-tag', (cb) => {
  let version = `v${getPackageJsonVersion()}`;
  gulpGit.tag(version, `chore(release): :sparkles: :tada: create tag for version ${version}`, (error) => {
    if (error) {
      return cb(error);
    }
    gulpGit.push('origin', 'master', { args: '--tags' }, cb);
  });

});

gulp.task('build', ['static', 'test'])

gulp.task('npm-publish', gulpShell.task('npm publish'));

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
      'npm-publish',
      (error) => {
        if (error) {
          gulpUtil.log(error.message);
        } else {
          gulpUtil.log(gulpUtil.colors.green('RELEASE FINISHED SUCCESSFULLY'));
        }
        cb(error);
      });

  }
});


gulp.task('prepublish', ['nsp']);
gulp.task('default', ['static', 'test', 'coveralls']);
