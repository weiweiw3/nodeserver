var fbutil = require('./fbutil');
var DynamicPathMonitor = require('./DynamicPathMonitor');
var today = new Date();
var companyId = "40288b8147cd16ce0147cd236df20000";

var REST = require("./RESTutil.js");

function TaskMonitor(firebaseUrl, path, REST_URL) {
    this.REST_URL = REST_URL;
    this.ref = fbutil.fbRef(firebaseUrl, path.path);
    this.ref1 = fbutil.fbRef(firebaseUrl, "logs");
    this.taskRef = fbutil.fbRef(firebaseUrl, "tasks");
    this.taskHisRef = fbutil.fbRef(firebaseUrl, "tasksHistory");
    // console.log('Indexing %s/%s using path "%s"'.grey,
    //     path.index, path.type, fbutil.pathName(this.ref));

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

function taskIdisDefined(taskId) {

    if ((typeof taskId !== 'undefined') && (taskId !== null)) {
        taskId = taskId.toString();
        if (taskId.length > 0) {
            return true;
        }
    }
    return false
}

TaskMonitor.prototype = {
    _init: function() {
        this.addMonitor = this.taskRef.on('child_added',
            this._process.bind(this, this._childAdded));
        this.changeMonitor = this.taskRef.on('child_changed',
            this._process.bind(this, this._childChanged));
        this.removeMonitor = this.taskRef.on('child_removed',
            this._process.bind(this, this._childRemoved));
    },
    // updateTask: function(key, data) {
    //     var taskId = data.taskId;
    //     var metadata = data.metadata;

    //     //Post new task to server
    //     if (taskIdisDefined(taskId)) {
    //         metadata.companyId = companyId;
    //         metadata.id = taskId;
    //         REST.updateTask(metadata, myCallback);
    //     }

    //     function myCallback(taskId) {
    //         console.log('myCallback');
    //     }

    // },
    // deleteTask: function(data) {

    //     var taskId = data.taskId;
    //     var metadata = {};
    //     if (taskIdisDefined(taskId)) {
    //         metadata.companyId = companyId;
    //         metadata.id = taskId;
    //         REST.updateTask(metadata, myCallback);
    //     }

    //     function myCallback(taskId) {
    //         console.log('myCallback');
    //     }

    // },
    
    addTask: function(key, data) {
        var self = this;
        var taskId = key;
        // var metadata.companyId = companyId;
        self.taskHisRef.child(key).once('value',function(snap){
            // var x=;
            if(!snap.exists()){

                REST.createTask(data, myCallback);
                
            }    

        });
        
        
        // self.ref.child(key).once('value', function(snap) {
        //     var snapdata = snap.val();
        //     var taskId = snapdata.taskId;
        //     var metadata = snapdata.metadata;

        //     //Post new task to server
        //     if (!taskIdisDefined(taskId)) {
        //         metadata.companyId = companyId;
        //         REST.createTask(metadata, myCallback);
        //     }

        // });

        function myCallback(taskId) {
            var onComplete = function(id, error) {
                if (error) {
                    console.log('%s Synchronization failed : %s'.red, id, error);
                }
                else {
                    console.log('taskId: %s has been synced'.green, id);
                }

            };
            //if the new task has been created in the server, the information will
            //be updated in the node.
            if (taskIdisDefined(taskId)) {
                taskId = taskId.toString();
                self.taskHisRef.child(key).update({
                    'status': 'sendToServer',
                    'last': today.valueOf(),
                    'taskIdinServer': taskId
                }, onComplete(taskId));
            }
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
        fn.call(this, snap.key(), this.parse(dat));
        //   }
    },

    _childAdded: function(key, data) {
        var name = nameFor(this, key); //name includes index, type,key
        console.log('%s childAdded'.green, name);
        console.log('%s '.grey, JSON.stringify(data));
        this.addTask(key, data);
    },

    _childChanged: function(key, data) {
        var name = nameFor(this, key);
        console.log('%s childChanged'.green, name);
        console.log('%s '.grey, JSON.stringify(data));
        this.addTask(key, data);

        // this.updateTask(key, data);
    },

    _childRemoved: function(key, data) {
        var name = nameFor(this, key);
        console.log('%s childRemoved'.red, name);
        console.log('%s '.grey, JSON.stringify(data));
        // this.deleteTask(data);
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

exports.process = function(firebaseUrl, paths, dynamicPathUrl, RESTUrl) {
    paths && paths.forEach(function(pathProps) {
        new TaskMonitor(firebaseUrl, pathProps, RESTUrl);
    });
    if (dynamicPathUrl) {
        console.log('dynamicPathUrl'.green, dynamicPathUrl);
        new DynamicPathMonitor(fbutil.fbRef(firebaseUrl, dynamicPathUrl),
            function(pathProps) {
                return new TaskMonitor(firebaseUrl, pathProps);
            });
    }
};
