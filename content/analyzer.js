/* See license.txt for terms of usage */

define([], function() {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// ********************************************************************************************* //
// Cycle Collector Analyzer (listener)

var searchGeneration = 0;

function Analyzer()
{
    this.graph = null;
}

Analyzer.prototype =
{
    isEmpty: function()
    {
        return this.graph == null;
    },

    run: function(callback)
    {
        this.callback = callback;

        this.processingCount = 0;
        this.graph = {};
        this.roots = [];
        this.garbage = [];

        this.listener = Cc["@mozilla.org/cycle-collector-logger;1"].
            createInstance(Ci.nsICycleCollectorListener);

        //this.listener.allTraces();

        this.listener.disableLog = true;
        this.listener.wantAfterProcessing = true;

        // Run CC three times to collect trash coming from this extension.
        this.runCC(3);
    },

    runCC: function(counter)
    {
        if (--counter >= 0)
        {
            window.QueryInterface(Ci.nsIInterfaceRequestor).
                getInterface(Ci.nsIDOMWindowUtils).garbageCollect();

            setTimeout(this.runCC.bind(this, counter), 125);
        }
        else
        {
            window.QueryInterface(Ci.nsIInterfaceRequestor).
                getInterface(Ci.nsIDOMWindowUtils).garbageCollect(this.listener);

            this.processLog();
        }
    },

    processLog: function()
    {
        // Process entire heap step by step in 5K chunks
        for (var i=0; i<5000; i++)
        {
            if (!this.listener.processNext(this))
            {
                this.callback.onFinished.call(this.callback, this);
                //setTimeout(allObjects, 1000);
                return;
            }
        }

        this.callback.onProgress.call(this.callback, this);

        // Next chunk on timeout.
        setTimeout(this.processLog.bind(this), 125);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // nsICycleCollectorHandler

    noteRefCountedObject: function(aAddress, aRefCount, aObjectDescription)
    {
        var o = this.ensureObject(aAddress);
        o.address = aAddress;
        o.refcount = aRefCount;
        o.name = aObjectDescription;
    },

    noteGCedObject: function(aAddress, aMarked, aObjectDescription)
    {
        var o = this.ensureObject(aAddress);
        o.address = aAddress;
        o.gcmarked = aMarked;
        o.name = aObjectDescription;
    },

    noteEdge: function(aFromAddress, aToAddress, aEdgeName)
    {
        var fromObject = this.ensureObject(aFromAddress);
        var toObject = this.ensureObject(aToAddress);
        fromObject.edges.push({name: aEdgeName, to: toObject});
        toObject.owners.push({name: aEdgeName, from: fromObject});
    },

    describeRoot: function(aAddress, aKnownEdges)
    {
        var o = this.ensureObject(aAddress);
        o.root = true;
        o.knownEdges = aKnownEdges;
        this.roots.push(o);
    },

    describeGarbage: function(aAddress)
    {
        var o = this.ensureObject(aAddress);
        o.garbage = true;
        this.garbage.push(o);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    ensureObject: function(aAddress)
    {
        if (!this.graph[aAddress])
            this.graph[aAddress] = new Analyzer.CCObject();
        return this.graph[aAddress];
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Graph Analysis

    getDocuments: function()
    {
        var result = [];
        for each (var o in this.graph)
        {
            if (!o.garbage && o.name.indexOf("nsDocument ") >= 0)
                result.push(o);
        }
        return result;
    },

    getRootObjects: function(o, res, searchGen)
    {
        if (o.searchMark == searchGen || o.garbage)
            return;

        o.searchMark = searchGen;
        if (o.root)
            res.push(serializeObject(o));

        for each (var owner in o.owners)
            getRootObjects(owner.from, res, searchGen);
    },

    getRoots: function()
    {
        var collectedRoots = {};
        for each (var o in this.roots)
        {
            var res = [];
            this.getChildObjects(o, res, ++searchGeneration);
            collectedRoots[o.address] = res;
        }

        function biggerFirst(a, b)
        {
            a = collectedRoots[a];
            b = collectedRoots[b];
            if (a < b) return 1;
            if (a > b) return -1;
            return 0;
        }

        return collectedRoots;//Object.keys(collectedRoots).sort(biggerFirst);
    },

    getChildObjects: function (o, res, searchGen)
    {
        if (o.searchMark == searchGen || o.garbage)
            return;

        o.searchMark = searchGen;
        res.push(o);

        for each (var edge in o.edges)
            this.getChildObjects(edge.to, res, searchGen);
    },

    findObjects: function(name)
    {
        if (!name)
            return null;

        var result = [];
        for each (var o in this.graph)
        {
            if (o.name.indexOf(name) >= 0 || o.address.indexOf(name) >= 0)
                result.push(o);
        }

        return result.length ? result : null;
    },
}

// ********************************************************************************************* //

Analyzer.CCObject = function()
{
    this.name = "";
    this.address = null;
    this.refcount = 0;
    this.gcmarked = false;
    this.root = false;
    this.garbage = false;
    this.knownEdges = 0;
    this.edges = [];
    this.owners = [];
    this.searchMark = 0;
}

// ********************************************************************************************* //

return Analyzer;

// ********************************************************************************************* //
});