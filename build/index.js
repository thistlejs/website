
var thistle = require('thistle');
var through = require('through2');
var gulp = require('gulp');
var path = require('path');
var fs = require('fs');
var marked = require('marked');

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

module.exports = {
    buildPage: buildPage,
    buildIndex: buildIndex,
    indexFileGlob: indexFileGlob,
    manualFileGlob: manualFileGlob
};
