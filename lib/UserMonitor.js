var fbutil = require('./fbutil');
var DynamicPathMonitor = require('./DynamicPathMonitor');
var today = new Date();

function UserMonitor(firebaseUrl, path) {
    this.userListRef = fbutil.fbRef(firebaseUrl, 'UserList');
    this.userRootRef = fbutil.fbRef(firebaseUrl, 'users');

    this.index = path.index;
    this.type = path.type;
    this.filter = path.filter || function() {
        return true;
    };
    this.parse = path.parser || function(data) {
        return parseKeys(data, path.fields, path.omit);
    };

    this._init();
}

UserMonitor.prototype = {

    _init: function() {
        this.addMonitor = this.userListRef.on('child_added',
            this._process.bind(this, this._childAdded));

        this.changeMonitor = this.userListRef.on('child_changed',
            this._process.bind(this, this._childChanged));

        this.removeMonitor = this.userListRef.on('child_removed',
            this._process.bind(this, this._childRemoved));
    },

    createUser: function(key, data) {
        var self = this;
        var userId = key;
        var rootRef = self.userListRef.root();

        //根据userlist下新建用户创建FB用户 userlist/100001/
        createFBUser(userId, data.email.toString(), data.password.toString());
        
        function addFBUser(uid){
            self.userListRef.child(key).child('FBUser').set(uid);
            self.userRootRef.child(key).child('FBUser').set(uid);
        }
        
        function checkUserRoot(ref, userId) {
            var InitialUserRootData = {
                'setting': {
                    'SAP': 'xx',
                    'User': 'cc',
                    'PW': 'cc'
                }
            };

            ref.child('initial').transaction(function(currentData) {
                if (currentData === null) {
                    return InitialUserRootData;
                }
                else {
                    return; // Abort the transaction.
                }
            }, function(error, committed, snapshot) {
                if (error) {
                    console.log('Transaction failed abnormally!', error);
                }
                else if (!committed) {
                    console.log('We aborted the transaction (because ' + userId + ' already exists).');
                }
                else {
                    console.log(userId + ' root information added!'.green);
                }
                // console.log("data: ", snapshot.val());
            });
        }


        function createFBUser(userId, email, password, UserName) {
            rootRef.createUser({
                email: email,
                password: password
            }, function(error,authData) {
                if (error) {
                    switch (error.code) {
                        case "EMAIL_TAKEN":
                            {
                                console.log("The new user account cannot be created because the email is already in use.");
                                break;
                            }
                        case "INVALID_EMAIL":
                            console.log("The specified email is not a valid email.");
                            break;
                        default:
                            console.log("Error creating user:", error);
                    }
                }
                else {
                    
                    console.log("User account " + userId + " created successfully!",authData);
                    addFBUser(authData.uid);
                    
                }
            });
        }


    },

    deleteUser: function(key, data) {
        var self = this;
        var userId = key;
        var rootRef = self.userListRef.root();
        //根据userlist下移除用户删除FB用户 userlist/100001/


        rootRef.removeUser({
            email: data.email.toString(),
            password: data.password.toString()
        }, function(error) {
            if (error) {
                switch (error.code) {
                    case "INVALID_USER":
                        console.log("The specified user account does not exist.");
                        break;
                    case "INVALID_PASSWORD":
                        console.log("The specified user account password is incorrect.");
                        break;
                    default:
                        console.log("Error removing user:", error);
                }
            }
            else {
                console.log("User account " + userId + " deleted successfully!");
            }
        });



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
        var name = nameFor(this, key);
        console.log('_childAdded'.green, this.index, this.type, data, key);
        this.createUser(key, data);
        // 
    },

    _childChanged: function(key, data) {
        var name = nameFor(this, key);
        // this.createUser(key);
        console.log('_childChanged'.green, this.index, this.type, name, key);
        // this.deleteUser(key);
    },

    _childRemoved: function(key, data) {
        var name = nameFor(this, key);
        var self = this;
        console.log('_childChanged'.red, this.index, this.type, name, key);
        // this.createUser(key);
        this.deleteUser(key, data);


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
        new UserMonitor(firebaseUrl, pathProps);
    });
    if (dynamicPathUrl) {
        console.log('dynamicPathUrl'.green, dynamicPathUrl);
        new DynamicPathMonitor(fbutil.fbRef(firebaseUrl, dynamicPathUrl), function(pathProps) {
            return new UserMonitor(firebaseUrl, pathProps);
        });
    }
};
