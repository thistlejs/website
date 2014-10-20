
var thistle = require('thistle');
var through = require('through2');
var gulp = require('gulp');
var path = require('path');
var fs = require('fs');
var marked = require('marked');
var git = require('nodegit');
var Promise = require('bluebird');

var compiler = thistle();

var thistleRoot = path.dirname(require.resolve('thistle'));

var indexFileGlob = thistleRoot + '/README.md';
var manualFileGlob = thistleRoot + '/docs/**/*.md';
var pageTemplate = fs.readFileSync(__dirname + '/../templates/page.html', 'utf8');
var renderPage = compiler.compile(pageTemplate);

function buildIndex(opts) {
    opts = opts || {};
    opts.isIndex = true;
    return buildPage(opts);
}

function buildPage(opts) {
    opts = opts || {};
    var isIndex = opts.isIndex;

    var stream = through.obj(function (file, enc, cb) {
        if (file.isStream()) {
            throw new Error('Pages must be buffers');
        }

        if (isIndex) {
            file.path = file.path.replace(/\/README\.md$/, '/index.md');
        }

        if (file.path.match(/\.md$/) && file.isBuffer()) {
            file.path = file.path.replace(/\.md$/, '.html');

            var source = file.contents.toString('utf8');
            var stream = this;

            marked(source, {
                smartypants: true
            }, function (err, result) {
                if (err) {
                    stream.emit('error', err);
                    return;
                }

                var scope = {
                    pageContent: result,
                    stylesheetUrl: '/styles/main.css',
                    scriptUrl: '/scripts/index.js'
                };
                var pageHtml = compiler.serializeHtml(renderPage(scope));

                file.contents = new Buffer(pageHtml);
                stream.push(file);
                cb();
            });
        }
        else {
            this.push(file);
            cb();
        }
    });

    return stream;
}

function makeGitCommit(opts) {
    opts = opts || {};
    var ref = opts.ref || 'refs/heads/gh-pages';

    var rootTreeTmp = {};

    var stream = through.obj(
        {},
        function (file, enc, cb) {

            var fullPath = file.relative;
            var treeParts = fullPath.split(path.sep);
            var fileName = treeParts.pop();

            var treeTmp = rootTreeTmp;

            for (var i = 0; i < treeParts.length; i++) {
                var nextPart = treeParts[i];
                if (! treeTmp.hasOwnProperty(nextPart)) {
                    treeTmp[nextPart] = {};
                }
                treeTmp = treeTmp[nextPart];
            }

            if (file.isBuffer()) {
                treeTmp[fileName] = file.contents;

                // Pass through the file.
                stream.push(file);
                cb();
            }
            else if (file.isStream()) {
                var buffers = [];
                file.contents.on('data', function (chunk) {
                    buffers.push(chunk);
                });
                file.contents.on('end', function () {
                    treeTmp[fileName] = Buffer.concat(buffers);

                    // Pass through the file.
                    stream.push(file);
                    cb();
                });
            }
            else {
                // Probably a directory, so create an empty object for it.
                treeTmp[fileName] = {};

                // Pass through.
                stream.push(file);
                cb();
            }
        },
        function (cb) {
            git.Repo.open('.', function (err, repo) {

                function gitObj(tmpObj) {
                    if (tmpObj.constructor === Buffer) {
                        var deferred = Promise.pending();
                        repo.createBlobFromBuffer(tmpObj, function (err, oid) {
                            deferred.fulfill([oid, 0100644]);
                        });
                        return deferred.promise;
                    }
                    else {
                        var names = [];
                        var promises = [];
                        for (var k in tmpObj) {
                            if (tmpObj.hasOwnProperty(k)) {
                                names.push(k);
                                promises.push(gitObj(tmpObj[k]));
                            }
                        }

                        return Promise.all(promises).then(function (targets) {
                            var builder = repo.treeBuilder();
                            for (var i = 0; i < names.length; i++) {
                                var name = names[i];
                                var target = targets[i];
                                var mode = 0;
                                builder.insert(name, target[0], target[1]);
                            }
                            var deferred = Promise.pending();
                            builder.write(function (err, oid) {
                                deferred.fulfill([oid, 040000]);
                            });
                            return deferred.promise;
                        });
                    }
                }

                gitObj(rootTreeTmp).then(function (rootTreeDesc) {
                    var now = new Date();
                    var sig = git.Signature.create(
                        'build tool',
                        'buildtool@invalid',
                        Math.round(now.getTime() / 1000),
                        0
                    );

                    repo.createCommit(
                        ref,
                        sig,
                        sig,
                        'auto-generated commit',
                        rootTreeDesc[0],
                        [],
                        function (err, oid) {
                            console.log('created commit', oid);
                            cb();
                        }
                    );
                });
            });
        }
    );

    return stream;
}

module.exports = {
    buildPage: buildPage,
    buildIndex: buildIndex,
    indexFileGlob: indexFileGlob,
    manualFileGlob: manualFileGlob,
    makeGitCommit: makeGitCommit
};
