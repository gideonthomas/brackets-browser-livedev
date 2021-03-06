/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, brackets, appshell, DOMParser */
define(function (require, exports, module) {
    "use strict";

    var Content = require("nohost/src/content");
    var Log = require("nohost/src/log");
    var Async = require("nohost/lib/async");

    var Filer = appshell.MakeDrive;
    var Path = Filer.Path;

    /**
     * Rewrite all url(...) references to blob URL Objects from the fs.
     */
    function CSSRewriter(fs, path, css) {
        this.fs = fs;
        this.path = path;
        this.dir = Path.dirname(path);      
        this.css = css;
    }

    CSSRewriter.prototype.urls = function(callback) {
        var fs = this.fs;
        var path = this.path;
        var dir = this.dir;
        var css = this.css;

        // Do a two stage pass of the css content, replacing all interesting url(...)
        // uses with the contents of files in the server root.
        // Thanks to Pomax for helping with this
        function aggregate(content, callback) {
            var urls = [];

            function fetch(input, replacements, next) {
                if(input.length === 0) {
                    return next(false, replacements);
                }

                var filename = input.splice(0,1)[0];
                fs.readFile(Path.resolve(dir, filename), null, function(err, data) {
                    if(err) {
                        return next("failed on " + path, replacements);
                    }

                    // Queue a function to do the replacement in the second pass
                    replacements.push(function(content) {
                        // Swap the filename with the contents of the file
                        var filenameCleaned = filename.replace(/\./g, '\\.').replace(/\//g, '\\/');
                        var regex = new RegExp(filenameCleaned, 'gm');
                        var mime = Content.mimeFromExt(Path.extname(filename));
                        return content.replace(regex, Content.toURL(data, mime));
                    });
                    fetch(input, replacements, next);
                });
            }

            function fetchFiles(list, next) {
                fetch(list, [], next);
            }

            content.replace(/url\(['"]?([^'"\)]+)['"]?\)/g, function(_, url) {
                if(!Content.isRelativeURL(url)) {
                    return;
                }
                urls.push(url);
            });
            fetchFiles(urls, callback);
        }

        aggregate(css, function(err, replacements) {
            if(err) {
                callback(err);
                return;
            }
            replacements.forEach(function(replacement) {
                css = replacement(css);
            });
            callback(null, css);
        });
    };

    function rewriteCSS(css, path, fs, callback) {
        var rewriter = new CSSRewriter(fs, path, css);
        rewriter.urls(callback);
    }


    /**
     * Rewrite all external resources (links, scripts, img sources, ...) to
     * blob URL Objects from the fs.
     */
    function HTMLRewriter(fs, path, html) {
        this.fs = fs;
        this.path = path;
        this.dir = Path.dirname(path);

        // Turn this html into a DOM, process it
        var parser = new DOMParser();
        this.doc = parser.parseFromString(html, 'text/html');
    }

    HTMLRewriter.prototype.elements = function(type, urlType, mime, callback) {
        var elems = this.doc.querySelectorAll(type);
        var fs = this.fs;
        var dir = this.dir;

        Async.eachSeries(elems, function(elem, callback) {
            // Skip any links for protocols (we only want relative paths)
            var url = elem.getAttribute(urlType);
            if(!Content.isRelativeURL(url)) {
                return callback();
            }

            var path = Path.resolve(dir, url);
            fs.exists(path, function(found) {
                if(!found) {
                    return callback();
                }

                fs.readFile(path, null, function(err, data) {
                    if(err) {
                        return callback(err);
                    }

                    mime = mime || Content.mimeFromExt(Path.extname(path));
                    elem[urlType] = Content.toURL(data, mime);
                    callback();
                });
            });
        }, function eachSeriesfinished(err) {
            if(err) {
                Log.error(err);
            }
            callback();
        });
    };

    HTMLRewriter.prototype.links = function(callback) {
        var dir = this.dir;
        var path = this.path;
        var fs = this.fs;
        var elems = this.doc.querySelectorAll('link');

        Async.eachSeries(elems, function(elem, callback) {
            var url = elem.getAttribute('href');
            if(!Content.isRelativeURL(url)) {
                return callback();
            }

            var path = Path.resolve(dir, url);
            var ext = Path.extname(path);

            fs.exists(path, function(found) {
                if(!found) {
                    return callback();
                }

                fs.readFile(path, 'utf8', function(err, data) {
                    if(err) {
                        return callback(err);
                    }

                    if(Content.isHTML(ext)) {
                        rewriteHTML(data, path, fs, function(err, html) {
                            elem.href = Content.toURL(html, 'text/html');
                            callback();
                        });
                    } else if(ext === '.css') {
                        rewriteCSS(data, path, fs, function(err, css) {
                            elem.href = Content.toURL(css, 'text/css');
                            callback();
                        });
                    }
                    callback();
                });
            });
        }, function eachSeriesFinished(err) {
            if(err) {
                Log.error(err);
            }
            callback();
        });
    };

    HTMLRewriter.prototype.styles = function(callback) {
        var path = this.path;
        var fs = this.fs;
        var elems = this.doc.querySelectorAll('style');

        Async.eachSeries(elems, function(elem, callback) {
            var content = elem.innerHTML;
            if(!content) {
                return callback();
            }

            rewriteCSS(content, path, fs, function(err, css) {
                if(err) {
                    Log.error(err);
                    return callback(err);
                }
                elem.innerHTML = css;
                callback();
            });
        }, function(err) {
            if(err) {
                Log.error(err);
            }
            callback();
        });
    };

    HTMLRewriter.prototype.styleAttributes = function(callback) {
        var path = this.path;
        var fs = this.fs;
        var elems = this.doc.querySelectorAll('[style]');

        Async.eachSeries(elems, function(elem, callback) {
            var content = elem.getAttribute('style');
            if(!content) {
                return callback();
            }

            rewriteCSS(content, path, fs, function(err, css) {
                if(err) {
                    Log.error(err);
                    return callback(err);
                }
                elem.setAttribute('style', css);
                callback();
            });
        }, function(err) {
            if(err) {
                Log.error(err);
            }
            callback();
        });
    };

    function rewriteHTML(html, path, fs, callback) {
        var rewriter = new HTMLRewriter(fs, path, html);
        Async.series([
            rewriter.links,
            rewriter.styles,
            rewriter.styleAttributes,
            function(callback) {
                rewriter.elements('iframe', 'src', null, callback);
            },
            function(callback) {
                rewriter.elements('img', 'src', null, callback);
            },
            function(callback) {
                rewriter.elements('script', 'src', 'text/javascript', callback);
            },
            function(callback) {
                rewriter.elements('source', 'src', null, callback);
            },
            function(callback) {
                rewriter.elements('video', 'src', null, callback);
            },
            function(callback) {
                rewriter.elements('audio', 'src', null, callback);
            }
        ], function finishedRewriteSeries(err, result) {
            // Return the processed HTML
            var html = rewriter.doc.documentElement.innerHTML;
            callback(err, html);
        });
    }

    exports.rewriteHTML = rewriteHTML;
    exports.rewriteCSS = rewriteCSS;
});
