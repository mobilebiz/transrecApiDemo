var express = require('express');
var router = express.Router();

var config = require('config')
  , Log = require('log')
  , log = new Log(config.logMode)
  , moment = require('moment')
  , fs = require('fs')
  , debug = require('debug')('index.js')
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
  var _url = null;
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

    // Kintoneにデータを保存する
    function(callback) {
      var request = require('request');
      var params = {
        "app": 1,
        "record": {
          "calledDate": { "value": moment(_json.calledDate, "YYYY/MM/DD HH:mm:ss").utc().format() },
          "phoneNum": { "value": _json.from },
          "message": { "value": _json.message },
          "mp3": { "value": _url }
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
        body: params
      };

      request.post(options, function(err, response, body){
        if (err) {
          debug(response.statusCode + ':' + err.message);
          callback(err);
        } else if (response.statusCode == 200) {
          callback(null, 'Kintoneに書き出しました。'+body);
        } else {
          debug(response.statusCode + ':' + body);
          callback(new Error('Kintoneへ書き出し中に、エラーが発生しました。'));
        }
      });
    },

  ], function(err, results) {
    if (err) {
      next(err);
    } else {
      debug(results);
      res.sendStatus(200);
    }
  });
});

module.exports = router;
