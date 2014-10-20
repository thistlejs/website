var gulp = require('gulp');
var browserify = require('gulp-browserify');
var brfs = require('brfs');
var ngAnnotate = require('gulp-ng-annotate');
var uglify = require('gulp-uglify');
var sass = require('gulp-sass');
var sourcemaps = require('gulp-sourcemaps');
var livereload = require('gulp-livereload');
var static = require('node-static');
var build = require('./build/index.js');
var fs = require('fs');

var liveReloadPort = 35729;
var targetDir = __dirname + '/target';

gulp.task('build-index-page', function () {
    return gulp.src(build.indexFileGlob)
        .pipe(build.buildIndex())
        .pipe(gulp.dest(targetDir));
});

gulp.task('build-manual-pages', function () {
    return gulp.src(build.manualFileGlob)
        .pipe(build.buildPage())
        .pipe(gulp.dest(targetDir));
});

gulp.task('build-client-scripts', function () {
    return gulp.src('scripts/index.js', {cwd: 'client'})
        .pipe(browserify({
            transforms: [brfs],
            insertGlobals: true,
            debug: true,
            noParse: [
                // Don't try to find require statements in these
                // client-specific libraries.
                require.resolve('angular'),
                require.resolve('angular-animate')
            ]
        }))
        .pipe(sourcemaps.init({loadMaps: true}))
        .pipe(ngAnnotate())
        .pipe(uglify())
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest(targetDir + '/scripts'))
        .pipe(livereload({auto:false}));
});

gulp.task('build-client-styles', function () {
    return gulp.src('styles/*.scss', {cwd: 'client'})
        .pipe(sourcemaps.init())
        .pipe(sass({
            outputStyle: 'compressed',
            includePaths: [
                'node_modules/bootstrap-sass/assets/stylesheets'
            ]
        }))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest(targetDir + '/styles'))
        .pipe(livereload({auto:false}));
})

gulp.task('build', [
    'build-index-page',
    'build-client-scripts',
    'build-client-styles'
], function (done) {
    fs.writeFileSync(targetDir + '/CNAME', 'thistlejs.org', 'utf8');

    done();
});

gulp.task('dev-server', ['build'], function () {
    var http = require('http');
    livereload.listen(liveReloadPort);
    var app = new static.Server(targetDir);
    http.createServer(function (req, res) {
        req.addListener('end', function () {
            app.serve(req, res);
        }).resume();
    }).listen(3000);
    gulp.watch('client/scripts/index.js', ['build-client-scripts']);
    gulp.watch('client/styles/*.scss', ['build-client-styles']);
    gulp.watch(build.indexFileGlob, ['build-index-page']);
    gulp.watch(build.manualFileGlob, ['build-manual-pages']);
    gulp.watch('templates/**/*.html', [
        'build-index-page',
        'build-manual-pages'
    ]);
});

gulp.task('default', ['build']);
