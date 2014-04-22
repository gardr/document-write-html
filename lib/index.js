//var log = require('./logger.js');
var cssParser   = require('css-parse');
var cssStringify= require('css-stringify');
var CleanCSS    = require('clean-css');
var htmlparser  = require('htmlparser2');
var toHtml      = require('htmlparser-to-html');
var urlLib      = require('url');
var escape      = require('./escape.js');
var select      = require('CSSselect');

function toDocumentWrite(str, tag) {
    var output = ['document.write(\''];
    if (tag){
        if (tag === 'script'){
            tag = 'scr\'+\'ipt';
        }
        output.push('<'+tag+'>');
    }
    output.push(escape(str));
    if (tag){
        output.push('</'+tag+'>');
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

function parseAndResolve(base, html) {
    var REG_EXP_ABS_URL = /^(\/\/|http)/i;

    var resourceUrlHandler = function (url) {
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

function parse(str, resourceUrlHandler) {
    var output = {
        pre: '',
        content: '',
        style: '',
        script: '',
        full: ''
    };

    var handler = new htmlparser.DomHandler(function (err, dom) {
        if (err) {
            throw err;
        }

        var baseTagFound = false;
        select('base', dom).forEach(function (baseTag) {
            baseTagFound = true;
            if ( resourceUrlHandler && baseTag.attribs && baseTag.attribs.href ) {
                baseTag.attribs.href = resourceUrlHandler(baseTag.attribs.href);
                //output.content += toHtml(baseTag);
                //baseTag.remove()
            }
        });

        if (resourceUrlHandler && baseTagFound === false){
            output.pre += '<base href="'+resourceUrlHandler('./')+'" />';
        }

        select('script', dom).forEach(function (scriptTag) {
            if (resourceUrlHandler && scriptTag.attribs && scriptTag.attribs.src) {
                scriptTag.attribs.src = resourceUrlHandler(scriptTag.attribs.src);
            }
        });


        select('style', dom).forEach(function (styleTag) {
            function replaceHandler(url, entry) {
                var newUrl = resourceUrlHandler(url);
                if (url !== newUrl) {
                    entry.value = entry.value.replace(new RegExp('url\\([\"|\'|\\\']?'+url+'[\"|\'|\\\']?\\)', 'm'), 'url(\"'+newUrl+'\")');
                }
            }

            function rulesHandler(rule){
                if (rule.declarations){
                    replaceCSSUrlHandler(rule.declarations, replaceHandler);
                }
                if (rule.rules && rule.rules.length > 0){
                    rule.rules.forEach(rulesHandler);
                }
            }

            if (resourceUrlHandler && styleTag) {
                var result;

                try {
                    result = cssParser(toHtml(styleTag.children));
                    result.stylesheet.rules.forEach(rulesHandler);
                } catch (e) {
                }
                if (result){
                    styleTag.children = cssStringify(result);
                }

            }
        });




        var head = select('head', dom)[0];
        if (head) {
            select('link', head).forEach(function (linkTag) {
                if ( resourceUrlHandler && linkTag.attribs && linkTag.attribs.href ) {
                    linkTag.attribs.href = resourceUrlHandler(linkTag.attribs.href);
                }
                output.content += toHtml(linkTag);
            });

            select('style', head).forEach(function (styleTag) {
                output.style += toHtml(styleTag.children);
            });

            select('script', head).forEach(function (scriptTag) {
                if (scriptTag.attribs && scriptTag.attribs.src) {
                    output.content += toHtml(scriptTag);
                } else {
                    output.script += toHtml(scriptTag.children);
                }
            });
        }

        select('img', dom).forEach(function (imgTag) {
            if (resourceUrlHandler) {
                imgTag.attribs.src = resourceUrlHandler(imgTag.attribs.src);
            }
        });

        select('[style]', dom).forEach(function (tag) {
            var style = tag.attribs.style;

            function replaceHandler(url) {
                var newUrl = resourceUrlHandler(url);
                if (url !== newUrl) {
                    tag.attribs.style = tag.attribs.style.replace(url, newUrl);
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
        });


        var body = select('body', dom)[0];
        if (body) {
            output.content += toHtml(body.children);
        } else {
            output.content += toHtml(dom);
        }

        // output document with rewritten urls
        output.full = toHtml(dom);
    });

    new htmlparser.Parser(handler).parseComplete(str);

    return {
        'pre': output.pre,
        'content': output.content,
        'style': output.style,
        'script': output.script,
        'full': output.full
    };
}

function toScriptTag(base, html, str){
    str = '';
    var trimmed = parseAndResolve(base, html);
    if (trimmed.pre){
        str += toDocumentWrite(trimmed.pre);
    }
    if (trimmed.style) {
        str += toDocumentWrite('<style>' + minifyCSS(trimmed.style) + '</style>');
    }
    str += toDocumentWrite(trimmed.content);
    if (trimmed.script){
        str += toDocumentWrite('<scr\'+\'ipt>' + trimmed.script + '</scr\'+\'ipt>');
    }
    return str;
}

module.exports = {
    'escape': escape,
    'minifyCSS': minifyCSS,
    'toDocumentWrite': toDocumentWrite,
    'parseAndResolve': parseAndResolve,
    'toScriptTag': toScriptTag
};
