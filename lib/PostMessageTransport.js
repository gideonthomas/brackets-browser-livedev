/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, forin: true, maxerr: 50, regexp: true */
/*global define, brackets*/

// This transport provides a PostMessage connection between Brackets and a live browser preview.

define(function (require, exports, module) {
    "use strict";

    var _iframeRef,
        connId = 1;

    var Launcher = require("./launcher");
    
    var EventDispatcher     = brackets.getModule("utils/EventDispatcher"),
        LiveDevMultiBrowser = brackets.getModule("LiveDevelopment/LiveDevMultiBrowser"),
        BlobUtils           = brackets.getModule("filesystem/impls/filer/BlobUtils"),
        Path                = brackets.getModule("filesystem/impls/filer/BracketsFiler").Path;
    
    // The script that will be injected into the previewed HTML to handle the other side of the post message connection.
    var PostMessageTransportRemote = require("text!lib/PostMessageTransportRemote.js");

    EventDispatcher.makeEventDispatcher(module.exports);
    
    /**
     * Saves a reference of the iframe element to a local variable
     * @param {DOM element reference to an iframe}
     */
    function setIframe(iframeRef) {
        if(iframeRef) {
            _iframeRef = iframeRef;
        }
    }

    /**
    * Message event listener
    */
    function _listener(event){
        var msgObj;
        try {
            msgObj = JSON.parse(event.data);
        } catch (e) {
            return;
        }
        console.log("_listener: ", msgObj);
        if(msgObj.type === "message"){
            //trigger message event
            module.exports.trigger("message", [connId, msgObj.message]);
            if(msgObj.message.method === "CSS.setStylesheetText") {
                reload();
            }
        } else if(msgObj.type === "connect"){
            //trigger message event
            module.exports.trigger("connect", [connId], "fakeURL");
            console.log("connection!");
        }
    }

    /**
    * Initializes the post message connection
    */
    function start(){
        window.addEventListener("message", _listener);
    }

    /**
    * Replaces paths of linked files with blob urls
    */
    function resolveLinks(message) {
        var currentDoc = LiveDevMultiBrowser._getCurrentLiveDoc();
        if(!currentDoc) {
            return message;
        }

        var currentDir = Path.dirname(currentDoc.doc.file.fullPath);
        var linkRegex = new RegExp('\\"(href|src)\\":\\"([^"]+)\\"', 'gm');
        var resolvedMessage = message.replace(linkRegex, function(match, attr, path) {
            path = BlobUtils.getUrl(path.charAt(0) === "/" ? path : Path.join(currentDir, path));

            return ["\"", attr, "\":\"", path, "\""].join("");
        });

        return resolvedMessage;
    }

    /**
     * Sends a transport-layer message via post message.
     * @param {number|Array.<number>} idOrArray A client ID or array of client IDs to send the message to.
     * @param {string} msgStr The message to send as a JSON string.
     */
    function send(idOrArray, msgStr){
        var win = _iframeRef.contentWindow;
        var msg = JSON.parse(msgStr);

        console.log("msgStr: ", msgStr);
        console.log("msg: ", msg);

        if(msg && msg.params && msg.params.expression) {
            msg.params.expression = resolveLinks(msg.params.expression);
        }

        msgStr = JSON.stringify(msg);

        win.postMessage(msgStr,"*");
        console.log("msg.method: ", msg.method);
        if(msg.method === "Page.reload" || msg.method === "Page.navigate" || msg.method === "CSS.setStylesheetText") {
            reload();
        }
    }

    /**
    * Removes the message event listener
    */
    function close(clientId){
        window.removeEventListener("message", _listener);
    }

    /**
     * Returns the script that should be injected into the browser to handle the other end of the transport.
     * @return {string}
     */
    function getRemoteScript() {
        return "<script>\n" +
            PostMessageTransportRemote +
            "</script>\n";
    }

    function reload() {
        var launcher = Launcher.getCurrentInstance();
        var liveDoc = LiveDevMultiBrowser._getCurrentLiveDoc();
        var url = BlobUtils.getUrl(liveDoc.doc.file.fullPath);

        launcher.launch(url);
    }
    
    // Exports
    module.exports.getRemoteScript = getRemoteScript;
    module.exports.setIframe       = setIframe;
    module.exports.start           = start;
    module.exports.send            = send;
    module.exports.close           = close;
});
