/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, brackets */
define(function (require, exports, module) {
    "use strict";

    var BaseServer              = brackets.getModule("LiveDevelopment/Servers/BaseServer").BaseServer,
        LiveDevelopmentUtils    = brackets.getModule("LiveDevelopment/LiveDevelopmentUtils"),
        BlobUtils               = brackets.getModule("filesystem/impls/filer/BlobUtils"),
        Filer                   = brackets.getModule("filesystem/impls/filer/BracketsFiler"),
        Content                 = brackets.getModule("filesystem/impls/lib/content"),
        Rewriter                = brackets.getModule("filesystem/impls/lib/HTMLRewriter");

    function HTMLServer(config) {
        config = config || {};
        BaseServer.call(this, config);
    }

    HTMLServer.prototype = Object.create(BaseServer.prototype);
    HTMLServer.prototype.constructor = HTMLServer;

    //Returns a pre-generated blob url based on path
    HTMLServer.prototype.pathToUrl = function(path) {
        return BlobUtils.getUrl(path);
    };
    //Returns a path based on blob url
    HTMLServer.prototype.urlToPath = function(url) {
        return BlobUtils.getFilename(url);
    };

    HTMLServer.prototype.start = function() {
        this.fs = Filer.fs();
    };

    HTMLServer.prototype.stop = function() {
        this.fs = null;
    };

    /**
     * Determines if this server can serve local file. LiveDevServerManager
     * calls this method when determining if a server can serve a file.
     * @param {string} localPath A local path to file being served.
     * @return {boolean} true When the file can be served, otherwise false.
     */
    HTMLServer.prototype.canServe = function (localPath) {
        // If we can't transform the local path to a project relative path,
        // the path cannot be served
        if (localPath === this._pathResolver(localPath)) {
            return false;
        }

        // Url ending in "/" implies default file, which is usually index.html.
        // Return true to indicate that we can serve it.
        if (localPath.match(/\/$/)) {
            return true;
        }

        return LiveDevelopmentUtils.isStaticHtmlFileExt(localPath);
    };

    /**
     * When a livedocument is added to the server cache, make sure live
     * instrumentation is enabled
     */
    HTMLServer.prototype.add = function (liveDocument) {
        if (liveDocument.setInstrumentationEnabled) {
            // enable instrumentation
            liveDocument.setInstrumentationEnabled(true);
        }
        BaseServer.prototype.add.call(this, liveDocument);
    };

    /**
     * If a livedoc exists, serves the instrumented version of the file as as a blob URL.
     * Otherwise, it serves only the file's contents as a blob URL.
     */
    HTMLServer.prototype.serveLiveDoc = function(url) {
        var path = BlobUtils.getFilename(url);
        var liveDocument = this._liveDocuments[path];
        var rewrittenHtml = Rewriter.rewrite(path, liveDocument.getResponseData().body);

        return Content.toURL(rewrittenHtml, "text/html");
    };

    exports.HTMLServer = HTMLServer;
});
