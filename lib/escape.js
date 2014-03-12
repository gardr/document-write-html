/* jshint  quotmark:false*/
module.exports = function escape(str) {
    return str.toString()
        .replace(/\\n|\n/g, '\\n')
        .replace(/\\'|'/g, "\\'")
        .replace(/\\"|"/g, '\\"')
        .replace(/\\&/g, '\\&')
        .replace(/\\r|\r/g, '\\r')
        .replace(/\\t/g, '\\t')
        .replace(/\\b/g, '\\b')
        .replace(/\\f/g, '\\f');
};
