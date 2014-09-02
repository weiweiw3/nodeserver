var today = new Date();
var companyId = "40288b8147cd16ce0147cd236df20000";
var http = require('http');
var conf = require('../config');
var request_timer = null,
    req = null;
http.ClientRequest.prototype.setTimeout = function(timeout, callback) {
    var self = this;
    if (callback) {
        self.on('timeout', callback);
    }
    self.connection.setTimeout(timeout, function() {
        self.abort();
        self.emit('timeout');
    });
};

function httpRequest(postData, postOptions, callback) {
    
    console.log('postData: %s, postOptions: %s'.grey,postData,JSON.stringify(postOptions));
    // 请求5秒超时
    request_timer = setTimeout(function() {
        post_req.abort();
        console.log('Request Timeout.');
    }, 5000);
    // Set up the request
    var post_req = http.request(postOptions, function(res) {
        clearTimeout(request_timer);
        // 等待响应60秒超时
        var response_timer = setTimeout(function() {
            res.destroy();
            console.log('Response Timeout.'.red);
        }, 60000);
        console.log("Got response: %d ".green, res.statusCode);
        res.setEncoding('utf8');
        var response = "";
        res.on('data', function(chunk) {
            console.log("Response [CHUNK!]: ".green);
            console.log("%s ".grey, chunk);
            response = chunk;
        });
        res.on("end", function() {
            clearTimeout(response_timer);
            console.log("End of Request".green);
            callback(response);
        });
    });

    post_req.on('error', function(e) {
        // 响应头有错误
        clearTimeout(request_timer);
        console.log("Got error: " + e.message);
        console.log('problem with request: '.red + e.message);
        //specific error treatment
    });
    // post the data
    post_req.write(postData);
    post_req.end();
}

exports.createTask = function(codestring, callback) {

    // Build the post string from an object
    var post_data = JSON.stringify(codestring);
    // An object of options to indicate where to post to
    var post_options = {
        host: conf.RESTUrl.host,
        port: conf.RESTUrl.port,
        path: conf.RESTUrl.create_path(),
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': post_data.length
        }
    };
    httpRequest(post_data, post_options, getResult);

    function getResult(response) {
        var obj = JSON.parse(response);
        var newTaskId = obj['id'];
        callback(newTaskId);
    }

}

exports.updateTask = function(codestring, callback) {

    // Build the post string from an object
    var post_data = JSON.stringify(codestring);
    
    // An object of options to indicate where to post to
    var post_options = {
        host: conf.RESTUrl.host,
        port: conf.RESTUrl.port,
        path: conf.RESTUrl.update_path(),
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': post_data.length
        }
    };
    
    httpRequest(post_data, post_options, getResult);

    function getResult(response) {
        // var obj = JSON.parse(response);
        console.log(response);
        // var newTaskId = obj['id'];
        // callback(obj);
    }

}
exports.deleteTask = function(codestring, callback) {

    // Build the post string from an object
    var path =conf.RESTUrl.delete_path();
    path = path +'companyId='+codestring.companyId+'&id='+codestring.id;
    console.log(path);
    // An object of options to indicate where to post to
    var post_options = {
        host: conf.RESTUrl.host,
        port: conf.RESTUrl.port,
        path: path,
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json'
        }
    };
    
    httpRequest("", post_options, getResult);

    function getResult(response) {
        // var obj = JSON.parse(response);
        console.log(response);
        // var newTaskId = obj['id'];
        // callback(obj);
    }

}