var fbutil = require('./fbutil');
var DynamicPathMonitor = require('./DynamicPathMonitor');
var today = new Date();

function PathMonitor(firebaseUrl, path) {
    this.event='E0001';
    this.path=path;
    this.ref = fbutil.fbRef(firebaseUrl, path.messageRoot+'/'+this.event); //root of E0001 events
    this.userRef = fbutil.fbRef(firebaseUrl, path.userRoot);
    this.usermappingRef = fbutil.fbRef(firebaseUrl, path.usermappingRoot);
    this.rootRef = fbutil.fbRef(firebaseUrl);
    

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

PathMonitor.prototype = {

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

        //将 Server User 100001的Event/E0001/100001/02_PU/PO_HEADERS/4500017496
        //更新到FB User simplelogin:25下面user/simplelogin:25/messages/E0001/02_PU/4500017496
        //中间要利用UserList/100001/FBUser:simplelogin:25进行User映射
        self.usermappingRef.child(ServeruserId).once('value', function(snap) {
            
            FBuserId = snap.child(self.path.usermapping_FBuser_field).val();
            
            UserMessageRef = self.userRef.child(FBuserId).child(self.path.user_message_field).child(self.event);
            
            self.ref.child(ServeruserId).once('value', function(snap) {
                snap.forEach(function(childsnap) {
                    //here childsnap is release group, e.g., 02_PU
                    var groupId = childsnap.key();
                    var groupRef = childsnap.ref();

                    childsnap.child('PO_HEADERS')
                        .forEach(function(POHeader_childsnap) {

                            var POId = POHeader_childsnap.key();

                            var User_PORef = UserMessageRef.child(groupId).child(POId);
                            var POHRefStr, POIRefStr;

                            groupRef.child('PO_HEADERS').child(POId)
                                .on('value', function(POHRefSnapshot) {
                                    POHRefStr = POHRefSnapshot.ref().toString();
                                });

                            groupRef.child('PO_ITEMS').child(POId)
                                .on('value', function(POIRefSnapshot) {
                                    POIRefStr = POIRefSnapshot.ref().toString();
                                });

                            var messageData = {
                                "date": today.valueOf(),
                                "favorite": false,
                                "id": key,
                                "metadata": {
                                    "a": "a",
                                    "b_c": 123.23
                                },
                                "read": false,
                                "visible": true,
                                'release_group': groupId,
                                'POHRef': POHRefStr.substring(rootRefStr.length + 1, POHRefStr.length),
                                'POIRef': POIRefStr.substring(rootRefStr.length + 1, POIRefStr.length)

                            };


                            //插入数据
                            User_PORef.transaction(function(currentData) {
                                if (currentData === null) {
                                    return messageData;
                                }
                                else {
                                    return; // Abort the transaction.
                                }
                            }, function(error, committed, snapshot) {
                                if (error) {
                                    console.log('Transaction failed abnormally!', error);
                                }
                                else if (!committed) {
                                    console.log('We aborted the transaction (because ' + FBuserId + '/' + groupId + '/' + POId + ' already exists).');
                                }
                                else {
                                    console.log(FBuserId + '/' + groupId + '/' + POId + ' added!'.green);
                                }
                                // console.log("data: ", snapshot.val());
                            });

                        });
                });
            });
        });





    },
    deleteMessage: function(key) {
        var self = this;
        var ServeruserId = key;
        var FBuserId, UserMessageRef;
        var rootRefStr = self.rootRef.toString();

        //当 Server User 100001的Event/E0001/100001/02_PU/PO_HEADERS/4500017496被删除
        //对应的删除FB User simplelogin:25下面user/simplelogin:25/messages/E0001/02_PU/4500017496
        //中间要利用UserList/100001/FBUser:simplelogin:25进行User映射

        self.usermappingRef.child(ServeruserId).once('value', function(snap) {
            FBuserId = snap.child('FBUser').val();
            UserMessageRef = self.userRef.child(FBuserId).child('messages/E0001');

            UserMessageRef.once('value', function(snap) {
                snap.forEach(function(childsnap) {

                    var groupId = childsnap.key();
                    var groupRef = childsnap.ref();

                    childsnap.forEach(function(PO_childsnap) {
                        var User_PORef = PO_childsnap.ref();
                        var POHUrl = PO_childsnap.child('POHRef').val();
                        var POHRef = self.ref.root().child(POHUrl);

                        POHRef.once('value', function(snap) {

                            var POexist = snap.exists();

                            //删除对应的message数据
                            var onComplete = function(error) {
                                if (error) {
                                    console.log('Synchronization failed');
                                }
                                else {
                                    console.log(POHUrl, 'Synchronization succeeded');
                                }
                            };

                            if (POexist === false) {
                                User_PORef.remove(onComplete);
                            }


                        });
                    });
                });
            });
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
        new PathMonitor(firebaseUrl, pathProps);
    });
    if (dynamicPathUrl) {
        console.log('dynamicPathUrl'.green, dynamicPathUrl);
        new DynamicPathMonitor(fbutil.fbRef(firebaseUrl, dynamicPathUrl), function(pathProps) {
            return new PathMonitor(firebaseUrl, pathProps);
        });
    }
};
