/* See license.txt for terms of usage */

define([
    "lib/domplate",
    "lib/lib",
    "lib/trace"
],

function(Domplate, Lib, Trace) { with (Domplate) {

// ********************************************************************************************* //

function DomTree(input)
{
    this.input = input;
}

/**
 * @domplate Represents a tree of properties/objects
 */
DomTree.prototype = domplate(
{
    tag:
        TABLE({"class": "domTable", cellpadding: 0, cellspacing: 0, onclick: "$onClick"},
            TBODY(
                FOR("member", "$object|memberIterator", 
                    TAG("$member|getRowTag", {member: "$member"}))
            )
        ),

    rowTag:
        TR({"class": "memberRow $member.open $member.type\\Row $member|hasChildren", 
            $hasChildren: "$member|hasChildren",
            _repObject: "$member", level: "$member.level"},
            TD({"class": "memberLabelCell", style: "padding-left: $member.indent\\px"},
                SPAN({"class": "memberLabel $member.type\\Label"}, "$member.name")
            ),
            TD({"class": "memberValueCell"},
                TAG("$member.tag", {object: "$member|getValue"})
            )
        ),

    loop:
        FOR("member", "$members", 
            TAG("$member|getRowTag", {member: "$member"})),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    hasChildren: function(object)
    {
        return object.hasChildren ? "hasChildren" : "";
    },

    memberIterator: function(object)
    {
        return this.getMembers(object);
    },

    getValue: function(member)
    {
        return member.value;
    },

    getRowTag: function(member)
    {
        return this.rowTag;
    },

    onClick: function(event)
    {
        var e = Lib.fixEvent(event);
        if (!Lib.isLeftClick(e))
            return;

        var row = Lib.getAncestorByClass(e.target, "memberRow");
        var label = Lib.getAncestorByClass(e.target, "memberLabel");
        if (label && Lib.hasClass(row, "hasChildren"))
            this.toggleRow(row);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    toggleRow: function(row, forceOpen)
    {
        if (!row)
            return;

        var level = parseInt(row.getAttribute("level"));
        if (forceOpen && Lib.hasClass(row, "opened"))
            return;

        if (Lib.hasClass(row, "opened"))
        {
            Lib.removeClass(row, "opened");

            var tbody = row.parentNode;
            for (var firstRow = row.nextSibling; firstRow; firstRow = row.nextSibling)
            {
                if (parseInt(firstRow.getAttribute("level")) <= level)
                    break;
                tbody.removeChild(firstRow);
            }
        }
        else
        {
            Lib.setClass(row, "opened");

            var repObject = row.repObject;
            if (repObject)
            {
                if (!repObject.hasChildren)
                    return;

                var members = this.getMembers(repObject.value, level+1);
                if (members)
                    this.loop.insertRows({members: members}, row);
            }
        }
    },

    getMembers: function(object, level)
    {
        if (!level)
            level = 0;

        var members = [];
        for (var p in object)
        {
            var propObj = object[p];
            if (typeof(propObj) != "function"/* && typeof(propObj) != "number"*/)
            {
                var member = this.createMember("dom", p, propObj, level)
                if (member)
                    members.push(member);
            }
        }

        return members;
    },

    createMember: function(type, name, value, level)
    {
        var valueType = typeof(value);
        var hasChildren = this.hasProperties(value) && (valueType == "object");

        var valueTag = DomTree.Reps.getRep(value);

        return {
            name: name,
            value: value,
            type: type,
            rowClass: "memberRow-" + type,
            open: "",
            level: level,
            indent: level*16,
            hasChildren: hasChildren,
            tag: valueTag.tag
        };
    },

    hasProperties: function(ob)
    {
        if (typeof(ob) == "string")
            return false;

        try {
            for (var name in ob)
                return true;
        } catch (exc) {}
        return false;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Public

    append: function(parentNode, expandRoot)
    {
        this.element = this.tag.append({object: this.input}, parentNode);
        this.element.repObject = this;

        if (!expandRoot)
            return;

        // Expand the first node (root) by default
        // Do not expand if the root is an array with more than one element.
        var value = Lib.isArray(this.input) && this.input.length > 2;
        var firstRow = this.element.firstChild.firstChild;
        if (firstRow && !value)
            this.toggleRow(firstRow);
    },

    expandRow: function(object)
    {
        var row = this.getRow(object);
        this.toggleRow(row, true);
        return row;
    },

    getRow: function(object)
    {
        // If not rendered yet, bail out.
        if (!this.element)
            return;

        // Iterate all existing rows and expand the one associated with specified object.
        // The repObject is a "member" object created in createMember method.
        var rows = Lib.getElementsByClass(this.element, "memberRow");
        for (var i=0; i<rows.length; i++)
        {
            var row = rows[i];
            if (row.repObject.value == object)
                return row;
        }

        return null;
    }
});

function safeToString(ob)
{
    try
    {
        return ob.toString();
    }
    catch (exc)
    {
        return "";
    }
}

// ********************************************************************************************* //
// Value Templates

var OBJECTBOX =
    DIV({"class": "objectBox objectBox-$className"});

var OBJECTLINK = this.OBJECTLINK =
    A({
        "class": "objectLink objectLink-$className",
        _repObject: "$object"
    });

// ********************************************************************************************* //

DomTree.Reps =
{
    reps: [],

    registerRep: function()
    {
        this.reps.push.apply(this.reps, arguments);
    },

    getRep: function(object)
    {
        var type = typeof(object);
        if (type == "object" && object instanceof String)
            type = "string";

        for (var i=0; i<this.reps.length; ++i)
        {
            var rep = this.reps[i];
            try
            {
                if (rep.supportsObject(object, type))
                    return rep;
            }
            catch (exc)
            {
                Trace.sysout("domTree.getRep; ", exc);
            }
        }

        return DomTree.Rep;
    }
}

// ********************************************************************************************* //

DomTree.Rep = domplate(
{
    tag:
        OBJECTBOX("$object|getTitle"),

    className: "object",

    getTitle: function(object)
    {
        var label = safeToString(object);
        var re = /\[object (.*?)\]/;
        var m = re.exec(label);
        return m ? m[1] : label;
    },

    getTooltip: function(object)
    {
        return null;
    },

    supportsObject: function(object, type)
    {
        return false;
    },

    getRepObject: function(node)
    {
        for (var child = node; child; child = child.parentNode)
        {
            if (child.repObject)
                return child.repObject;
        }
    },
});

// ********************************************************************************************* //

DomTree.Reps.Null = domplate(DomTree.Rep,
{
    tag:
        OBJECTBOX("null"),

    className: "null",

    supportsObject: function(object, type)
    {
        return object == null;
    }
});

// ********************************************************************************************* //

DomTree.Reps.Number = domplate(DomTree.Rep,
{
    tag:
        OBJECTBOX("$object"),

    className: "number",

    supportsObject: function(object, type)
    {
        return type == "boolean" || type == "number";
    }
});

// ********************************************************************************************* //

DomTree.Reps.String = domplate(DomTree.Rep,
{
    tag:
        //OBJECTBOX("&quot;$object&quot;"),
        OBJECTBOX("$object"),

    className: "string",

    supportsObject: function(object, type)
    {
        return type == "string";
    }
});

// ********************************************************************************************* //

DomTree.Reps.Arr = domplate(DomTree.Rep,
{
    tag:
        OBJECTBOX("$object|getTitle"),

    className: "array",

    supportsObject: function(object, type)
    {
        return Lib.isArray(object);
    },

    getTitle: function(object)
    {
        if (!object.length)
            return "";

        return "Array [" + object.length + "]";
    }
});

// ********************************************************************************************* //

DomTree.Reps.Tree = domplate(DomTree.Rep,
{
    tag:
        OBJECTBOX(
            TAG("$object|getTag", {object: "$object|getRoot"})
        ),

    className: "tree",

    getTag: function(object)
    {
        return Tree.tag;
    },

    getRoot: function(object)
    {
        // Create fake root for embedded object-tree.
        return [object];
    },

    supportsObject: function(object, type)
    {
        return type == "object";
    }
});

//xxxHonza: Domplate inheritance doesn't work. Modifications are propagated
// into the base object (see: http://code.google.com/p/fbug/issues/detail?id=4425)
var Tree = domplate(DomTree.prototype,
{
    createMember: function(type, name, value, level)
    {
        var member = DomTree.prototype.createMember(type, name, value, level);
        if (level == 0)
        {
            member.name = "";
            member.type = "tableCell";
        }
        return member;
    }
});

DomTree.Reps.Link = domplate(DomTree.Rep,
{
    className: "link",

    tag:
        OBJECTLINK({onclick: "$onClick", href: "$object|getTargetUrl"},
            "$object|getTitle"
        ),

    onClick: function(event)
    {
        // xxxHonza: any way how to execute a custom callback from here?
        Lib.fireEvent(event.target, "navigate");
    },

    getTargetUrl: function(object)
    {
        return object + "";
    }
});

// ********************************************************************************************* //

// Registration
DomTree.Reps.registerRep(
    DomTree.Reps.Null,
    DomTree.Reps.Number,
    DomTree.Reps.String,
    DomTree.Reps.Arr
)

// ********************************************************************************************* //

return DomTree;

// ********************************************************************************************* //
}});
