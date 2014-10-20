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
var merge = require('merge-stream');
var File = require('vinyl');
var streamFromArray = require('stream-from-array');

var liveReloadPort = 35729;
var targetDir = __dirname + '/target';

function indexPageStream(withLiveReload) {
    return gulp.src(build.indexFileGlob)
        .pipe(build.buildIndex({
            liveReloadPort: withLiveReload ? liveReloadPort : undefined
        }));
}

function manualPagesStream(withLiveReload) {
    return gulp.src(build.manualFileGlob)
        .pipe(build.buildPage({
            liveReloadPort: withLiveReload ? liveReloadPort : undefined
        }));
}

function clientScriptsStream() {
    return gulp.src('client/scripts/index.js', {base: 'client'})
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
        .pipe(sourcemaps.write('.'));
}

function clientStylesStream() {
    return gulp.src('client/styles/*.scss', {base: 'client'})
        .pipe(sourcemaps.init())
        .pipe(sass({
            outputStyle: 'compressed',
            includePaths: [
                'node_modules/bootstrap-sass/assets/stylesheets'
            ]
        }))
        .pipe(sourcemaps.write('.'));
}

function configFilesStream() {
    var cnameFile = new File({
        cwd: '/',
        base: '/',
        path: '/CNAME',
        contents: new Buffer('thistlejs.org')
    });

    return streamFromArray.obj([cnameFile]);
}

function allFilesStream(withLiveReload) {
    return merge(
        indexPageStream(withLiveReload),
        manualPagesStream(withLiveReload),
        clientScriptsStream(),
        clientStylesStream(),
        configFilesStream()
    );
}

gulp.task('build', function () {
    return allFilesStream()
        .pipe(build.makeGitCommit())
        .pipe(gulp.dest(targetDir));
});

gulp.task('dev-server', function () {
    var http = require('http');
    livereload.listen(liveReloadPort);
    var app = new static.Server(targetDir);
    http.createServer(function (req, res) {
        req.addListener('end', function () {
            app.serve(req, res);
        }).resume();
    }).listen(3000);

    function rebuildCb(stream) {
        return stream
            .pipe(gulp.dest(targetDir))
            .pipe(livereload());
    }

    gulp.watch('client/scripts/index.js', function () {
        return rebuildCb(clientScriptsStream());
    });
    gulp.watch('client/styles/*.scss', function () {
        return rebuildCb(clientStylesStream());
    });
    gulp.watch(build.indexFileGlob, function () {
        return rebuildCb(indexPageStream(true));
    });
    gulp.watch(build.manualFileGlob, function () {
        return rebuildCb(manualPagesStream(true));
    });
    gulp.watch('templates/**/*.html', function () {
        return rebuildCb(merge(
            indexPageStream(true),
            manualPagesStream(true)
        ));
    });
    return allFilesStream(true).pipe(gulp.dest(targetDir));
});

gulp.task('default', ['build']);
