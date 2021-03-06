// This is a transport injected into the browser via a script that handles the low
// level communication between the live development protocol handlers on both sides.
// This transport provides a postMessage mechanism. It's injected separately from the
// protocol handler so that the transport can be changed separately.

(function (global) {
    "use strict";
    
    var postMessageTransport = {
        /**
         * @private
         * An object that contains callbacks to handle various transport events. See `setCallbacks()`.
         * @type {?{connect: ?function, message: ?function(string), close: ?function}}
         */
        _callbacks: null,
        
        /**
         * Sets the callbacks that should be called when various transport events occur. 
         */
        setCallbacks: function (callbacks) {
            this._callbacks = callbacks;
        },
        
        /**
         * Sends a message over the transport.
         * @param {string} msgStr The message to send.
         */
        send: function (msgStr) {
            parent.postMessage(JSON.stringify({
                type: "message",
                message: msgStr
            }), "*");
        },
        
        /** 
         * Establish postMessage connection.
         */
        enable: function () {
            var self = this;
            
            // Listen for message.
            window.addEventListener("message", function (event) {
                console.log("[Brackets LiveDev] Got message: " + event.data);
                if (self._callbacks && self._callbacks.message) {
                    self._callbacks.message(event.data);
                }
            });
        }
    };
    
    global._Brackets_LiveDev_Transport = postMessageTransport;
}(this));
