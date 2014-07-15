/* jshint evil: true */
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

    it('should replace quote html entities', function(){

        var content = 'document.write(\"fn(&quot;url&quot;)\");';
        var expected = 'document.write(\'<scr\'+\'ipt>document.write(\\\"fn(\\\"url\\\")\\\");</scr\'+\'ipt>\');';
        var result = html.toDocumentWrite(content, 'script');
        assert.equals(result, expected);

    });

    var files = ['bad_escape_1.html', 'bad_escape_2.js', 'bad_escape_3.css', 'order123.html'];
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

        var match = output.match(RE_FIND_ENTRIES);
        assert.equals(match && match.length, 15);
    });

    it('should rewrite urls inside media queries', function(){
        var content = '<style>'+getFixture('urls.css')+'</style>';

        var rand = Math.round(Math.random()*100012312+Math.random());
        var base = 'http://www.domain'+rand+'.com/path/';
        var output = html.parseAndResolve(base, content);
        var RE_FIND_ENTRIES = new RegExp(rand, 'gm');

        assert.equals(output.match(RE_FIND_ENTRIES).length, 5);
    });
});


describe('toScriptTag', function(){

    it('should output div as document write', function(){
        var base = 'http://www.domain.com/path/';
        var content = '<base href="'+base+'"><div></div>';
        var output = html.toScriptTag(base, content);

        assert.equals('<script>document.write(\''+content+'\');</script>', output.replace(/\\"/gmi, '"'));
    });

    it('should output html-page page as document write, and add missing base', function(){
        var expected = '<div></div>';
        var content = '<head></head><body>'+expected;
        var base = 'http://www.domain.com/path/';
        var output = html.toScriptTag(base, content);

        var i = '<script>document.write(\'<base href=\\"'+base+'\\" />'+expected+'\');</script>';
        assert.equals(i, output);
    });

    describe('via phantom', function(){

        var phantom = require('phantom');
        var http    = require('http');

        before(function(done){
            var PORT = process.env.PORT||7070;
            var self = this;
            phantom.create(function(ph){
                self.phantom = ph;
                ph.createPage(function(page){
                    self.page = page;
                    done();

                });
            });

            self.base = 'http://127.0.0.1:'+PORT+'/';
            self.content = '';
            self.server = http.createServer(function(req, res){

                if (req.url === '/?i=pass1' || req.url === '/?i=pass2'){
                    res.writeHead(200, {'Content-Type': 'text/html'});
                    res.end(self.content);
                    // console.log('-------------------> Serve -------------->', req.url, self.active,':\n', self.content, '\nEND:\n');
                } else {
                    res.writeHead(200, {'Content-Type': 'application/javascript'});
                    if (req.url.indexOf('/?output') === 0){
                        var c = 'output("'+req.url.substring(9)+'");';
                        // console.log('-------------------> Serve -------------->', req.url, self.active, '\n', c);

                        return res.end(c);
                    }
                    // console.log(' ---- MISSING :'+req.url);
                    res.end('console.log("'+req.url+'");');
                }
            }).listen(PORT);


            var script = [
                '<script type="text/javascript">',
                'window.__output = window.__output||[];',
                'window.output = function(a){window.__output.push(a);}',
                '</script>'
            ].join('');

            function pass1(){
                var str = html.toScriptTag(self.base, (getFixture(self.active)).toString()).toString();
                // console.log('---------------------> pass1(WRITE):\n'+ str);
                self.content =  [
                    '<!DOCTYPE html>', '<html>', '<head>', script,
                    '</head>','<body>',
                    str,
                    '</body></html>'
                ].join('');
            }

            function pass2(){
                self.content = getFixture(self.active);
            }


            self.open = function(page, cb){
                function get(){ return window.__output; }
                var url = self.base;

                pass1();
                page.open(url + '?i=pass1', function(){
                    page.evaluate(get, function(result1){
                        pass2();
                        page.open(url + '?i=pass2', function(){
                            page.evaluate(get, function(result2){
                                cb(result1, result2);
                            });
                        });
                    });
                });
            };

        });

        // generate test per input
        [{ name: 'order123.html', expected: 7 }].forEach(function(data){
            it('should output '+data.name+' html page elements in correct order', function(done){
                this.timeout(5000);
                this.active = data.name;
                this.open(this.page, assertResult);

                function assertResult(result1, result2){
                    setTimeout(function(){
                        // console.log('------------------------> RESULT:', result1,'\n', result2);

                        assert(result1, 'expected a result from wrapped result');
                        assert.equals(result1.length, data.expected);

                        assert(result2, 'expected a result from demo');
                        assert.equals(result2.length, data.expected);

                        assert.equals(result1.length, result2.length);
                        done();
                    }, 0);
                }
            });

        });


        after(function(done){
            this.phantom.exit();
            this.server.close();
            done();
        });
    });
});
