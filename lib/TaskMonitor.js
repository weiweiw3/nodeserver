var fbutil = require('./fbutil');
var DynamicPathMonitor = require('./DynamicPathMonitor');
var today = new Date();
var restURL = {
    host: '121.40.128.254',
    port: '8080',
    path: '/data-app/rs/task/createTask'
};

var companyId = "40288b8147cd16ce0147cd236df20000";
var querystring = require('querystring');
var http = require('http');

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
        // var self = this;
        var snapdata;
        var self = this;
        self.ref.child(key).once('value', function(snap) {
            snapdata = snap.val();
            var taskId = snapdata.taskId;
            var metadata = snapdata.metadata;

            //Post new task to server
            if (!taskIdisDefined(taskId)) {

                metadata.companyId = companyId;
                PostTask(metadata, myCallback);
            }

        });

        function taskIdisDefined(taskId) {

            if ((typeof taskId !== 'undefined') && (taskId !== null)) {
                taskId = taskId.toString();
                if (taskId.length > 0) {
                    return true;
                }
            }
            return false
        }

        function myCallback(taskId) {
            var onComplete = function(error) {
                if (error) {
                    console.log('Synchronization failed %s'.red, error);
                }

            };

            if (taskIdisDefined(taskId)) {

                console.log("taskId: %d is created".green, taskId);
                taskId = taskId.toString();
                self.ref.child(key).child('status').set('sendOut', onComplete);
                self.ref.child(key).child('last').set(today.valueOf(), onComplete);
                self.ref.child(key).child('taskId').set(taskId, onComplete);
            }
        }

        function PostTask(codestring, callback) {
            var response = "";

            // Build the post string from an object
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
                    // if (typeof chunk == 'object') {
                    console.log("Response [CHUNK!]: %s ".grey, chunk);
                    var obj = JSON.parse(chunk);

                    callback(obj['id']);

                    // }
                });
                res.on("end", function() {
                    // console.log("Response: ".green + response);
                    console.log("End of Request".green);
                });
            });
            post_req.on('error', function(e) {
                console.log('problem with request: '.red + e.message);

            });
            // post the data
            post_req.write(post_data);
            post_req.end();

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


        console.log('%s _childAdded'.green, key);
        console.log('%s %s %s '.grey, this.index, this.type, data);
        this.addTask(key);
    },

    _childChanged: function(key, data) {
        var name = nameFor(this, key);

        console.log('%s _childChanged'.green, key);
        console.log(this.index, this.type, data);
        // '%s %s %o '.grey, 
    },

    _childRemoved: function(key, data) {
        var name = nameFor(this, key);

        console.log('%s _childRemoved'.red, key);
        console.log('%s %s %s %s'.grey, name, this.index, this.type, data);

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
