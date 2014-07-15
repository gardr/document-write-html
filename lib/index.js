var escape      = require('./escape.js');
var urlLib      = require('url');
//var log = require('./logger.js');
var cssParser   = require('css-parse');
var cssStringify= require('css-stringify');
var CleanCSS    = require('clean-css');

var htmlparser  = require('htmlparser2');

// var toHtml      = require('htmlparser-to-html');
var toHtml = require('./toHtml.js');

var select      = require('CSSselect');

function toDocumentWrite(str, wrapInTag) {
    var output = ['document.write(\''];
    if (wrapInTag){
        if (wrapInTag === 'script'){
            wrapInTag = 'scr\'+\'ipt';
        }
        output.push('<'+wrapInTag+'>');
    }
    // __MANGLE__ hack ;P
    output.push(escape(str).replace(/__MANGLE__/mig, '\'+\''));
    if (wrapInTag){
        output.push('</'+wrapInTag+'>');
    }
    output.push('\');');

    return output.join('');
}

function minifyCSS(str) {
    var instance = new CleanCSS();
    return instance.minify(str);
}

function getUrl(o) {
    return o.value.split('url(').filter(Boolean).map(function (url) {
        url = url.replace(/\"|\'/gm, '');
        return url.substring(0, url.indexOf(')'));
    }).filter(Boolean);
}

function replaceCSSUrlHandler(declarations, replaceHandler){
    var list = declarations.filter(filterCSSURL);

    list.map(getUrl).forEach(function (url, index) {
        if (Array.isArray(url)) {
            url.forEach(function(_url){
                replaceHandler(_url, list[index]);
            });
        } else {
            replaceHandler(url, list[index]);
        }
    });
}

function filterCSSURL(o) {
    return o && !!o.value && o.value.indexOf('url(') > -1;
}

function resolve(base, html) {
    var REG_EXP_ABS_URL = /^(\/\/|http)/i;

    var resourceUrlHandler = function (url) {
        if (!url || typeof url !== 'string'){
            return;
        }
        if (REG_EXP_ABS_URL.test(url) !== true) {
            url = urlLib.resolve(base, url);
        }
        // resolve protocol relative
        if (url.indexOf('//') === 0) {
            url = 'http:' + url;
        }
        return url;
    };
    return parse(html, resourceUrlHandler);
}

var TAGS_WITH_RESOURCE_REFS = [
    {
        select: 'base',
        'tagHandler': createAttributeHandler('href')
    },
    {
        select: 'script',
        'tagHandler': createAttributeHandler('src')
    },
    {
        select: 'style',
        'tagHandler': createStyleTagResourceHandler
    },
    {
        select: 'link',
        'tagHandler': createAttributeHandler('href')
    },
    {
        select: 'img',
        'tagHandler': createAttributeHandler('src')
    },
    {
        select: '[style]',
        'tagHandler': createStyleAttributeResourceHandler
    }
];

function resolveResources(dom, _resourceUrlHandler){
    TAGS_WITH_RESOURCE_REFS.forEach(function(rule){
        var handler = rule.tagHandler(_resourceUrlHandler);
        select(rule.select, dom).forEach(function(tag){
            handler(tag);
        });
    });
}

function createAttributeHandler(key){
    return function(fn){
        return function(tag){
            if (fn && tag.attribs && tag.attribs[key] ) {
                tag.attribs[key] = fn(tag.attribs[key]);
            }
        };
    };
}

function createStyleAttributeResourceHandler(resourceUrlHandler){
    return function (domTag) {
        var style = domTag.attribs.style;

        function replaceHandler(url) {
            if (!url || typeof url !== 'string'){
                return;
            }
            var newUrl = resourceUrlHandler(url);
            if (url !== newUrl) {
                domTag.attribs.style = domTag.attribs.style.replace(url, newUrl);
            }
        }

        if (resourceUrlHandler && style) {
            var result;
            try {
                result = cssParser('#DUMMY{' + style + '}');
                replaceCSSUrlHandler(result.stylesheet.rules[0].declarations, replaceHandler);
            } catch (e) {
                //console.log(e);
            }
        }
    };
}


function createStyleTagResourceHandler(resourceUrlHandler){
    return function (tag) {
        function CSSURLReplaceHandler(url, entry) {
            if (!url || typeof url !== 'string'){
                return;
            }
            var newUrl = resourceUrlHandler(url);
            if (url !== newUrl) {
                entry.value = entry.value.replace(new RegExp('url\\([\"|\'|\\\']?'+url+'[\"|\'|\\\']?\\)', 'm'), 'url(\"'+newUrl+'\")');
            }
        }

        function rulesHandler(rule){
            if (rule.declarations){
                replaceCSSUrlHandler(rule.declarations, CSSURLReplaceHandler);
            }
            if (rule.rules && rule.rules.length > 0){
                rule.rules.forEach(rulesHandler);
            }
        }

        if (resourceUrlHandler && tag) {
            var result;

            try {
                result = cssParser(toHtml(tag.children));
                result.stylesheet.rules.forEach(rulesHandler);
            } catch (e) {
                console.log('\nERROR:', e);
            }
            if (result){
                tag.children[0].data = cssStringify(result);
            }
        }
    };
}


var TAGS_TO_DELETE = ['title', 'meta'];
var TAGS_TO_REMOVE = ['html', 'head', 'body'];
function filterOutResources(dom){
    var filtered = [];
    var after = [];
    // filter out top level
    dom.forEach(filterHandler);


    function filterHandler(entry){
        if (entry.type === 'comment'){
            return;
        }
        if (entry.type === 'tag' && entry.name === 'body' && !!entry.attribs.onload){
            //
            var newEntry = {
                type: 'script',
                name: 'script',
                attribs: { type: 'text/javascript' },
                children: [],
                parent: null
            };
            newEntry.children.push({
                data: entry.attribs.onload.replace(/^javascript\:/, ''),
                type: 'text',
                parent: newEntry
            });
            after.push(newEntry);
        }

        if (entry.type === 'tag' && TAGS_TO_DELETE.indexOf(entry.name) >-1){
            // lets ignore
            return;
        }
        if (entry.type === 'tag' && TAGS_TO_REMOVE.indexOf(entry.name) >-1){
            // lets copy children
            entry.children.forEach(filterHandler);
            return;
        }

        if (entry.type === 'directive' && entry.name === '!doctype'){
            // ignore
            return;
        }

        filtered.push(entry);
    }


    filtered = filtered.filter(filterEmptyContent);


    function filterEmptyContent(entry){
        if (entry.type === 'text' && entry.data.trim() === ''){
            // remove newlines and tabs
            return false;
        }
        return true;
    }

    return filtered.concat(after);
}


function parse(str, resourceUrlHandler) {
    var res;
    runParser(str, function (err, dom) {
        if (err) {
            throw err;
        }
        var pre = '';
        var baseTagFound = select('base', dom).length >= 1;

        if (resourceUrlHandler && baseTagFound === false){
            pre += '<base href="'+resourceUrlHandler('./')+'" />';
        }

        resolveResources(dom, resourceUrlHandler);

        dom = filterOutResources(dom);

        // console.log('--------------------> DOM::', dom);
        // console.log('--------------------> OUTPUT::', toHtml(dom));

        res = pre + toHtml(dom);
    });
    return res;
}

function runParser(str, domHandler){
    new htmlparser.Parser(new htmlparser.DomHandler(domHandler)).parseComplete(str);
}

function toScriptTag(base, html){
    return '<script>'+toDocumentWrite(resolve(base, html))+'</script>';
}

module.exports = {
    'escape': escape,
    'minifyCSS': minifyCSS,
    'toDocumentWrite': toDocumentWrite,
    'parseAndResolve': resolve,
    'toScriptTag': toScriptTag
};
