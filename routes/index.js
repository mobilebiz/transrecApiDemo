var express = require('express');
var router = express.Router();

var config = require('config')
  , Log = require('log')
  , log = new Log(config.logMode)
  , moment = require('moment')
  , PDFDocument = require('pdfkit')
  , fs = require('fs')
  , debug = require('debug')('transrecApiDemo:index.js')
;

/* GET home page. */
router.get('/', function(req, res, next) {
  debug('/ called.');
  res.render('index', { title: 'TRANSREC RESTful API Demo page.' });
});

/* POST ping */
router.post('/ping', function(req, res, next) {
  debug('/ping called.');

  // Check Parameters
  var _recordId = req.body.recordid || '';
  if (_recordId === '') {
    next(new Error('Parameter error(recordid).'));
  }

  var _json = null;
  var async = require('async');
  async.series([
    // テキストデータを取得する
    function(callback) {
      var https = require('https');
      var request = https.get({
        "host": config.transrecApi.host,
        "port": config.transrecApi.port,
        "path": config.transrecApi.path + '/record/' + _recordId,
        "auth": config.transrecApi.SID + ':' + config.transrecApi.Token,
        "rejectUnauthorized": false   // api.transrec.netでは、COMODOのワイルドカード証明書を使っているため
      }, function(response) {
        var body = '';
        response.setEncoding('utf8');

        response.on('data', function(chunk) {
          body += chunk;
        });

        response.on('end', function() {
          _json = JSON.parse(body);
          if (_json.status === 200) {
            // PDFを作成
            var doc = new PDFDocument();
            var filename = moment().format('YYYYMMDDHHmmss')+'.pdf';
            doc.pipe(fs.createWriteStream(__dirname+'/../public/pdf/'+filename));
            doc.font(__dirname+'/../fonts/GenJyuuGothic-Bold.ttf');
            doc.fontSize(30);
            doc.text(_json.message);
            doc.end();
            callback(null, 'Successful in obtaining the text data.');
          } else {
            callback(new Error('TRANSREC API /record Error. Status code was '+_json.status+'.'));
          }
        });
      }).on('error', function(err) {
        callback(err);
      });
    },

    // 音声データ（mp3）を取得する
    function(callback) {
      var https = require('https');
      var request = https.get({
        "host": config.transrecApi.host,
        "port": config.transrecApi.port,
        "path": config.transrecApi.path + '/mp3/' + _recordId,
        "auth": config.transrecApi.SID + ':' + config.transrecApi.Token,
        "rejectUnauthorized": false   // api.transrec.netでは、COMODOのワイルドカード証明書を使っているため
      }, function(response) {
        var buf = '';
        response.setEncoding('binary');

        response.on('data', function(chunk) {
          buf += chunk;
        });

        response.on('end', function() {
    			var filename = moment().format('YYYYMMDDHHmmss')+'.mp3';
    			_url = 'http://'+req.headers.host+'/mp3/'+filename;
    			fs.writeFile(__dirname+'/../public/mp3/'+filename, buf, 'binary', function (err) {
    				if (err) {
    					callback(err);
    				} else {
    					callback(null, '音声データ('+filename+')を保存しました。');
    				}
    			});
        });
      }).on('error', function(err) {
        callback(err);
      });
    },

    // Kintoneにデータを投げる
    function(callback) {
      var request = require('request');

      var params = {
        "app": 1,
        "record": {
          "calledDate": {
            "value": moment(_json.calledDate, "YYYY/MM/DD HH:mm:ss").utc().format()
          },
          "phoneNum": {
            "value": _json.from
          },
          "message": {
            "value": _json.message
          }
        }
      };
      debug('JSON:'+JSON.stringify(params));

      var options = {
        url: 'https://transrec.cybozu.com/k/v1/record.json',
        headers: {
          'Content-Type': 'application/json',
          'X-Cybozu-Authorization': new Buffer(config.kintone.id + ':' + config.kintone.pass).toString('base64')
        },
        json: true,
        body: JSON.stringify(params)
      };

      request.post(options, function(err, response, body){
        if (err) {
          debug(err.message);
          debug('error: '+ response.statusCode);
          callback(err);
        } else if (response.statusCode == 200) {
          debug(body);
          callback(null, 'Kintoneに書き出しました。');
        } else {
          debug('error: '+ response.statusCode);
          debug(body);
          debug(body.errors.app.messages);
          callback(new Error('Kintoneへ書き出し中に、エラーが発生しました。'));
        }
      });
    },

  ], function(err, results) {
    if (err) {
      debug('ERROR:'+err.message);
      next(err);
    } else {
      debug(results);
      debug(_json);
      res.sendStatus(200);
    }
  });
});

module.exports = router;
