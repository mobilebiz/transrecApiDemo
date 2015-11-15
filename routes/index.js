var express = require('express');
var router = express.Router();

var config = require('config')
  , Log = require('log')
  , log = new Log(config.logMode)
  , moment = require('moment')
;

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'TRANSREC RESTful API Demo page.' });
});

/* POST ping */
router.post('/ping', function(req, res, next) {
  log.debug('/ping called.');

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
          var fs = require('fs');
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

  ], function(err, results) {
    if (err) {
      next(err);
    } else {
      log.debug(results);
      log.info(_json);
      res.sendStatus(200);
    }
  });
});

module.exports = router;
