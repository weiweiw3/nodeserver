var fbutil = require('./fbutil');
var DynamicPathMonitor = require('./DynamicPathMonitor');
var today = new Date();

function A0001Monitor(firebaseUrl, path) {
    this.event = 'A0001';
    this.path = path;
    this.ref = fbutil.fbRef(firebaseUrl, path.messageRoot + '/' + this.event); //root of E0001 events
    this.userRootRef = fbutil.fbRef(firebaseUrl, path.userRoot);
    this.usermappingRef = fbutil.fbRef(firebaseUrl, path.usermappingRoot);
    this.rootRef = fbutil.fbRef(firebaseUrl, '/');


    console.log('Indexing %s/%s using path "%s"'.grey,
        path.index, path.type, fbutil.pathName(this.ref));

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

A0001Monitor.prototype = {

    _init: function() {
        this.addMonitor = this.ref.on('child_added',
            this._process.bind(this, this._childAdded));

        this.changeMonitor = this.ref.on('child_changed',
            this._process.bind(this, this._childChanged));

        this.removeMonitor = this.ref.on('child_removed',
            this._process.bind(this, this._childRemoved));
    },

    updateMessage: function(key) {
        var self = this;
        var ServeruserId = key;
        var FBuserId, UserMessageRef;
        var rootRefStr = self.rootRef.toString();

        //将 Server User 100001的Event/A0001/100001
        //更新到FB User simplelogin:25下面user/simplelogin:25/setting/mapping/SAPUser
        //中间要利用UserList/100001/FBUser:simplelogin:25进行User映射
        self.usermappingRef.child(ServeruserId).once('value', function(snap) {


            if (snap.child(self.path.usermapping_FBuser_field).exists()) {

                FBuserId = snap.child(self.path.usermapping_FBuser_field).val();

                UserMessageRef = self.userRootRef.child(FBuserId)
                    .child(self.path.user_message_field).child(self.event);

                insertA0001Message();
               
            }


            function insertA0001Message() {

                self.ref.child(ServeruserId).once('value', function(snap) {
                    
                    var HeadData = {
                                    "user":snap.child('TASK_INFO/sap_USER').val(),
                                    "message":snap.child('RETURN/message').val(),
                                    "task_status":snap.child('TASK_INFO/task_status').val(),
                                    "date":snap.child('TASK_INFO/endTime').val()
                                };
                                //in user/simplelogin:25/setting/mapping/SAPUser insert message数据
                                
                                var SAPUser_ref = self.userRootRef.child(FBuserId)
                                                .child('setting/mapping/SAPUser');
                                                
                                SAPUser_ref.child('last').transaction(function(currentData) {
                                    return HeadData;
                                }, function(error, committed, snapshot) {
                                    if (error) {
                                        console.log('Transaction failed abnormally!', error);
                                    }
                                    else if (!committed) {
                                        console.log('We aborted the transaction (because records already exists).');
                                    }
                                    else {
                                                if(HeadData.task_status == '3'){
                                                    SAPUser_ref.child('valid').set(true);
                                                }else{
                                                    SAPUser_ref.child('valid').set(false);
                                                }
        
                                        console.log(FBuserId + '/ added!'.green);
                                    }
                                });
                    });
            }
        });

    },
    deleteMessage: function(key) {
       
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
        // console.log('_childAdded'.green, this.index, this.type, data, key);
        this.updateMessage(key);
        // this.deleteMessage(key);
    },

    _childChanged: function(key, data) {
        var name = nameFor(this, key);
        this.updateMessage(key);
        //  console.log('_childChanged'.green, this.index, this.type, name, key);
        // this.deleteMessage(key);
    },

    _childRemoved: function(key, data) {
        var name = nameFor(this, key);
        var self = this;
        this.updateMessage(key);
        // this.deleteMessage(key);


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
        new A0001Monitor(firebaseUrl, pathProps);
    });
    if (dynamicPathUrl) {
        console.log('dynamicPathUrl'.green, dynamicPathUrl);
        new DynamicPathMonitor(fbutil.fbRef(firebaseUrl, dynamicPathUrl), function(pathProps) {
            return new A0001Monitor(firebaseUrl, pathProps);
        });
    }
};
