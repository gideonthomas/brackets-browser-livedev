define(function (require, exports, module) {
    "use strict";

    function Launcher(options) {
        var _browser = options.browser;
        var _server = options.server;

        Object.defineProperty(this, "browser", {
            configurable: false,
            get: function () {
                return _browser;
            }
        });

        Object.defineProperty(this, "server", {
            configurable: false,
            get: function () {
                return _server;
            }
        });
    }

    Launcher.prototype.launch = function(url) {
        var server = this.server;
        var browser = this.browser;

        server.maybeServeLiveDoc(url, function(err, url) {
            if (err) throw err;

            browser.update(url);
        });
    }

    // Define public API
    exports.Launcher = Launcher;
});
