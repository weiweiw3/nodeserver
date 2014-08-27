var fbutil = require('./fbutil');
var DynamicPathMonitor = require('./DynamicPathMonitor');
var today = new Date();

function PathMonitor(firebaseUrl, path) {
    this.ref = fbutil.fbRef(firebaseUrl, path.path);
    this.ref1 = fbutil.fbRef(firebaseUrl, "logs");
    this.userRef = fbutil.fbRef(firebaseUrl, "users");


    console.log('Indexing %s/%s using path "%s"'.grey, path.index, path.type, fbutil.pathName(this.ref));

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


PathMonitor.prototype = {
    _init: function() {
        this.addMonitor = this.ref.on('child_added', this._process.bind(this, this._childAdded));
        this.changeMonitor = this.ref.on('child_changed', this._process.bind(this, this._childChanged));
        this.removeMonitor = this.ref.on('child_removed', this._process.bind(this, this._childRemoved));
    },
    updateMessage: function(key) {
        var self = this;
        var userlist, snapdata, component;

        this.ref.child(key).once('value', function(snap) {
            snapdata = snap.val();
            userlist = snapdata.authUsers;
            component = snapdata.component;
        });

        function userCreated(userId, success) {
            if (!success) {
                console.log(userId + "'s " + component + " message already exists!");
            }
            else {
                console.log('Successfully created ' + userId);
            }
        }

        var messageData = {
            "date": today.valueOf(),
            "favorite": false,
            "id": key,
            "metadata": {
                "a": "a",
                "b_c": 123.23
            },
            "read": false,
            "visible": true
        }
        userlist.forEach(function(userId) {
                self.userRef.child(userId).child('messages').child(component).child(key)
                    .transaction(function(currentUserData) {
                        if (currentUserData === null)
                            return messageData;
                    }, function(error, committed) {
                        userCreated(userId, committed);
                    });
            }

        );
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
        this.updateMessage(key);

        console.log('_childAdded'.green, this.index, this.type, data, key);

    },

    _childChanged: function(key, data) {
        var name = nameFor(this, key);
        this.updateMessage(key);

        console.log('_childChanged'.green, this.index, this.type, data, key);

    },

    _childRemoved: function(key, data) {
        var name = nameFor(this, key);
        var self = this;


        var userlist = data.authUsers;
        var component = data.component;

        function userRemove(userId, message, success) {
            if (!success) {
                console.log(userId + "'s message " + message + "already deleted!");
            }
            else {
                console.log('Successfully remove ' + userId + "'s " + message);
            }
        }

        userlist.forEach(function(userId) {
                self.userRef.child(userId).child('messages').child(component).child(key)
                    .transaction(function(currentUserData) {
                        // if (currentUserData !== null)
                        return null;
                    }, function(error, committed) {
                        userRemove(userId, key, committed);
                    });
            }

        );
        console.log('deleted'.cyan, name);
        console.log('_childRemoved'.red, name, this.index, this.type, data, key);
        // this.esc.deleteDocument(this.index, this.type, key, function(error, data) {
        //    if( error ) {
        //       console.error('failed to delete %s: %s'.red, name, error);
        //    }
        //    else {
        //       console.log('deleted'.cyan, name);
        //    }
        // })
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
        new PathMonitor(firebaseUrl, pathProps);
    });
    if (dynamicPathUrl) {
        console.log('dynamicPathUrl'.green, dynamicPathUrl);
        new DynamicPathMonitor(fbutil.fbRef(firebaseUrl, dynamicPathUrl), function(pathProps) {
            return new PathMonitor(firebaseUrl, pathProps);
        });
    }
};
