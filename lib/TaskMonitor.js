var fbutil = require('./fbutil');
var DynamicPathMonitor = require('./DynamicPathMonitor');
var today = new Date();
var restURL = {
    host: 'http://121.40.128.254',
    port: '8080',
    path: '/data-app/rs/task/createTask'
};

var companyId = "40288b8147cd16ce0147cd236df20000";
var querystring = require('querystring');
var http = require('http');
var fs = require('fs');
// {
// "eventType": "E0001",
// "companyId": "40288b8147cd16ce0147cd236df20000",
// "userId": 1,
// "triggerTime": "immediate",
// "taskPriority": 0,
// "taskStatus": "3",
// "inputParas": "REL_GROUP=02;REL_CODE=PU;ITEMS_FOR_RELEASE=X",
// "listTaskLogs": []
// }


function TaskMonitor(firebaseUrl, path) {
    this.ref = fbutil.fbRef(firebaseUrl, path.path);
    this.ref1 = fbutil.fbRef(firebaseUrl, "logs");
    this.taskRef = fbutil.fbRef(firebaseUrl, "tasks");


    console.log('Indexing %s/%s using path "%s"'.grey,
        path.index, path.type, fbutil.pathName(this.ref));

    this.index = path.index;
    this.type = path.type;
    this.filter = path.filter || function() {
        return true;
    };
    this.parse = path.parser || function(data) {
        return parseKeys(data, path.fields, path.omit)
    };

    this._init();
}


TaskMonitor.prototype = {
    _init: function() {
        this.addMonitor = this.ref.on('child_added',
            this._process.bind(this, this._childAdded));
        this.changeMonitor = this.ref.on('child_changed',
            this._process.bind(this, this._childChanged));
        this.removeMonitor = this.ref.on('child_removed',
            this._process.bind(this, this._childRemoved));
    },
    addTask: function(key) {
        var self = this;
        var userlist, snapdata, component;

        this.ref.child(key).once('value', function(snap) {
            snapdata = snap.val();
            snapdata.companyId = companyId;
            console.log('task'.green, snapdata);
            PostCode(snapdata);
        });

        function PostCode(codestring) {
            var response = "";
            // Build the post string from an object
            // var post_data = querystring.stringify({
            //     'compilation_level': 'ADVANCED_OPTIMIZATIONS',
            //     'output_format': 'json',
            //     'output_info': 'compiled_code',
            //     'warning_level': 'QUIET',
            //     'js_code': codestring
            // });
            var post_data = JSON.stringify(codestring);
            // An object of options to indicate where to post to
            var post_options = {
                host: restURL.host,
                port: restURL.port,
                path: restURL.path,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': post_data.length
                }
            };

            // Set up the request
            var post_req = http.request(post_options, function(res) {
                res.setEncoding('utf8');
                res.on('data', function(chunk) {
                    response = response + chunk;
                    console.log('Response [CHUNK!]: ' + chunk);
                });
                res.on("end", function() {
                    console.log("Response: " + response);
                });
            });

            // post the data
            // post_req.write(post_data);
            // post_req.end();

        }

    },
    _stop: function() {
        this.ref.off('child_added', this.addMonitor);
        this.ref.off('child_changed', this.changeMonitor);
        this.ref.off('child_removed', this.removeMonitor);
    },

    _process: function(fn, snap) {
        var dat = snap.val();
        //   if( this.filter(dat) ) {
        fn.call(this, snap.name(), this.parse(dat));
        //   }
    },

    _childAdded: function(key, data) {
        var name = nameFor(this, key);
        this.addTask(key);

        console.log('_childAdded'.green, this.index, this.type, data, key);

    },

    _childChanged: function(key, data) {
        var name = nameFor(this, key);
        // this.updateMessage(key);

        console.log('_childChanged'.green, this.index, this.type, data, key);

    },

    _childRemoved: function(key, data) {
        var name = nameFor(this, key);
        
        console.log('_childRemoved'.red, name, this.index, this.type, data, key);

    }
};



function nameFor(path, key) {
    return path.index + '/' + path.type + '/' + key;
}

function parseKeys(data, fields, omit) {
    if (!data || typeof(data) !== 'object') {
        return data;
    }
    var out = data;
    // restrict to specified fields list
    if (Array.isArray(fields) && fields.length) {
        out = {};
        fields.forEach(function(f) {
            if (data.hasOwnProperty(f)) {
                out[f] = data[f];
            }
        })
    }
    // remove omitted fields
    if (Array.isArray(omit) && omit.length) {
        omit.forEach(function(f) {
            if (out.hasOwnProperty(f)) {
                delete out[f];
            }
        })
    }
    return out;
}

exports.process = function(firebaseUrl, paths, dynamicPathUrl) {
    console.log(firebaseUrl, paths, 'dynamicPathUrl'.green, dynamicPathUrl);

    paths && paths.forEach(function(pathProps) {
        new TaskMonitor(firebaseUrl, pathProps);
    });
    if (dynamicPathUrl) {
        console.log('dynamicPathUrl'.green, dynamicPathUrl);
        new DynamicPathMonitor(fbutil.fbRef(firebaseUrl, dynamicPathUrl), function(pathProps) {
            return new TaskMonitor(firebaseUrl, pathProps);
        });
    }
};
