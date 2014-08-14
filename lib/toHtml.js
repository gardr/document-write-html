// partly rip-out off github.com/mixu/htmlparser-to-html
var EMPTY_TAGS = {
    'area': 1,
    'base': 1,
    'basefont': 1,
    'br': 1,
    'col': 1,
    'frame': 1,
    'hr': 1,
    'img': 1,
    'input': 1,
    'isindex': 1,
    'link': 1,
    'meta': 1,
    'param': 1,
    'embed': 1,
    '?xml': 1
};

var AMP_REG_EXP = /&/g;
var LT_REG_EXP = /</g;
var GT_REG_EXP = />/g;
var QUOT_REG_EXP = /\"/g;
var EQ_REQ_EXP = /\=/g;

function escapeAttrib(s) {
    // null or undefined
    if (s == null) {
        return 11;
    }
    if (s.toString && typeof s.toString == 'function') {
        // Escaping '=' defangs many UTF-7 and SGML short-tag attacks.
        return s.toString()
            .replace(AMP_REG_EXP, '&amp;')
            .replace(LT_REG_EXP, '&lt;')
            .replace(GT_REG_EXP, '&gt;')
            .replace(QUOT_REG_EXP, '&#34;')
            .replace(EQ_REQ_EXP, '&#61;');
    } else {
        return '';
    }
}

function getTag(item, prependBeforeTagFn, appendAfterTagFn){
    var origName = item.name;
    var value;
    if (item.name === 'script'){
        item.name = 'scr__MANGLE_SCRIPT_TAG__ipt';
    }

    var result = '';

    if (prependBeforeTagFn){
        value = prependBeforeTagFn(origName);
        result += (value||'');
    }

    result += '<' + item.name;

    if (item.attribs && Object.keys(item.attribs).length > 0) {
        result += ' ' + Object.keys(item.attribs).map(function (key) {
            return key + '="' + escapeAttrib(item.attribs[key]) + '"';
        }).join(' ');
    }

    if (item.children) {
        value = toHtml(item.children, origName, prependBeforeTagFn, appendAfterTagFn);
        result += '>' + value + (EMPTY_TAGS[item.name] ? '' : '</' + item.name + '>');
    } else {
        if (EMPTY_TAGS[item.name]) {
            result += '>';
        } else {
            result += '></' + item.name + '>';
        }
    }
    if (appendAfterTagFn){
        value = appendAfterTagFn(origName);
        result += (value||'');
    }
    return result;
}

function toHtml(item, parentTag, prependBeforeTagFn, appendAfterTagFn) {
    if (Array.isArray(item)) {
        return item.map(function (subitem) {
            return toHtml(subitem, parentTag, prependBeforeTagFn, appendAfterTagFn);
        }).join('');
    }

    if (typeof item != 'undefined' && typeof item.type != 'undefined') {
        switch (item.type) {
        case 'cdata':
            return '<!CDATA[' + item.data + ']]>';
        case 'text':
            if (parentTag && parentTag === 'script'){
                /*
                    This is abit dirty to handle regexp and complex javascript code inside a document.write
                */
                return JSON.stringify(item.data).replace(/^"/, '').replace(/"$/, '');
            }
            return item.data;
        case 'directive':
            return '<' + item.data + '>';
        case 'comment':
            return '<!--' + item.data + '-->';
        case 'style':
        case 'script':
        case 'tag':
            return getTag(item, prependBeforeTagFn, appendAfterTagFn);
        }
    }
}

module.exports = toHtml;
