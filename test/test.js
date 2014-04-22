var referee = require('referee');
var assert = referee.assert;

var html = require('../lib');

var fs = require('fs');
function getFixture(n){
    return fs.readFileSync(__dirname + '/fixtures/'+n, 'utf8');
}

describe('toDocumentWrite', function(){
    it('should return document wrapped content', function(){
        var content = Math.round(Math.random()*123113215435);
        var result = html.toDocumentWrite(content);
        assert.isString(result);
        assert.equals(result.indexOf('document.write('), 0, 'value should start with document:'+result);
        var end = ');';
        assert.equals(result.indexOf(end), result.length-end.length, 'value should end with \');\'');
    });

    it('should wrap with tag', function(){
        var content = Math.round(Math.random()*10001239123912);
        var result = html.toDocumentWrite(content, 'div');
        assert.isString(result);
        assert.equals(result.indexOf('document.write(\'<div'), 0, 'value should start with document: '+result);
        var end = '/div>\');';
        assert.equals(result.indexOf(end), result.length-end.length, 'value should end with \');\'');
    });

    it('should wrap with script tag and split script tagName', function(){
        var content = Math.round(Math.random()*10001239123912);
        var result = html.toDocumentWrite(content, 'script');
        assert.isString(result);
        assert.equals(result.indexOf('document.write(\'<scr\'+\'ipt'), 0, 'value should start with document: '+result);
        var end = '/scr\'+\'ipt>\');';
        assert.equals(result.indexOf(end), result.length-end.length, 'value should end with \');\'');
    });

    var files = ['bad_escape_1.html', 'bad_escape_2.js', 'bad_escape_3.css'];
    files.forEach(function(fileName){
        it(fileName + ' should produce valid javascript', function(done){
            var content = getFixture(fileName);
            var result = html.toDocumentWrite(content);
            global.document = {
                write: function(data){
                    assert.equals(data, content);
                    done();
                }
            };

            eval(result);

            global.document = null;
        });
    });

    it('should not let cruft stop first write', function(done){
        var content = getFixture('special_chars.txt');
        var result = html.toDocumentWrite(content);

        global.document = {
            write: function(){
                done();
            }
        };
        eval(result);

        global.document = null;
    });
});

describe('parseAndResolve', function(){

    it('should rewrite in urls', function(){
        var content = getFixture('plain.html');

        var rand = Math.round(Math.random()*100012312+Math.random());
        var base = 'http://www.domain'+rand+'.com/path/';
        var output = html.parseAndResolve(base, content);
        var RE_FIND_ENTRIES = new RegExp(rand, 'gm');

        assert.equals(output.full.match(RE_FIND_ENTRIES).length, 14);
    });

    it('should rewrite urls inside media queries', function(){
        var content = '<style>'+getFixture('urls.css')+'</style>';

        var rand = Math.round(Math.random()*100012312+Math.random());
        var base = 'http://www.domain'+rand+'.com/path/';
        var output = html.parseAndResolve(base, content);
        var RE_FIND_ENTRIES = new RegExp(rand, 'gm');

        assert.equals(output.full.match(RE_FIND_ENTRIES).length, 4);
    });
});


describe('toScriptTag', function(){

    it('should output div as document write', function(){
        var base = 'http://www.domain.com/path/';
        var content = '<base href="'+base+'"><div></div>';
        var output = html.toScriptTag(base, content);

        assert.equals('document.write(\''+content+'\');', output.replace(/\\"/gmi, '"'));
    });

    it('should output html-page page as document write', function(){
        var expected = '<div></div>';
        var content = '<head></head><body>'+expected;
        var base = 'http://www.domain.com/path/';
        var output = html.toScriptTag(base, content);

        assert.equals('document.write(\'<base href=\\"'+base+'\\" />\');document.write(\''+expected+'\');', output);
    });

});
